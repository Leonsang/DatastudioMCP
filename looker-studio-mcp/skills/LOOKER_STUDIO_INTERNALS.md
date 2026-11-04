# Looker Studio — Internals del editor (ingeniería inversa)

> **Fecha de captura:** 2026-11-03 · **Build JS:** `datastudio.datastudio.es.CdlxpqNYDD8.2018.O`
> **Informe de prueba:** `[Sample] Google Analytics for Firebase Report` (`16F8_uTW-fFViueNoD3Q0Gz5FJsnAq6kK`), modo `/preview` (copia temporal creada con `createTempReport`; `permissions.isEditable = false`).
> **Método:** Claude in Chrome → `Runtime.evaluate` equivalente (JS en el contexto de la página) + interceptor XHR propio.
>
> ⚠️ El bundle está minificado con Closure. **Solo son estables los nombres "legibles"** (los que Google expone a propósito o que aparecen como strings: `legoUndoRedoService`, `getPages`, `setAttributeValues`, `setDisplayKeyValue`, `updateMetrics`, `getDatasourceSchema`, `config`, `attribute`, `conceptDefs`, …). Los nombres de 2–4 letras (`kh`, `wl`, `ma`, `ea`, `lg_Cqc`…) **cambian en cada deploy**: nunca los uses en código de producción.

Leyenda: ✅ verificado en vivo · 🟡 observado parcialmente · ❓ pendiente de verificar en modo edición sobre un informe propio.

---

## 1. Arquitectura en memoria

| Capa | Detalle |
|---|---|
| Framework | Híbrido **AngularJS 1.x** (`window.angular`, módulos `datastudio`, `lego`) + **Angular Ivy** en *production mode* (`ng` solo expone `safehtml`, `__ngContext__` es numérico → no hay `ng.getComponent`). Closure Library (`goog`), Zone.js, jQuery, d3, vega. |
| Punto de entrada estable | **Inyector AngularJS:** `angular.element(document.body).injector()` ✅ |
| Modelo del informe | `injector.get('legoUndoRedoService').report` ✅ — objeto `Report` con API pública legible. |
| Modelo plano (estado) | `injector.get('dataModelService').dataModel.report` ✅ — árbol `report → pages[i] → components[j]` con claves `seccion::clave`. |
| Store global | `injector.get('store')` ✅ — **NgRx Store** (`dispatch`, `select`, `subscribe`). Guarda estado de UI (permisos, panel lateral, routing, tema…), **no** el layout. |
| Undo/Redo | `legoUndoRedoService.undo()/redo()` ✅ — patrón *Command* (`new <Cmd>(path,key,value,…).execute()`). |

### 1.1 Jerarquía del modelo `Report`

```
report                         (type 't')
 ├─ config                     ← JSON serializable = formato de persistencia en memoria
 │   ├─ id, version, attribute{width,height,name,viewMode*}
 │   ├─ config.datasource.keys.dataset.value.id   ← dataset por defecto del informe
 │   ├─ resource{theme[], filter{}, parameterResource, datasourceAlias, …}
 │   ├─ component[]            ← componentes a nivel de informe (cabecera, filtros "en todas las páginas")
 │   └─ page[] → {id, attribute{name}, component[], group[], version}
 ├─ pages[]        (Page)      → getId(), components[] (Component), groups, selectedComponents
 ├─ components[]   (Component) → componentes a nivel de informe
 ├─ selected       (índice de la página activa)
 └─ selectedComponents[]
```

### 1.2 Estructura de un componente (`component.config`) ✅

```jsonc
{
  "id": "cd-sd433Qgzo",                       // ID estable, prefijo "cd-"
  "attribute": { "top": 60, "left": 620, "width": 110, "height": 60,   // px de informe (sin zoom)
                 "datasourceConfigVersion": 2, "displayConfigVersion": 0 },
  "config": {
    "display": {
      "type": "kpi-metric",                   // tipo de gráfico (= clase CSS del ng2-canvas-component)
      "preset": "default",
      "keys": {                               // estilos: {stateKey, dominant, value}
        "paddingTop":   { "stateKey": "paddingTop",  "dominant": 2, "value": "10px" },
        "paddingLeft":  { "stateKey": "paddingLeft", "dominant": 2, "value": "10px" },
        "fontSize":     { "stateKey": "fontSize",    "dominant": 2, "value": "30px" },
        "background", "border", "boxShadow", "opacity", "chartTitle*", ...
      }
    },
    "datasource": {
      "keys": {
        "dataset":    { "stateKey": "ds", "dominant": 2 },          // sin value → hereda del informe
        "dimensions": { "stateKey": "dimensions", "value": { "primary": ["qt_5yfumoawlb"] } },
        "metrics":    { "stateKey": "metrics",    "value": { "primary": ["qt_dnv7qtbuob"] } },
        "sortData", "filters", "dateRange", "row", "compareDateDuration", ...
      }
    }
  },
  "conceptDefs": {                            // definición de cada qt_ usado por el componente
    "qt_dnv7qtbuob": {
      "name": "qt_dnv7qtbuob", "id": "t0.qt_dnv7qtbuob", "namespace": "t0",
      "queryTimeTransformation": {
        "dataTransformation": { "sourceFieldName": "unique_users" },
        "displayTransformation": {}
      }
    }
  }
}
```

- `dominant` indica herencia (2 = valor propio/por defecto, 3–4 = heredado de página/informe/tema). Al escribir con la API no hace falta tocarlo.
- Los valores de estilo en memoria son **strings con unidad** (`"10px"`); en el cable (`updatePage`) son **números** (`paddingTop: 24`).
- No todos los tipos tienen `padding*` (p. ej. `generic-shape` no). Comprueba `config.display.keys` antes de escribir.

Tipos observados: `kpi-metric`, `simple-table`, `simple-linechart`, `simple-barchart`, `simple-piechart`, `simple-geomap`, `simple-description` (texto), `generic-shape`, `image-component`, `dimension-filter`, `simple-daterangepicker`, `dataset-picker`, `arrow`.

### 1.3 Modelo plano (`dataModelService.dataModel`) ✅

Cada nodo es un objeto con claves `seccion::clave`:

| Sección | Ejemplos |
|---|---|
| `attr::` | `attr::top`, `attr::left`, `attr::width`, `attr::height` |
| `display::` / `displayKey::` | `display::paddingTop = "10px"` / `displayKey::paddingTop = {stateKey, dominant}` |
| `data::` / `dataKey::` | `data::metrics`, `data::dimensions`, `data::filters` |
| `concepts`, `id`, `displayType` | |
| (informe) `resource::filter::<id>`, `resource::theme::<id>` | |

`legoUndoRedoService.setValue(entityType, entityId, section, key, value)` (p. ej. `('component','cd-x','display','paddingTop','24px')`) **solo** modifica este modelo plano y apila un undo. **No re-renderiza ni persiste.** ✅ No usarlo para mutaciones visibles.

---

## 2. Cómo se aplican los cambios

**Respuesta corta:** ni EventBus puro ni store central. Se usa la **API orientada a objetos del `Component`**. Esta muta `component.config`, sincroniza el `dataModel`, emite eventos internos (`"attribute.<k>.updated"`), re-renderiza la vista Angular y re-renderiza. **El guardado explícito es `injector.get('wrapperSaveService').save([comp])`** → `POST updatePage` (verificado en `/edit` el 2026-11-03). El NgRx `store` no interviene en el layout.

| Operación | Llamada | Verificado |
|---|---|---|
| Mover / redimensionar | `comp.setAttributeValues({left, top, width, height})` | ✅ config + DOM; ⚠️ el autosave no está garantizado (en `/edit` no se disparó) |
| **Guardar** | `injector.get('wrapperSaveService').save([comp, ...])` | ✅ `POST updatePage` de cada página afectada; persiste tras recargar |
| Un atributo | `comp.setAttributeValue('left', 600)` | ✅ |
| Estilo / padding | `comp.setDisplayKeyValue('paddingTop', '24px')` | ✅ config + dataModel; persiste en el siguiente `updatePage` |
| Leer estilo | `comp.getStyleValue(key)` / `comp.config.config.display.keys[key].value` | ✅ |
| Métricas / dimensiones | `comp.updateMetrics('primary', conceptDefs[])` / `comp.updateDimensions('primary', conceptDefs[])` | ✅ config; ✅ persiste con `wrapperSaveService.save` |
| Registrar conceptos | `comp.updateConceptPool(conceptDefs[])` (lo llama `updateMetrics`) | ✅ |
| Re-consultar datos | `comp.syncState(true)` → lanza `batchedDataV2` | ✅ |
| Seleccionar | `report.selectComponents([comp], true)` / `report.resetSelection()` | ✅ |
| Undo | `legoUndoRedoService.undo()` | ✅ (para cambios hechos vía `setValue`) |

### Persistencia: hallazgos y límites

- `setAttributeValues` dispara siempre `updatePage`, que envía un **snapshot completo de la página** generado desde `comp.config`. Por eso un cambio de estilo o de datos hecho antes se guarda en el siguiente `updatePage` ✅ (padding observado en el cable: `kpiMetricProperty.paddingTop: 24`).
- `updateMetrics` y `setDataSourceKeyValue(k, v, true, true)` **no** disparan `updatePage` por sí solos ✅.
- En el informe temporal de *preview*, tras 2 autoguardados no se enviaron más `updatePage`.
- **Verificado en `/edit` (2026-11-03, informe nuevo propio `4ed42cb1-…`):** ni `setAttributeValues` (ni siquiera con pausa entre +1/−1) ni `legoUndoRedoService.setValue` dispararon `updatePage`. Un arrastre en la UI sí. El servicio que usa la UI es `wrapperSaveService.save(iterable<Component>)`: sube por `getParent()` hasta la página y guarda esas páginas (o el informe si llega a `report`). Tras `updateMetrics` + `save([comp])` y recargar, las vinculaciones, posiciones y paddings se conservan ✅.
- `report.getDatasourceSchema(id)` puede devolver `qe.concepts` **vacío** en informes nuevos (carga diferida). `comp.getSchema().qe.concepts` de un componente ligado a ese origen sí lo trae ✅.
- `store.permissions.isEditable/isOwner` salen `false` incluso en `/edit` de un informe propio: **no son fiables**. Usa la URL (`/edit`).
- Al crear un gráfico, el editor fija `dataTransformation.aggregation` (p. ej. 6) distinta de la `defaultAggregation` del campo (7). Si el origen tiene desactivado "editar campos en informes", eso produce `reason 93`: "Error de configuración del usuario … quite todos los campos con agregaciones personalizadas". Un conceptDef sin `aggregation` lo evita.
- **Crear componentes desde JSON (2026-11-03):** `cfg = comp.duplicateConfig()` devuelve el JSON completo con un id `cd-…` nuevo (`{id, attribute, config:{display:{type,preset,keys}, datasource:{keys}}, conceptDefs, behavior}`). `page.addComponent(cfg)` lo inserta y `wrapperSaveService.save([c])` lo guarda (200). Se pinta tras recargar ✅.
  - Llama a `duplicateConfig()` **una vez por componente**: dos componentes con el mismo id hacen fallar el guardado.
  - Cambiar `display.type` de un JSON clonado de otro tipo → `updatePage` **400**, y mientras ese estado exista ningún guardado posterior prospera (hay que recargar). Para tipos nuevos hace falta una **plantilla real de ese tipo**.
  - `display.keys` solo guarda lo que se sobrescribe; los valores por defecto los da `legoMainRegistry.getDisplayTypeObj(type).defineDefaultConfig()`.
  - Tipos registrados (37): simple-linechart, simple-barchart, simple-histogram, simple-combochart, simple-piechart, simple-table, google-map, simple-geomap, kpi-metric, simple-scatterchart, bulletchart, simple-areachart, pivot-table, simple-treemap, gauge-viz, simple-sankey, simple-waterfall, simple-timeline, simple-funnel, third-party-viz, framed-external-content, notebook-data-app, simple-description, image-component, arrow, placeholder, shape, ellipse, generic-shape, filter-bar, metric-filter, advanced-filter, simple-daterangepicker, dimension-filter, dataset-picker, dimension-control, button.
- **Plantillas entre informes (verificado por CDP el 2026-11-03, `tools/probe-template.mjs`):**
  - **Plantilla intacta**, o con solo `datasource.keys.dataset` cambiado → `updatePage` 200 ✅.
  - **Vaciar `conceptDefs`, dimensiones o métricas** → 400. Hay que vincular los campos nuevos antes del primer guardado.
  - **Orden:** `sortData.value = [{sortDir, sortColumn: qt_…}]` puede seguir apuntando a campos de la plantilla. Eso produce reason **268** "Orden no válido", y hay que reasignarlo (`sortDir` 0 = ascendente, 1 = descendente). reason **266** = dimensión no válida.
  - **Tema:** la plantilla trae los colores y fuentes de su informe (p. ej. `fontColor #F3F3F3` del tema oscuro de Firebase). Hay que quitar esas claves de `display.keys`.
  - **Periodo por defecto** de un control de fechas: `behavior.onSelect[action=lego-change-date-range].init.dateRange = {startOffsetUnit:3 (días), startOffset, endOffsetUnit, endOffset}` + `updateFrequency:"Rolling"`.
- **Borrar:** `page.removeComponent(comp)` y después `wrapperSaveService.save([page])` ✅. También existen `removeComponents`, `removeComponentByIndex` y `removeGroups`.
- **Pestañas ocultas:** si navegas a un informe con la pestaña oculta, el editor no arranca y acaba en la portada. Hay que llamar a `bringToFront()` antes de `goto`.
- **Red:** el editor no siempre usa el `XMLHttpRequest` del prototipo. Para ver el estado de `updatePage`, escucha `page.on('response')` desde CDP.
- **Temas:**
  - un tema propio vive en `report.config.resource.theme[] = {id, content}`;
  - se crea con `report.addResource('theme', content)` o se actualiza con `updateResourceById('theme', id, content)`;
  - se activa con `report.setDisplayKeyValue('themeConfig', id)` y se guarda con `wrapperSaveService.save([report])` → `updateReport` 200;
  - presets incluidos en el código del editor: t-default-modern, t-default, t-edge, t-constellation, t-groovy, t-insight, t-ocean, t-harvest, t-eucalyptus, t-pop, t-fog, t-lagoon, t-executive, t-woodsy, t-royalty, t-sienna, t-material, t-muted, t-primary, t-cut-out, t-shift, t-energetic, t-forest, t-magazine, t-tunnel, t-quartz, t-onyx.
- **Páginas:**
  - `report.addPage(cfg)` no persiste: `updatePage` responde 500 para una página que el servidor no conoce;
  - la interfaz llama a `POST /createPages` y la página nueva recibe un id `p_…` igual al de su URL;
  - para renombrar, `page.setAttributeValues({name})` y guardar `[page]` y `[report]`;
  - la página activa sale de `/page/<id>` en la URL, porque `report.selected` no sigue la navegación.
- **Filtros:**
  - se definen en `report.config.resource.filter[id] = {name, datasourceId, filterDefinition.filterExpression:{include, conceptType:0, concept:{ns,name}, filterConditionType, stringValues, numberValues, queryTimeTransformation.dataTransformation.sourceFieldName}, version:3}`;
  - páginas y componentes los referencian en `datasource.keys.filters.value = [id]`.
- **Huecos de campos por tipo:** `getDisplayTypeObj(type).getDataFieldConfigs()` devuelve `[{id, type:1 dim|2 met, options:{conceptKey, min, max, defaultFieldCount}}]`. Ejemplos:
  - dispersión: `x_metric`, `y_metric`, `bubble_size`;
  - sankey: métricas en `sankey_weight`;
  - área: `breakdown`, que no se puede vaciar, solo reemplazar;
  - indicador y viñetas: sin dimensiones (crear un hueco vacío de dimensiones provoca 400).
- **Esquemas sin cargar:** el esquema de un origen que ningún componente usa sale vacío. Se carga añadiendo un componente temporal que nunca se guarda, forzando la consulta y quitándolo.
- **Ids de campo en Sheets:** salen de un hash del nombre de la columna (`fecha` = `_97306493_` en cualquier hoja).
- **Menú de inserción:** cada opción es `PRESET-PREVIEW[aria-label]`; tras pulsarla, un clic real en `.ng2-canvas-container` coloca el componente.
- **CDP:**
  - no esperar con `setTimeout` dentro de la página: con la pestaña en segundo plano los temporizadores se estrangulan;
  - emular foco y ciclo de vida activo;
  - filtrar targets por URL antes de `target.page()`, porque las pestañas ocultas o los iframes de sandbox pueden colgar `Network.enable`;
  - guardados seguidos de la misma página pueden perder alguno.
- **Códigos de `dataTransformation.aggregation`** (verificados con valores conocidos el 2026-11-03): `0` NONE, `1` AVG, `2` COUNT, `3` COUNT_DISTINCT, `4` MAX, `5` MIN, `6` SUM.
- **Orígenes de Sheets/CSV:** todas las columnas llegan como dimensiones (`type 0`, `defaultAggregation 0`), incluidos los números. Para usarlas como métrica hay que fijar `aggregation` (SUM para números, COUNT_DISTINCT para texto). Sin ella, la consulta devuelve filas sin agregar. `bind_fields_to_component` lo hace por defecto y acepta `SUM(campo)`, `AVG(campo)`, etc.
- `comp.getError()` → `{reason, title, description, errorTextInfo.errorDialogText}`: texto útil para diagnosticar (reason 13 = sin acceso al conjunto de datos subyacente; 93 = configuración del origen).
- Informe nuevo: `/reporting/create` no cambia de URL tras guardar (`POST updateReport`); el id está en `report.config.id` y la URL de edición es `/reporting/<id>/edit`.

---

## 3. Red y formato de guardado ✅

Todo es **JSON sobre XHR POST** (no `batchexecute`, no gRPC-web). Las respuestas llevan el prefijo anti-XSSI `)]}'\n`.

| Endpoint | Uso |
|---|---|
| `POST /reporting/<reportId>/updatePage?appVersion=…` | Guarda una página (snapshot completo) |
| `POST /updateReport` | Guarda propiedades del informe |
| `POST /batchedDataV2` | Consultas de datos de los gráficos |
| `POST /getSchema`, `/getDatasourceList`, `/getClaimedDatasources` | Esquemas y orígenes de datos |
| `POST /createTempReport` | Copia temporal al abrir `/preview` |
| `updatePrefetch`, `updateThumbnail`, `logUserFlags`, `getUserPreferences` | Auxiliares |

**Headers de `updatePage`:**
```
Content-Type: application/json
Accept: application/json, text/plain, */*
encoding: null
X-RAP-XSRF-TOKEN: <token de sesión>      ← obligatorio
Cookie: (sesión de Google, la pone el navegador)
```
El token XSRF **no** está en `WIZ_global_data` con un nombre fijo, así que es mejor **no** replicar las llamadas REST desde fuera. Muta vía la API del componente dentro de la página y deja que la app firme y envíe sus propias peticiones.

**Cuerpo de `updatePage` (resumido):**
```jsonc
{
  "reportId": "12fe7129-…",            // UUID interno (≠ id de la URL)
  "pageId": "213410",
  "pageRequest": {
    "fieldMask": [4, 3],
    "componentConfig": [{
      "componentId": "cd-sd433Qgzo", "type": "kpi-metric", "preset": "default",
      "attributeConfig": { "componentAttribute": { "top": 60, "left": 600, "width": 110, "height": 60 } },
      "propertyConfig": { "componentProperty": {
          "metrics": { "labeledConcepts": [{ "key": "primary", "value": { "conceptNames": ["qt_30ytbtbuob"] } }] },
          "kpiMetricProperty": { "paddingTop": 24, "paddingLeft": 10, "paddingRight": 10, "fontSize": 30 },
          "sort": [...], "filters": [], "inheritFilters": true }},
      "conceptDefs": [{ "name": "qt_30ytbtbuob", "namespace": "t0", "id": "t0.qt_30ytbtbuob",
                        "queryTimeTransformation": { "dataTransformation": { "sourceFieldName": "unique_users" } } }]
    }, …]
  }
}
// respuesta: )]}'\n{"version":"1793732013352"}
```
Las propiedades de estilo van agrupadas por tipo: `kpiMetricProperty`, `genericShapeProperty.backgroundAndBorderProperty`, etc.

**Petición de datos (`batchedDataV2`):** `dataRequest[].datasetSpec.dataset[].datasourceId` (id **real** del origen, p. ej. `1NiHcx…`) + `queryFields[] {name: qt_…, datasetNs: "d0", tableNs: "t0", dataTransformation.sourceFieldName}`.

---

## 4. Capa de datos ✅

Hay tres identificadores distintos:

| Nivel | Ejemplo | Dónde |
|---|---|---|
| **Nombre visible** | `Unique Users` | `schema.qe.concepts[x].displayName` |
| **Field ID del origen** | `unique_users`, `_geo.city_` | `schema.qe.concepts` (clave) / `sourceFieldName` |
| **Concepto de consulta `qt_`** | `qt_dnv7qtbuob` | `component.conceptDefs`, referenciado en `dimensions/metrics.value.primary` |

- `qt_xxxxxxxxxx` = `"qt_"` + 10 caracteres base36 aleatorios, **local a cada componente**. Dos gráficos que usan `unique_users` tienen `qt_` distintos.
- `namespace` `t0` = primera tabla del dataset (en *blends*: `t0`, `t1`, …). `d0` = dataset en la petición.
- **Esquema:** `report.getDatasourceSchema(datasetId)` (síncrono) → `.qe.concepts[fieldId] = {id:"t0.unique_users", name, displayName, type, dataType, defaultAggregation, semantic}`.
  - `type`: **0 = DIMENSIÓN, 1 = MÉTRICA**.
  - `.qe.maxDimensions` / `.qe.maxMetrics` (100/100 en GA4-Firebase).
- `datasetId` del informe: `report.config.config.datasource.keys.dataset.value.id`. Si un componente tiene su propio `dataset.value.id`, ese prevalece. (`report.getDatasourceIds()` devolvió `[]` en preview.)

### Estructura mínima para vincular un campo

```js
const def = {
  name: qt, id: `t0.${qt}`, namespace: 't0',
  queryTimeTransformation: {
    dataTransformation: { sourceFieldName: 'event_count' },   // field ID del esquema
    displayTransformation: {}
  }
};
comp.updateMetrics('primary', [...metricasActualesDefs, def]);   // o updateDimensions
comp.syncState(true);                                            // re-consulta
```

### Errores de datos detectables
`comp.hasError()`, `comp.getErrorCategory()`, `comp.getError()`. Respuesta de `batchedDataV2.errorStatus`:
- `PREFETCH_VALIDATION` / categoría `ACCESS` (code 3, reason 11): en modo **view/preview** solo se aceptan consultas pre-validadas. Una combinación nueva de campos necesita **modo edición** con permisos ✅.
- En la UI aparecen como texto `"Error del sistema"` / `"Configuración de gráfico no válida"` dentro del wrapper.

---

## 5. DOM: selectores fiables (plan B)

| Elemento | Selector | Notas |
|---|---|---|
| Wrapper de componente | `div.lego-component-repeat` (`cdk-drag`) | `style="top;left;width;height"` = geometría en px de informe ✅ |
| Componente | `ng2-canvas-component` | su `className` = tipo (`kpi-metric`, `simple-table`…) ✅ |
| Canvas | `canvas-layout`, `ng2-canvas-container`, `ng2-reporting-plate` | |
| Guías | `align-guidelines`, `spacing-guidelines`, `resize-guidelines` | solo en edición |
| Error en gráfico | `ng2-component-error` | |
| Edición deshabilitada | clase `cdk-drag-disabled` en el wrapper | indica view/preview |

- **El orden del DOM ≠ orden del modelo.** Empareja wrapper ↔ componente por geometría `top,left,width,height` (32/32 coincidencias ✅), o al revés: desde el modelo, busca el wrapper con la misma geometría.
- No existe `data-*` con el ID del componente. La herramienta MCP añade `data-mcp-id` al vuelo.

---

## 6. Snippets probados (pegar en consola o enviar vía `Runtime.evaluate`)

### 6.0 Helper común
```js
const LS = (() => {
  const inj = angular.element(document.body).injector();
  const report = inj.get('legoUndoRedoService').report;
  const allComps = () => [...report.pages.flatMap(p => p.components), ...report.components];
  const byId = id => allComps().find(c => c.getId() === id);
  const activePage = () => report.pages[report.selected] || report.pages[0];
  return { inj, report, allComps, byId, activePage };
})();
```

### 6.1 Seleccionar un componente por ID o tipo ✅
```js
const k = LS.byId('cd-sd433Qgzo')
       || LS.activePage().components.find(c => c.config.config.display.type === 'kpi-metric');
LS.report.selectComponents([k], /*resetSelection*/ true);
LS.report.selectedComponents.map(c => c.getId());   // → ["cd-sd433Qgzo"]
```

### 6.2 Cambiar padding y caja ✅
```js
const k = LS.byId('cd-sd433Qgzo');
['Top','Right','Bottom','Left'].forEach(s => {
  if (k.config.config.display.keys['padding' + s]) k.setDisplayKeyValue('padding' + s, '16px');
});
k.setAttributeValues({ left: 616, top: 64, width: 112, height: 64 });   // re-render + updatePage
```

### 6.3 Añadir una métrica a una tabla o tarjeta ✅ (verificado con recarga en `/edit`)
```js
const t = LS.byId('cd-Ee433Qgzo');                                   // simple-table
const dsId = t.config.config.datasource.keys.dataset.value?.id
          || LS.report.config.config.datasource.keys.dataset.value.id;
const schema = t.getSchema()?.qe?.concepts || LS.report.getDatasourceSchema(dsId).qe.concepts;
const field = Object.values(schema).find(f => f.type === 1 && f.displayName === 'Event Count');
const qt = 'qt_' + Math.random().toString(36).slice(2, 12);
const def = { name: qt, id: `t0.${qt}`, namespace: 't0',
  queryTimeTransformation: { dataTransformation: { sourceFieldName: field.name }, displayTransformation: {} } };
const cur = (t.getDataSourceKeyValue('metrics')?.primary || []).map(n => t.config.conceptDefs[n]);
t.updateMetrics('primary', [...cur, def]);   // en una scorecard: sustituir en lugar de añadir
t.syncState(true);                           // lanza batchedDataV2
// guardar (snapshot de la página → POST updatePage):
LS.inj.get('wrapperSaveService').save([t]);
```

### 6.4 Leer el layout completo de la página activa ✅
```js
LS.activePage().components.map(c => ({
  id: c.getId(), type: c.config.config.display.type, ...c.config.attribute,
  padding: ['Top','Right','Bottom','Left'].map(s => c.config.config.display.keys['padding'+s]?.value ?? null)
}));
```

### 6.5 Estado de permisos y modo ✅
```js
let s; LS.inj.get('store').subscribe(x => s = x).unsubscribe();
s.permissions;   // {isEditable, isOwner, isCredsOwner}  ⚠️ no fiable: false incluso en /edit propio; usa la URL
```

---

## 7. Riesgos y recomendaciones

1. **Usa solo la API "legible".** Si `angular.element(document.body).injector()` falla, Google habrá migrado ese módulo a Angular puro. En ese caso, recurre al plan B del DOM (sección 5) y a la UI (paneles de propiedades).
2. **Nunca repliques `updatePage` a mano.** Envía la página completa, así que un snapshot incompleto borra componentes.
3. Trabaja siempre sobre **una copia** del informe y en `/edit`.
4. Persistencia de datos y caja verificada en `/edit` con `wrapperSaveService.save`. Pendiente: que el *undo* del editor deshaga cambios hechos por API.
5. El token `X-RAP-XSRF-TOKEN` y `lookerNetworkToken` (en el store) son secretos de sesión: no los registres ni los extraigas.
6. Los orígenes `[Sample]` de Data Studio basados en Sheets (World Population, Rio Olympics) y el de UA fallan hoy en informes nuevos (reason 13/93; UA sin datos desde jul-2024). Para pruebas con datos reales usa un Sheet propio o BigQuery.
