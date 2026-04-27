import path from "node:path";
import { promises as fs } from "node:fs";
import { ARTIFACTS_DIR } from "./config.mjs";
import { uid } from "./utils.mjs";
import { hashString, mulberry32 } from "../shared/utils.js";
import {
  composePersonaResponse,
  summarizeRun,
  buildFindings,
  buildFollowUps,
  buildPredictedPoints,
  buildPredictiveNotes
} from "../shared/reporting.js";
import { chooseCandidate } from "./candidates.mjs";
import { executeNavigationRun } from "./navigation-run.mjs";
import {
  parseFigmaPrototypeUrl,
  getFrameNodes,
  getFrameScreenshot,
  nodesToCandidates,
  findTransitionTarget,
  enrichWithTransitions
} from "../figma-mcp-client.mjs";
import { simulateRun } from "../shared/simulation.js";

export async function executeMcpNavigationRun(task, persona, iteration, accessToken, playwright) {
  const figmaInfo = parseFigmaPrototypeUrl(task.url);
  if (!figmaInfo) {
    return executeNavigationRun(task, persona, iteration, playwright);
  }

  const { fileKey, nodeId, startingPointNodeId } = figmaInfo;
  const runId = uid("run");
  const startedAt = new Date();
  const seed = hashString(`${task.id}:${persona.id}:${iteration}:${startedAt.toISOString()}`).toString().slice(0, 6);
  const rng = mulberry32(Number(seed));
  const stepLog = [];
  const clickPoints = [];
  const screenTransitions = [];
  const screenshots = [];
  const runDir = path.join(ARTIFACTS_DIR, runId);
  await fs.mkdir(runDir, { recursive: true });

  let completionStatus = "completed";
  let executionNotes = "Analisis estructural via Figma MCP (REST API).";

  try {
    let currentNodeId = startingPointNodeId || nodeId;
    if (!currentNodeId) {
      const rootData = await getFrameNodes(fileKey, null, accessToken);
      if (!rootData) {
        return mcpFallbackToPlaywright(task, persona, iteration, playwright, "No se pudo obtener la estructura del archivo Figma.");
      }
    }

    let frameData = await getFrameNodes(fileKey, currentNodeId, accessToken);
    if (!frameData || !frameData.nodes.length) {
      return mcpFallbackToPlaywright(task, persona, iteration, playwright, "MCP no devolvio nodos interactivos para el frame solicitado.");
    }

    frameData.nodes = await enrichWithTransitions(frameData.nodes, fileKey, accessToken);
    let currentScreen = frameData.frameName || `Frame ${currentNodeId || "root"}`;

    if (currentNodeId) {
      const initialScreenshot = await getFrameScreenshot(fileKey, currentNodeId, accessToken, runDir, runId, 1);
      if (initialScreenshot) {
        initialScreenshot.screen = currentScreen;
        screenshots.push(initialScreenshot);
      }
    }

    for (let step = 1; step <= (task.max_steps || 5); step += 1) {
      const candidates = nodesToCandidates(frameData.nodes, frameData.frameWidth, frameData.frameHeight);
      const connectedCount = candidates.filter(c => c.hasTransition).length;
      const plan = chooseCandidate(candidates, task, persona, rng, step, null);

      if (!plan) {
        completionStatus = "abandoned";
        stepLog.push({
          step,
          screen: currentScreen,
          action: "abandon",
          reason: "No encontre un objetivo visible o navegable para seguir avanzando.",
          certainty: 34,
          candidateCount: candidates.length,
          connectedCount,
          timestamp: new Date().toISOString()
        });
        break;
      }

      const certainty = Math.max(40, Math.min(92, Math.round(plan.score || 64)));
      clickPoints.push({
        x: Math.round(plan.centerX || plan.x),
        y: Math.round(plan.centerY || plan.y),
        step,
        screen: currentScreen,
        certainty,
        weight: certainty / 100
      });
      stepLog.push({
        step,
        screen: currentScreen,
        action: plan.type === "candidate" ? "click_text" : "click_region",
        reason: plan.reason,
        certainty,
        candidateCount: candidates.length,
        connectedCount,
        timestamp: new Date().toISOString()
      });

      const transitionResult = findTransitionTarget(frameData.nodes, plan, frameData.frameWidth, frameData.frameHeight);
      const nextNodeId = typeof transitionResult === 'string' ? transitionResult : transitionResult?.targetId;
      const navigationFallback = typeof transitionResult === 'object' && transitionResult?.fallback === true;

      if (navigationFallback) {
        stepLog[stepLog.length - 1].navigationFallback = true;
      }

      if (nextNodeId && nextNodeId !== currentNodeId) {
        const nextFrameData = await getFrameNodes(fileKey, nextNodeId, accessToken);
        if (nextFrameData && nextFrameData.nodes.length) {
          const nextScreen = nextFrameData.frameName || `Frame ${nextNodeId}`;
          screenTransitions.push({ from: currentScreen, to: nextScreen, step });
          currentScreen = nextScreen;
          currentNodeId = nextNodeId;
          nextFrameData.nodes = await enrichWithTransitions(nextFrameData.nodes, fileKey, accessToken);
          frameData = nextFrameData;

          const stepScreenshot = await getFrameScreenshot(fileKey, nextNodeId, accessToken, runDir, runId, step + 1);
          if (stepScreenshot) {
            stepScreenshot.screen = nextScreen;
            screenshots.push(stepScreenshot);
          }
        }
      } else if (!nextNodeId) {
        // Reintento: buscar candidato alternativo con transición
        const connectedAlternatives = candidates
          .filter(c => c.hasTransition && c !== plan)
          .sort((a, b) => (b.score || 0) - (a.score || 0));

        let retriedSuccessfully = false;

        if (connectedAlternatives.length > 0) {
          // Intentar con candidatos alternativos (máximo 3 intentos)
          const maxRetries = Math.min(3, connectedAlternatives.length);

          for (let retryAttempt = 0; retryAttempt < maxRetries; retryAttempt += 1) {
            const altPlan = connectedAlternatives[retryAttempt];
            const altTransitionResult = findTransitionTarget(frameData.nodes, altPlan, frameData.frameWidth, frameData.frameHeight);
            const altNextNodeId = typeof altTransitionResult === 'string' ? altTransitionResult : altTransitionResult?.targetId;

            if (altNextNodeId && altNextNodeId !== currentNodeId) {
              // Reintento exitoso
              stepLog[stepLog.length - 1].retried = true;
              stepLog[stepLog.length - 1].retryAttempts = retryAttempt + 1;
              stepLog[stepLog.length - 1].originalText = plan.text;
              stepLog[stepLog.length - 1].retriedText = altPlan.text;

              const nextFrameData = await getFrameNodes(fileKey, altNextNodeId, accessToken);
              if (nextFrameData && nextFrameData.nodes.length) {
                const nextScreen = nextFrameData.frameName || `Frame ${altNextNodeId}`;
                screenTransitions.push({ from: currentScreen, to: nextScreen, step, retried: true, retriedAttempt: retryAttempt + 1 });
                currentScreen = nextScreen;
                currentNodeId = altNextNodeId;
                nextFrameData.nodes = await enrichWithTransitions(nextFrameData.nodes, fileKey, accessToken);
                frameData = nextFrameData;

                const stepScreenshot = await getFrameScreenshot(fileKey, altNextNodeId, accessToken, runDir, runId, step + 1);
                if (stepScreenshot) {
                  stepScreenshot.screen = nextScreen;
                  screenshots.push(stepScreenshot);
                }
                retriedSuccessfully = true;
                break;
              }
            }
          }
        }

        // Si reintento falló o no hay alternativas
        if (!retriedSuccessfully) {
          if (step >= 2) {
            completionStatus = "uncertain";
            const reason = connectedAlternatives.length > 0
              ? ` No se encontraron transiciones validas incluso tras ${Math.min(3, connectedAlternatives.length)} reintentos.`
              : " No hay elementos interactivos con transiciones disponibles.";
            executionNotes += reason;
            break;
          }
          // En step 1, continuar al siguiente paso permitiendo otro intento
        }
      }

      if (step >= 2 && looksStructurallySuccessful(task, plan, currentScreen)) {
        completionStatus = "completed";
        break;
      }

      if (step === (task.max_steps || 5)) {
        completionStatus = "uncertain";
      }
    }

    // Calcular métricas de cobertura del prototipo
    const totalCandidates = stepLog.reduce((sum, s) => sum + (s.candidateCount || 0), 0);
    const totalConnected = stepLog.reduce((sum, s) => sum + (s.connectedCount || 0), 0);
    const coverageRatio = totalCandidates > 0 ? totalConnected / totalCandidates : 1;
    const fallbackSteps = stepLog.filter(s => s.navigationFallback).length;
    const retriedSteps = stepLog.filter(s => s.retried).length;
    const retriedSuccessfully = stepLog.filter(s => s.retried && s.retriedText).length;
    const totalRetryAttempts = stepLog.reduce((sum, s) => sum + (s.retryAttempts || 0), 0);

    const findings = buildFindings(task, persona, completionStatus, rng, {
      totalCandidates,
      totalConnected,
      coverageRatio,
      fallbackSteps,
      retriedSteps,
      retriedSuccessfully,
      totalRetryAttempts
    });
    const endedAt = new Date();
    return {
      id: runId,
      project_id: task.project_id || persona.project_id || null,
      task_id: task.id,
      persona_id: persona.id,
      persona_version: `v${persona.version}`,
      seed,
      status: "done",
      started_at: startedAt.toISOString(),
      ended_at: endedAt.toISOString(),
      completion_status: completionStatus,
      persona_response: composePersonaResponse(persona, task, completionStatus, findings, stepLog.length || 1),
      step_log: stepLog,
      click_points: clickPoints,
      screen_transitions: screenTransitions,
      screenshots,
      debug_artifacts: [],
      observed_heatmaps: [{ screen: currentScreen, points: clickPoints }],
      observed_scanpaths: [{ screen: currentScreen, points: clickPoints }],
      predicted_attention_maps: task.predictive_attention_enabled
        ? [{ screen: currentScreen, points: buildPredictedPoints(rng), notes: buildPredictiveNotes(task, persona) }]
        : [],
      report_summary: summarizeRun(task, persona, completionStatus, findings),
      report_details: {
        primary_screen: screenshots[0] ? screenshots[0].screen : currentScreen,
        interaction_frame: null,
        debug_artifacts: [],
        prioritized_findings: findings,
        prototype_coverage: {
          total_interactive_nodes: totalCandidates,
          nodes_with_transitions: totalConnected,
          coverage_ratio: coverageRatio,
          fallback_steps: fallbackSteps,
          retried_steps: retriedSteps,
          retried_successfully: retriedSuccessfully,
          retry_success_rate: retriedSteps > 0 ? Math.round((retriedSuccessfully / retriedSteps) * 100) : null,
          total_retry_attempts: totalRetryAttempts
        },
        trust_signals: [
          "Estructura de nodos del diseno original via Figma API",
          "Posiciones y jerarquia directas del archivo Figma",
          "Screenshots exportados del frame real"
        ],
        rejection_signals: [
          "Transiciones limitadas al primer destino por nodo (limitacion REST API)",
          "Sin interactividad real del prototipo (analisis estructural)"
        ]
      },
      follow_up_questions: buildFollowUps(task, completionStatus),
      engine: "figma-mcp",
      execution_notes: executionNotes,
      mcp_enabled: true,
      source: "server-mcp"
    };
  } catch (error) {
    console.error("MCP navigation run failed:", error.message);
    return mcpFallbackToPlaywright(task, persona, iteration, playwright, `MCP fallo: ${error.message}`);
  }
}

async function mcpFallbackToPlaywright(task, persona, iteration, playwright, mcpError) {
  try {
    return await executeNavigationRun(task, persona, iteration, playwright);
  } catch (playwrightError) {
    return simulateRun(task, persona, iteration, {
      uid,
      overrides: {
        engine: "mcp-playwright-fallback",
        source: "server",
        execution_notes: `${mcpError}. Playwright tambien fallo: ${playwrightError.message}. Se uso simulacion.`
      },
      useChooseAction: false,
      completionStrategy: "server",
      engineLabel: "mcp-playwright-fallback",
      sourceLabel: "server",
      executionNotes: `${mcpError}. Playwright tambien fallo: ${playwrightError.message}. Se uso simulacion.`
    });
  }
}

function looksStructurallySuccessful(task, plan, currentScreen) {
  const targetText = `${task.prompt} ${task.success_criteria} ${currentScreen} ${plan.text || ""}`.toLowerCase();
  return /checkout|confirm|confirmation|book|reserva|success|done|complete|payment|pago/.test(targetText);
}
