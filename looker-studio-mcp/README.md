# looker-studio-mcp

Servidor MCP (Model Context Protocol) que permite a Claude leer y modificar un informe de **Looker Studio** (antes Data Studio) abierto en tu navegador Chrome o Edge. Se conecta por el Chrome DevTools Protocol (CDP) usando `puppeteer-core`. No abre ningún navegador por su cuenta: se engancha al que tú lances.

Funciona con los dos dominios: `lookerstudio.google.com/reporting/...` y `datastudio.google.com/reporting/...` (también con el prefijo `/u/<n>/`).

## Requisitos

- Node.js 18 o superior (probado con Node 24).
- Chrome o Microsoft Edge.

## Instalación

```powershell
cd looker-studio-mcp
npm install
npm run build
```

## 1. Lanzar el navegador con CDP

Usa un perfil **separado** (`--user-data-dir`). Chrome y Edge no abren el puerto de depuración si ya hay una instancia corriendo con el mismo perfil.

**Edge (Windows):**

```powershell
& "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe" --remote-debugging-port=9222 --user-data-dir="$env:TEMP\ls-mcp-profile"
```

**Chrome (Windows):**

```powershell
& "C:\Program Files\Google\Chrome\Application\chrome.exe" --remote-debugging-port=9222 --user-data-dir="$env:TEMP\ls-mcp-profile"
```

Después:

1. Inicia sesión con tu cuenta de Google en esa ventana.
2. Abre el informe y pulsa **Editar**. La URL debe terminar en `/edit`, por ejemplo `https://datastudio.google.com/u/0/reporting/<reportId>/page/<pageId>/edit`.
3. Para comprobar que CDP responde, abre `http://127.0.0.1:9222/json/version`.

Variables de entorno opcionales:

| Variable | Por defecto | Uso |
|---|---|---|
| `LS_CDP_URL` | `http://127.0.0.1:9222` | URL HTTP del endpoint CDP |
| `LS_CDP_WS` | (sin definir) | Endpoint WebSocket directo (`ws://...`). Si está definido, tiene prioridad sobre `LS_CDP_URL` |
| `LS_EVAL_TIMEOUT_MS` | `15000` | Tiempo máximo para cada script que se ejecuta en la página |

Si hay varias pestañas con informes abiertas, se usa la que esté visible y con foco.

## 2. Registrar el servidor

### Claude Code

```powershell
claude mcp add looker-studio -- node C:\Users\user\Desktop\Aprendizajes\DatastudioMCP\looker-studio-mcp\dist\index.js
```

Con un puerto distinto:

```powershell
claude mcp add looker-studio -e LS_CDP_URL=http://127.0.0.1:9333 -- node C:\Users\user\Desktop\Aprendizajes\DatastudioMCP\looker-studio-mcp\dist\index.js
```

### Claude Desktop

Edita `%APPDATA%\Claude\claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "looker-studio": {
      "command": "node",
      "args": ["C:\\Users\\user\\Desktop\\Aprendizajes\\DatastudioMCP\\looker-studio-mcp\\dist\\index.js"],
      "env": {
        "LS_CDP_URL": "http://127.0.0.1:9222"
      }
    }
  }
}
```

Reinicia Claude Desktop después de guardar el archivo.

## Herramientas

| Herramienta | Argumentos | Devuelve | ¿Necesita modo edición? |
|---|---|---|---|
| `attach_to_report` | ninguno | `{reportId, pageId, title, url, mode, canvas}`. `mode` es `edit`, `view` o `preview` | No |
| `get_report_layout` | `pageId?` | `{pageId, canvas, components:[{id (cd-…), type, level, x, y, width, height, style{padding, supportsPadding, …}, data{dimensions, metrics}, error}]}` | No |
| `set_component_box_model` | `componentId`, `padding?` (número o `{top,right,bottom,left}`), `dimensions?`, `position?` | Estado antes/después y `applied[]` | **Sí** |
| `inspect_data_sources` | ninguno | `{dataSources:[{dataSourceId, maxDimensions, maxMetrics, usedBy[], fields:[{id, qualifiedId, name, type, dataType}]}]}` | No |
| `bind_fields_to_component` | `componentId`, `dimensions[]`, `metrics[]`, `mode?` (`replace`/`append`). Acepta id (`unique_users`), `t0.unique_users` o nombre visible | Campos finales del componente | **Sí** |
| `diagnose_report` | ninguno | `{issues:[{severity, code, componentId, pageId, message}], stats}`. Códigos: `COMPONENT_ERROR`, `FIELD_NOT_IN_SCHEMA`, `MISSING_CONCEPT_DEF`, `NO_METRICS`, `OUT_OF_CANVAS`, `OFF_GRID`, `TOO_MANY_CHARTS`, `UI_MESSAGE` | No |
| `get_component_config` | `componentId` | JSON interno completo del componente | No |

Todas las herramientas devuelven JSON como texto. Si algo falla, devuelven `isError: true` con la causa.
Coordenadas en píxeles del informe, sin zoom, relativas al lienzo.

Para probar las herramientas de escritura en una copia temporal en `/preview`, define `LS_ALLOW_NON_EDIT=1`. Los cambios de datos en view/preview los rechaza el servidor de Google (`PREFETCH_VALIDATION`).

## Prompts (skills de buenas prácticas)

Cada skill combina un **procedimiento con las herramientas** y la **guía de buenas prácticas** correspondiente de `skills/*.md`, con reglas marcadas como [OFICIAL] o [CONVENCIÓN] y sus fuentes. Las guías también se exponen como resources `skill://<archivo>.md`.

| Prompt | Uso | Guía |
|---|---|---|
| `skill_layout_audit` (`apply?`) | Crear/rediseñar: auditar lienzo, retícula, jerarquía, accesibilidad | `diseno-layout.md` |
| `skill_kpi_row` (`count?`, `metrics?`) | Fila de scorecards con métricas clave | `kpi-scorecards.md` |
| `skill_performance_audit` | Páginas pesadas, orígenes, cuotas GA4, caché | `rendimiento.md` |
| `skill_data_model_review` | Orígenes, ids de campo vs nombres, calculados, blends | `modelo-datos.md` |
| `skill_migrate_ua_to_ga4` (`dryRun?`) | Migración UA → GA4 o cambio de origen, componente a componente | `migracion.md` |
| `skill_debug_report` | Errores: diagnóstico, causa y solución | `depuracion-errores.md` |
| `skill_harmonize_paddings` (`grid?`) | Normalizar paddings/gaps a una retícula | — |
| `skill_scaffold_kpi_row` (`count`, …) | Calcular posiciones de N scorecards | — |

Flujos sugeridos: **crear** → `skill_layout_audit` → `skill_kpi_row` → `skill_performance_audit` · **migrar** → `skill_data_model_review` → `skill_migrate_ua_to_ga4` → `skill_debug_report` · **depurar** → `skill_debug_report`.

## CLI `ls-studio` (sin capturas ni clics)

Usa el mismo motor que el MCP: puppeteer por CDP, con los scripts inyectados en el editor. Escribe JSON en stdout.

```bash
npm run build
node dist/cli.js help                      # o: npx ls-studio help tras npm link
node dist/cli.js open "https://datastudio.google.com/reporting/<id>/page/<pagina>/edit"
node dist/cli.js layout
node dist/cli.js diagnose                  # con soluciones conocidas (campo "fix")
node dist/cli.js export -o informe.json    # el informe como JSON
node dist/cli.js bind cd-xxx --dims pais --metrics "SUM(ingresos),AVG(valoracion)"
node dist/cli.js create --type kpi-metric --box 890,100,270,120 --dataset @ingresos --metrics "AVG(valoracion)"
node dist/cli.js delete cd-xxx
node dist/cli.js lint examples/resumen.spec.json
node dist/cli.js apply examples/resumen.spec.json --dry-run
node dist/cli.js apply examples/resumen.spec.json
```

### Informe como código (spec)

`examples/resumen.spec.json` muestra el formato:
- `pages[].components[]`, con `key` estable, `type`, la caja `x/y/w/h`, `dataset` (un id o `"@campo"`), `dimensions` y `metrics`;
- la macro `row`, que reparte una fila de KPIs con la fórmula de la skill: `w = (ancho − (n−1)·gap) / n`, redondeado a la retícula;
- `id`, para adoptar un componente que ya existe.

`apply` es idempotente:
- guarda la relación entre cada `key` y su componente en `<spec>.state.json`;
- si el componente ya existe, lo actualiza (caja y campos); si no, lo crea;
- al final recarga el informe y lo diagnostica.

`lint` valida el spec con las reglas de las skills antes de tocar nada: retícula, lienzo, márgenes, padding, solapes, scorecards con una sola métrica, filas de 4 a 6 KPIs con igual alto y separación, y 15 o 25 componentes con datos por página como máximo.

### Crear componentes

`page.addComponent(cfg)` usa el JSON de un componente del mismo tipo:
1. **Clon:** si el informe ya tiene un componente de ese tipo, se clona con `duplicateConfig()`. ✅ verificado.
2. **Plantilla aprendida:** si no lo tiene, se usa `knowledge/templates/<tipo>.json`. Las plantillas se capturan con `templates capture` o `export` desde cualquier informe que tenga ese tipo, incluso en modo vista o preview. 🟡 pendiente de verificar con CDP.

Cambiar `display.type` de un JSON clonado no sirve: el servidor responde `updatePage 400`. El CLI lo detecta, recarga para descartar el estado inválido y lo registra.

## Aprendizaje (`knowledge/`)

Todo lo que el CLI y el MCP descubren se guarda en `knowledge/` (o en `LS_KNOWLEDGE_DIR`) y se reutiliza en las siguientes ejecuciones:

| Qué | Cuándo se aprende | Dónde se usa |
|---|---|---|
| `error_reason` (reason → título y descripción) | `diagnose` | catálogo de errores |
| `fix` (solución conocida) | semillas verificadas, `learn` (CLI) o `record_learning` (MCP) | campo `fix` en cada problema de `diagnose` |
| `display_type` (tipos registrados en el editor) | `export`, `templates capture` | `lint` y `create` |
| `templates/<tipo>.json` | `export`, `templates capture` | `create`, `apply` |
| `create_ok` / `create_fail` / `save_rejected` | `create`, `apply` | `learnings`: qué tipos y fuentes funcionan |
| `method_missing` | cuando falta un método interno (cambio de versión de Google) | avisa de que hay que revisar los scripts |

Nunca se guardan tokens, cookies, cabeceras ni cuerpos de petición. Solo ids, códigos, tipos y textos que muestra la interfaz.

Herramientas nuevas en el MCP, todas aditivas: `open_report`, `reload_report`, `export_report`, `capture_templates`, `list_templates`, `create_component`, `delete_component`, `lint_report_spec`, `apply_report_spec`, `get_learnings` y `record_learning`. También el recurso `knowledge://summary` y el prompt `skill_report_as_code`. `diagnose_report` ahora devuelve además `fix` y aprende los reason codes.

`npm run bundle` genera `dist/mcp-bundle.js`, con todos los scripts en `window.__mcp`, para usarlos desde la consola o una extensión cuando no hay CDP.

## Seguridad

| Medida | Detalle |
|---|---|
| **MCP en solo lectura por defecto** | Las herramientas que modifican el informe devuelven error salvo con `LS_ALLOW_WRITE=1`. Las destructivas (`delete_component`) requieren además `LS_ALLOW_DELETE=1`. El control se aplica envolviendo `registerTool` por nombre, así que no depende de cada herramienta. El CLI no lleva este control, porque lo ejecuta una persona |
| **Solo URLs de informes** | `open` / `open_report` solo aceptan `https://(datastudio\|lookerstudio).google.com/reporting/...`. Así una inyección de prompt no puede llevar el navegador autenticado a otro sitio |
| **Rutas acotadas** | Las rutas que recibe el MCP (spec, export) deben ser `.json` dentro de `LS_WORKSPACE` (por defecto, el directorio actual) |
| **Aprendizajes como datos** | `record_learning` limpia caracteres de control, limita a 500 caracteres y rechaza lo que parezca una credencial. `get_learnings` marca su salida como datos, no instrucciones |
| **Sin secretos** | No se leen ni guardan cookies, cabeceras ni el token XSRF. El monitor de red solo registra la ruta y el código de estado. Las herramientas de prueba solo leen el cuerpo de error de `updatePage` |
| **Copia antes de aplicar** | `apply` exporta el informe completo a `backups/` antes de tocar nada (excluido de git) |
| **Navegador dedicado** | Usa un perfil propio (`--user-data-dir`). El puerto CDP da control total sobre ese navegador a cualquier proceso local |
| **Dependencias** | `npm audit`: 0 vulnerabilidades (2026-11-03) |

Registro con escrituras habilitadas, sobre una copia del informe:

```json
{ "looker-studio": { "command": "node", "args": ["<ruta>/dist/index.js"], "env": { "LS_ALLOW_WRITE": "1" } } }
```

## Páginas, temas, filtros y plantillas

```bash
node dist/cli.js pages                                   # listar
node dist/cli.js pages add "Producto y geografía"        # boton "Anadir pagina" o menu Pagina > Nueva pagina (POST /createPages) + renombrado
node dist/cli.js pages rename <pageId> "Resumen"

node dist/cli.js theme presets                           # 27 predefinidos (t-harvest = Cosecha, t-eucalyptus, t-pop, t-fog = Niebla...) + biblioteca
node dist/cli.js theme use Cosecha                       # predefinido, por nombre o id
node dist/cli.js theme use marca-azul                    # tema propio de themes/library/
node dist/cli.js theme set examples/tema-marca.json      # tema propio: font, text, fill, accent, accentText, background, grid,
                                                         #   increase, decrease, border, borderWeight, borderRadius, series[]
node dist/cli.js theme export mi-tema.json / theme import mi-tema.json
node dist/cli.js ux                                      # auditoria 0-100: contraste WCAG, paleta, tema, tipografia, layout

node dist/cli.js filters                                 # filtros y donde se aplican
node dist/cli.js filters add --name "Sin tablet" --field dispositivo --op EQ --values Tablet --exclude --to <pageId|cd-...>

node dist/cli.js templates seed-ui "Tabla dinámica con mapa de calor" "Gráfico de bala" "Indicador"
node dist/cli.js templates synth simple-treemap simple-sankey simple-funnel
```

La biblioteca `themes/library/` incluye `marca-azul`, `oscuro-accesible`, `alto-contraste` y `calido-editorial`. Los cuatro obtienen 100 en `ux`.

### Spec: campos nuevos

| Campo | Nivel | Uso |
|---|---|---|
| `theme` / `themePreset` | informe | Tema propio, o un predefinido o de la biblioteca |
| `pages[].name` | página | Busca la página por nombre y la crea si no existe |
| `pages[].filters[]` | página | Filtro de página `{name, field, op, values, include, dataset}`. Se reutiliza por nombre |
| `components[].filters[]` | componente | Filtro del componente |
| `components[].slots` | componente | Huecos propios del tipo: `x_metric`/`y_metric`/`bubble_size` (dispersión), `breakdown` (área/línea), `color` (treemap) |
| `components[].variant` | componente | Variante sembrada desde el menú, p. ej. `tabla-dinamica-con-mapa-de-calor` |
| `components[].dateRangeDays`, `stripStyles` | componente | Periodo por defecto de un control; quitar estilos heredados |

`examples/paginas-2-3.spec.json` construye dos páginas completas con 14 componentes, dos filtros de página y el tema de marca.

### Controles (menú "Añadir un control")

`templates seed-ui "control:<opción>"` captura cada control. Todos verificados en la página 4 de `examples/pagina-4-controles.spec.json`:

| Opción del menú | Tipo / variante | Estado |
|---|---|---|
| Lista desplegable | `dimension-filter@lista-desplegable` | ✅ |
| Lista de tamaño fijo | `dimension-filter@lista-de-tamano-fijo` | ✅ |
| Cuadro de entrada | `dimension-filter@cuadro-de-entrada` | ✅ |
| Filtro avanzado | `dimension-filter@filtro-avanzado` | ✅ |
| Control deslizante | `dimension-filter@control-deslizante` | ✅ (campo numérico) |
| Casilla | `dimension-filter@casilla` | ⚠️ Necesita un campo **Booleano** (reason 116). En Sheets, TRUE/FALSE se infiere como texto: hay que cambiar el tipo en el origen |
| Filtro predefinido | `button@filtro-predefinido` (preset `button-filter`) | ⚠️ Falta descubrir dónde guarda su condición (reason 265) |
| Filtro por periodo | `simple-daterangepicker@filtro-por-periodo` + `dateRangeDays` | ✅ |
| Control de datos | `dataset-picker@control-de-datos` | ✅ Se crea, pero solo tiene sentido con conectores como GA o Ads, no con Sheets |
| Control de dimensiones | `dimension-control@control-de-dimensiones` | ✅ |
| Botón | `button@boton` | ✅ |
| Añadir barra de filtros de lectores | ajuste del informe `viewerFilterBarConfig.orientation` | ✅ `report settings --viewer-filter-bar on` |

### Ajustes del informe y mantenimiento

```bash
node dist/cli.js report settings                                   # leer
node dist/cli.js report settings --viewer-filter-bar on --cross-filter on
node dist/cli.js report settings --set viewModeNav=nav-top,viewModeScale=scale-fit
node dist/cli.js pages rename <pageId> "Nombre"                    # modelo + nombre visible en la navegacion
node dist/cli.js orphans examples/*.spec.json                      # componentes que ningun spec referencia
```

## Inspiración de los MCP de Microsoft

- [`powerbi-modeling-mcp`](https://github.com/microsoft/powerbi-modeling-mcp):
  - "haz siempre copia antes de operar" → copia automática en `apply`;
  - aviso de que el modelo de lenguaje puede hacer cambios no deseados → solo lectura por defecto;
  - trabajo con archivos (TMDL/PBIP) → spec y export JSON;
  - evaluación de buenas prácticas → `lint` y `ux`.
- [`microsoft/skills`](https://github.com/microsoft/skills): cargar skills de forma selectiva para no saturar el contexto. Los prompts `skill_*` incluyen solo la guía de su tema.

## Arquitectura

```
src/
  index.ts            McpServer: tools y prompts, transporte STDIO
  skills.ts           Carga skills/*.md y los registra como prompts y resources
  browser.ts          Conexión CDP con caché y reconexión, búsqueda de la pestaña, evaluate con timeout
  looker/
    scripts.ts        TODO el código inyectado en la página (único archivo a tocar si Looker Studio cambia)
    types.ts, report.ts, layout.ts, boxModel.ts, data.ts, diagnose.ts
skills/               Guías de buenas prácticas + LOOKER_STUDIO_INTERNALS.md
```

Mecanismo interno (detalle en `skills/LOOKER_STUDIO_INTERNALS.md`): `angular.element(document.body).injector().get('legoUndoRedoService').report` → `comp.setAttributeValues()` / `comp.setDisplayKeyValue()` / `comp.updateMetrics()`. Esto re-renderiza el informe; después `injector.get('wrapperSaveService').save([comp])` lo guarda (`POST updatePage`), el mismo servicio que usa la UI. Nunca se replican peticiones REST ni se manipula el token XSRF.

## Estado de verificación (2026-11-03)

**Por CDP con el CLI**, sin Claude in Chrome, en un informe propio en `/edit` con un origen de Google Sheets:
- ✅ `open`: unos 3,5 s.
- ✅ `templates capture` desde el informe de ejemplo de Firebase en `/preview`: 11 tipos en 0,3 s.
- ✅ `apply examples/resumen.spec.json`:
  - crea el selector de periodo, la serie temporal, el circular y el mapa desde plantillas;
  - actualiza los 4 KPIs y la tabla;
  - recarga y diagnostica: **0 problemas**;
  - tarda unos 40 s, la mayor parte esperas de guardado.
- ✅ `delete` y `patch` (periodo por defecto y quitar estilos de tema).
- ✅ `diagnose` aprende los reason codes 13, 93, 266 y 268 y devuelve `fix`.
- ✅ Las herramientas originales: layout, box model, sources, bind (persistencia comprobada recargando), diagnose y config.

## Limitaciones

- Interfaz no oficial: una actualización de Looker Studio/Data Studio puede romperla. Si `legoUndoRedoService` desaparece, las herramientas de lectura usan el DOM como alternativa.
- Crear componentes requiere una plantilla del tipo: se obtiene clonando uno del informe, con `templates capture`, `seed-ui` (menú del editor) o `synth`.
- Combinar orígenes (blends) y campos calculados aún no están automatizados.
- `paddingBottom` no existe en algunos tipos (p. ej. `kpi-metric`), y `generic-shape` no tiene padding: la herramienta lo avisa en `warnings`.
- Usa un perfil de navegador dedicado. El puerto CDP da control total sobre ese navegador a cualquier proceso local.
