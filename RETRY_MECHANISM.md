# Retry Mechanism: Multi-Attempt Recovery Strategy

## Overview

El mecanismo de reintento es el corazón del sistema de recuperación cuando la navegación inicial falla. Cuando un candidato clickeado NO tiene una transición real, el sistema intenta automáticamente encontrar una alternativa antes de abandonar la pantalla.

## Implementation Details

### 1. Candidato sin transición → Reintento

```
┌─────────────────────────────────────────────────────────┐
│ Step N: Usuario elige "Comprar" (sin transición)        │
├─────────────────────────────────────────────────────────┤
│ nextNodeId = null                                       │
│ ↓                                                       │
│ Buscar connectedAlternatives con hasTransition=true    │
│ Ordenar por score descendente                          │
│ ↓                                                       │
│ Intentar hasta 3 alternativas:                         │
│   Intento 1: "Agregar al carrito" → ✓ ÉXITO           │
│ ↓                                                       │
│ Continuar a siguiente pantalla (mismo step)            │
│ Marcar stepLog con: retried=true, retriedText="..."    │
└─────────────────────────────────────────────────────────┘
```

### 2. Lógica de Decisión por Step

```javascript
if (!nextNodeId) {
  // Obtener candidatos alternativos con transición real
  const connectedAlternatives = candidates
    .filter(c => c.hasTransition && c !== plan)
    .sort((a, b) => (b.score || 0) - (a.score || 0));

  // Intentar hasta 3 alternativas
  for (let retryAttempt = 0; retryAttempt < Math.min(3, connectedAlternatives.length); retryAttempt++) {
    const altPlan = connectedAlternatives[retryAttempt];
    const altNextNodeId = findTransitionTarget(frameData.nodes, altPlan, ...);
    
    if (altNextNodeId) {
      // Reintento exitoso
      stepLog[stepLog.length - 1].retried = true;
      stepLog[stepLog.length - 1].retryAttempts = retryAttempt + 1;
      // Continuar a siguiente frame...
      break;
    }
  }
  
  // Si no hay reintento exitoso:
  // - Step 1: continuar permitiendo otro intento
  // - Step ≥ 2: abandonar con status "uncertain"
}
```

## Data Structures

### stepLog Entry (cuando hay reintento)

```javascript
{
  step: 2,
  screen: "Product Details",
  action: "click_text",
  reason: "Hice click...",
  certainty: 72,
  candidateCount: 12,
  connectedCount: 8,
  // Campos de reintento:
  retried: true,                    // Indica que hubo reintento
  retryAttempts: 2,                 // Número de intentos (1-3)
  originalText: "Comprar",          // Candidato original elegido
  retriedText: "Agregar al carrito" // Candidato alternativo usado
}
```

### screenTransitions Entry (cuando hay reintento)

```javascript
{
  from: "Product Details",
  to: "Shopping Cart",
  step: 2,
  retried: true,              // Indica transición por reintento
  retriedAttempt: 2           // Número del intento que funcionó (1-3)
}
```

### prototype_coverage Metrics

```javascript
prototype_coverage: {
  total_interactive_nodes: 150,
  nodes_with_transitions: 95,
  coverage_ratio: 0.633,
  fallback_steps: 2,           // Pasos donde se usó proximity fallback
  retried_steps: 3,            // Pasos donde se usó reintento
  retried_successfully: 2,     // Reintentos que lograron transición
  retry_success_rate: 67,      // Porcentaje de reintentos exitosos
  total_retry_attempts: 5      // Total de intentos de reintento
}
```

## Findings Generated

### Scenario 1: Retries Successful
```
Label: "Recuperacion exitosa mediante alternativas"
Severity: low (o medium si > 2 steps)
Detail: "En 2 paso(s) el elemento inicial no tenia transicion, 
         pero se recupero usando alternativas (2 intento(s) total)."
```

### Scenario 2: Mixed Results
```
Label: "Recuperacion parcial mediante reintentos"
Severity: low
Detail: "En 3 paso(s) fue necesario reintentar: 
         2 exitosos, 1 fallido. Tasa de exito: 67%."
```

### Scenario 3: All Retries Failed
```
Label: "Reintentos fallidos - bloqueo en navegacion"
Severity: high
Detail: "En 2 paso(s) incluso los reintentos con elementos 
         alternativos no encontraron transiciones validas."
```

## Flow Examples

### ✅ Example 1: Successful Retry

```
Frame: "Product Page"
Candidates:
  1. "Buy Now" (no transition, score: 80)
  2. "Add to Cart" (transition → Cart, score: 75)
  3. "View Details" (no transition, score: 60)

User → Click Plan: "Buy Now"
  ✗ No nextNodeId
  → connectedAlternatives: ["Add to Cart"]
  → Try "Add to Cart": ✓ Found Cart frame
  → Transition: "Product Page" → "Shopping Cart" (retried=true)
  → Mark stepLog.retried = true, retriedText = "Add to Cart"
```

### ❌ Example 2: Failed Retry

```
Frame: "Confirmation"
Candidates:
  1. "Download PDF" (no transition, score: 90)
  2. "View Order" (no transition, score: 70)
  3. "Home" (transition → Home, score: 45)

User → Click Plan: "Download PDF"
  ✗ No nextNodeId
  → connectedAlternatives: ["Home"]
  → Try "Home": ✓ Found Home frame
  → Transition: "Confirmation" → "Home" (retried=true)
  → But "Home" is not desired destination...
  → Still counts as retriedSuccessfully=1
```

### ⚠️ Example 3: No Connected Alternatives

```
Frame: "Payment"
Candidates:
  1. "Submit Payment" (no transition, score: 95)
  2. "Edit Card" (no transition, score: 70)
  3. "Cancel" (no transition, score: 40)

User → Click Plan: "Submit Payment"
  ✗ No nextNodeId
  → connectedAlternatives: [] (empty!)
  → No reintento possible
  → If step ≥ 2: break with status "uncertain"
  → If step = 1: continue to next step allowing another attempt
```

## Tuning Parameters

### Max Retry Attempts
```javascript
const maxRetries = Math.min(3, connectedAlternatives.length);
```
**Default**: 3 attempts per step
**Rationale**: Balance between recovery chances and performance

### Connected Candidates Filter
```javascript
.filter(c => c.hasTransition && c !== plan)
```
**Constraint**: Only nodes with real transitions are considered
**Rationale**: Avoid creating longer chains of failures

### Scoring for Retry Ordering
```javascript
.sort((a, b) => (b.score || 0) - (a.score || 0))
```
**Logic**: Try highest-scored alternatives first
**Rationale**: Candidates with better match to task goals more likely to succeed

## Interaction with Other Mechanisms

### Retry vs. Fallback (Proximity)

**Fallback** occurs when:
- Chosen candidate HAS transition
- But proximity matching fails to find the target
- System picks closest node with transition as fallback

**Retry** occurs when:
- Chosen candidate has NO transition
- System picks alternative candidate WITH transition

```
navigationFallback  = transitionResult has fallback flag
retried             = No initial transition, tried alternatives
```

### Retry vs. Coverage Analysis

**Coverage Ratio** = nodes_with_transitions / total_interactive_nodes

**Retry Metrics** feed into coverage findings:
- Low coverage (< 30%) + high retried_steps → "Prototipo incompleto"
- High retry_success_rate → "Recuperacion exitosa"
- Low retry_success_rate → "Bloqueo en navegacion"

## Performance Implications

### Time Cost
```
- No retry needed: 0 extra API calls
- Successful retry (attempt 1): +1 findTransitionTarget call
- Successful retry (attempt 3): +3 findTransitionTarget calls
- Failed retry: +min(3, connected_count) calls
```

### Typical Metrics
```
5-step run, 10 candidates/step:
- 50 candidates evaluated
- ~3 without transitions (6%)
- ~2 retries needed (4% of steps)
- Total cost: 2 extra findTransitionTarget calls
```

## Debugging & Monitoring

### Key Signals to Monitor

1. **High retriedSuccessfully**: System recovering well from dead ends
2. **Low retry_success_rate**: Prototype has disconnected interactive elements
3. **High retried_steps at step 1**: Task requirements don't align with prototype
4. **totalRetryAttempts > retried_steps**: Multiple attempts per step = poor prototype quality

### Log Analysis

```javascript
// Find runs that needed retries
const runsWithRetries = runs.filter(r => r.report_details.prototype_coverage.retried_steps > 0);

// Analyze retry effectiveness
runsWithRetries.forEach(run => {
  const rate = run.report_details.prototype_coverage.retry_success_rate;
  console.log(`Run ${run.id}: ${rate}% retry success`);
});
```

## Future Enhancements

1. **Adaptive Retry**: Adjust max_retries based on previous failure patterns
2. **Intelligent Fallback**: Consider persona preferences when choosing among alternatives
3. **Breadth-First Search**: If retries fail, explore adjacent frames
4. **Retry Thresholds**: Different strategies for different prototype types

