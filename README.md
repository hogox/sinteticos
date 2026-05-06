# Sinteticos Lab

Laboratorio local para explorar investigacion sintetica sobre experiencias digitales.

La unidad de trabajo del producto es:

`proyecto -> persona -> task -> run -> evidencia/calibracion`

La idea no es "inventar insights" sino poder simular o ejecutar recorridos, guardar evidencia y distinguir con claridad entre:

- `Observed`: lo que efectivamente quedo registrado en la corrida.
- `Inferred`: la lectura analitica construida a partir de esa evidencia.
- `Predictive`: una capa estimada de atencion visual, nunca equivalente a evidencia real.

## De que se trata

Sinteticos Lab es un workspace de investigacion sintetica local-first para:

- crear proyectos;
- definir personas sinteticas con contexto, restricciones y comportamiento digital;
- asociar tasks o pruebas a esas personas;
- correr runs simulados o de navegacion real;
- revisar screenshots, click paths, heatmaps, scanpaths, hallazgos y preguntas de seguimiento;
- comparar resultados sinteticos con benchmarks humanos mediante calibracion.

La app esta pensada para usar lenguaje operativo y evidencia observable, evitando mezclar prediccion con observacion o responder desde una voz "consultora".

## Vision de esta version rapida local

Esta version parece pensada como una primera iteracion muy liviana para validar el modelo de trabajo sin meter infraestructura pesada.

Objetivos de esta etapa:

- tener una herramienta usable en local;
- poder prototipar rapido nuevas variantes del flujo;
- persistir datos sin depender de una base externa;
- correr pruebas con fallback simulado si no hay runner real disponible;
- guardar artefactos visuales y evidencia suficiente para conversar sobre fricciones;
- mantener guardrails fuertes sobre el tipo de salida y el nivel de certeza.

En otras palabras: primero construir un laboratorio operativo y honesto, despues escalar sofisticacion.

## Principios del proyecto

- `Local-first`: si no hay backend disponible, la UI sigue funcionando con `localStorage`.
- `Honestidad epistemica`: observed, inferred y predictive se muestran por separado.
- `Voz de usuario`: la respuesta sintetica debe hablar en primera persona y desde el rol definido.
- `Evidencia antes que opinion`: especialmente en validacion visual y navegacion.
- `Fallback antes que bloqueo`: si Playwright no esta disponible, el sistema puede seguir con simulacion.

## Como funciona

### 1. Proyectos

Cada proyecto agrupa personas, tasks, runs y calibraciones.

### 2. Personas

Cada persona sintetica incluye:

- rol y segmento;
- contexto funcional y de uso;
- motivaciones, necesidades y fricciones;
- ambiente digital, dispositivos y nivel digital;
- restricciones y herramientas que usa.

### 3. Tasks

Los tasks describen que se quiere validar. Hoy el repo muestra dos tipos principales:

- `navigation`: navegar una URL y tratar de cumplir un objetivo;
- `idea`: reaccionar a una propuesta o feature.

Los tasks pueden activar flags como:

- `mcp_enabled`;
- `predictive_attention_enabled`;
- `artifacts_enabled`.

### 4. Runs

Una corrida genera, segun el modo de ejecucion:

- respuesta sintetica de la persona;
- log de pasos;
- transiciones entre pantallas;
- puntos de click;
- screenshots o artefactos;
- heatmaps y scanpaths observados;
- mapas predictivos de atencion, si estan habilitados.

### 5. Calibration

La calibracion permite contrastar resultados sinteticos con benchmarks humanos, registrar nivel de acuerdo y dejar notas operativas.

## Framework de trabajo

El framework practico del repo hoy es:

1. crear un proyecto;
2. definir una o mas personas;
3. crear tasks por persona;
4. ejecutar runs;
5. revisar evidencia en dashboard;
6. registrar calibraciones contra evidencia humana cuando exista;
7. iterar una nueva version del flujo o de la hipotesis.

La lectura de resultados esta estructurada explicitamente en tres capas:

- `Observed`: evidencia directa del run.
- `Inferred`: interpretacion analitica.
- `Predictive`: saliencia visual estimada.

Ese encuadre es central al proyecto y ayuda a evitar sobreinterpretaciones.

## Ambiente y stack

El proyecto esta hecho con un stack deliberadamente simple:

- frontend en `HTML + CSS + JavaScript` vanilla;
- backend en `Node.js` usando `http` nativo;
- persistencia en archivo JSON (`data/state.json`) cuando corre el servidor;
- modo sin backend con persistencia en `localStorage`;
- automatizacion de navegacion con `Playwright`;
- artefactos visuales guardados en `artifacts/`.

No usa React, Express, Vite ni una base de datos externa.

## Modos de ejecucion

### Modo backend local

Es el modo principal recomendado.

- sirve la UI;
- expone APIs CRUD;
- persiste estado en `data/state.json`;
- puede correr navegacion real con Playwright;
- guarda screenshots y artefactos en `artifacts/`.

### Modo browser-only fallback

Si la UI no encuentra backend, sigue funcionando en modo local:

- usa `localStorage`;
- crea demo data automaticamente;
- permite CRUD y corridas simuladas;
- no depende de Playwright ni de persistencia en archivo.

## Navegacion real

El runner real esta orientado especialmente a flujos de navegacion y tiene bastante logica defensiva para prototipos Figma:

- deteccion de surfaces bloqueantes;
- manejo de cookies;
- intento de destrabar estados de loading o restart;
- deteccion aproximada del frame interactivo;
- captura de screenshots;
- generacion de artefactos de debug.

Si Playwright no esta disponible o la navegacion falla, el sistema cae a un modo simulado o persiste un run de error controlado en vez de romper el flujo completo.

## Levantar el proyecto

### Requisitos

- Node.js con soporte ESM y top-level await.
- `npm`.

### Instalar dependencias

```sh
npm install
```

### Correr la app

```sh
npm run dev
```

La app queda disponible en:

```text
http://localhost:8787
```

### Habilitar navegacion real con Playwright

La dependencia ya existe en el proyecto, pero para correr navegador real puede hacer falta instalar el binario de Chromium:

```sh
npx playwright install chromium
```

Si eso no esta instalado, la app sigue operando con fallback simulado.

## Variables de entorno

| Variable | Default | Descripcion |
|---|---|---|
| `PORT` | `8787` | Puerto del servidor local |
| `ANTHROPIC_API_KEY` | — | API key de Anthropic (requerida para runs con LLM) |
| `SINTETICOS_VISION_MODEL` | `claude-haiku-4-5-20251001` | Modelo usado para analisis visual con vision |
| `SINTETICOS_VISION_LIMIT_USD` | `5` | Limite de gasto en USD para vision por sesion |
| `SINTETICOS_BROWSER_HEADLESS` | `true` | Corre Playwright sin ventana visible. Setear en `false` para ver Chrome durante los runs (util para debug) |

## Datos y persistencia

- `data/state.json`: estado persistido del laboratorio cuando hay backend.
- `artifacts/`: screenshots y artefactos de corridas.
- `localStorage`: fallback de estado cuando la UI corre sin backend.

La app incluye un estado demo inicial para arrancar rapido.

## Estructura del repo

```text
.
├── app.js
├── index.html
├── styles.css
├── server.mjs
├── data/
│   └── state.json
├── artifacts/
├── scripts/
│   └── new-worktree.sh
├── WORKTREES.md
└── version-operacional-validacion-links-cv.md
```

## Workflow de versiones

El repo usa `git worktree` para trabajar variantes en paralelo.

Idea base:

- `main` es la base estable;
- cada variante se trabaja como `version/<nombre>`;
- cada variante vive en un worktree separado;
- si una variante se consolida, se mergea a `main`.

Ejemplo:

```sh
./scripts/new-worktree.sh landing-redesign
```

## Documento operativo complementario

El archivo `version-operacional-validacion-links-cv.md` documenta una version mas enfocada en validacion operacional de links mediante evidencia visual directa.

Ese documento refuerza una idea importante del proyecto: cuando hay computer vision o navegacion, la conclusion debe sostenerse con lo que efectivamente se observa en pantalla.

## Estado actual

Hoy el repo ya cubre:

- CRUD de proyectos, personas, tasks, runs y calibraciones;
- dashboard con filtros;
- separacion visual entre observed, inferred y predictive;
- modo demo seeded;
- runner simulado local;
- runner real con Playwright para navegacion;
- export de estado;
- workflow de versiones con worktrees.

## Limitaciones actuales

- no hay autenticacion ni multiusuario;
- no hay base de datos externa;
- no hay pipeline de build ni framework de frontend;
- la navegacion real esta mas afinada para ciertos casos, especialmente prototipos Figma;
- `predictive attention` es una capa estimada, no una medicion real;
- el alcance actual es de laboratorio local, no de plataforma productiva multiambiente.

## Proximo uso recomendado

Este repo sirve bien para:

- explorar rapidamente una hipotesis UX;
- comparar comportamiento sintetico entre arquetipos;
- validar flujos tempranos en prototipos;
- ordenar evidencia antes de pasar a testing humano;
- documentar fricciones recurrentes y calibrarlas despues.
