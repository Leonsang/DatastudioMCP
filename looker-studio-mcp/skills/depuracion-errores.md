# Skill: Depuración de errores de informes

> **[OFICIAL]** = documentado por Google. **[CONVENCIÓN]** = práctica de la comunidad. **[HEURÍSTICA]** = propuesta del agente para detección, no documentada por Google.
>
> Los textos en inglés son los literales de la guía oficial. Las variantes en español son **traducciones aproximadas**: la UI localizada puede variar ("Configuración de gráfico incompleta", "Configuración de gráfico no válida", etc.). Detectar siempre con regex tolerante EN+ES y, si es posible, cambiar el idioma de la cuenta a inglés para depurar.

## 0. Detección programática genérica [HEURÍSTICA]
1. Recorrer cada componente del lienzo y extraer su `innerText` y atributos `aria-label`/`title`.
2. Marcar en error si el texto coincide con el catálogo (§2) o si el componente muestra un icono/banner de error en lugar del gráfico (contenedor sin `svg`/`canvas`/tabla y con texto corto).
3. Tras cargar, esperar a que desaparezcan los indicadores de carga (spinners) con timeout ~60 s; si persisten varios minutos (BigQuery corta a ~3–5 min con `HTTP 504`) → timeout de consulta.
4. Capturar el **ID de error de 8 caracteres alfanuméricos** si aparece (cambia en cada ocurrencia; necesario para reportar a Google). [OFICIAL]
5. Registrar: página, id/posición del componente, fuente de datos del panel Setup, campos asignados.

Regex sugeridas (insensibles a mayúsculas):
```
config(uration)?\s+incomplete|configuraci[oó]n\s+(de(l)?\s+)?gr[aá]fico\s+(incompleta|no\s+v[aá]lida)
invalid\s+combination|combinaci[oó]n\s+no\s+v[aá]lida
system\s+error|error\s+del\s+sistema
data\s*set\s+configuration\s+error|error\s+de\s+configuraci[oó]n\s+(del\s+conjunto\s+)?de\s+datos
(too\s+many\s+requests|exhausted\s+concurrent|quota)|demasiadas\s+solicitudes|cuota
missing|falta|no\s+data|sin\s+datos|no\s+hay\s+datos
```

## 1. Higiene básica (antes de todo) [OFICIAL]
Recargar, limpiar caché/cookies, reiniciar navegador, probar otro navegador/perfil sin extensiones. Si persiste, esperar y reintentar.

## 2. Catálogo

### 2.1 Configuración de gráfico incompleta / no válida
- **Texto**: `Chart configuration incomplete` / `Chart configuration incomplete. Invalid/Missing dimensions, metrics, filters.` (ES aprox.: "Configuración de gráfico incompleta/no válida").
- **Síntomas**: el gráfico no se dibuja; en el panel Setup aparecen campos en rojo o "Missing/Invalid".
- **Causas**: tras reemplazar fuente, campos no mapeados; campo eliminado/oculto en la fuente; campo calculado inválido; gráfico sin fuente. [OFICIAL]
- **Detección**: regex 2.1 en el componente; en el panel Setup, chips de campo con estado inválido.
- **Solución**: reasignar dimensiones, métricas, ordenación y campo de rango de fechas; corregir/eliminar calculados; *Refrescar campos* de la fuente; reconectar. [OFICIAL]

### 2.2 Combinación no válida de métricas y dimensiones
- **Texto**: `Invalid combination of metrics and dimensions`.
- **Causa**: esquema fijo (GA4, Ads) no admite esa combinación (p. ej. ámbito item con métricas de sesión, dimensiones de usuario con métricas de evento). [OFICIAL]
- **Solución**: cambiar campos; validar en GA4 Dimensions & Metrics Explorer (ga-dev-tools.web.app/ga4/dimensions-metrics-explorer/). [OFICIAL]

### 2.3 Error del sistema
- **Texto**: `System error` (también `Get report failed`, `Data Studio is not available`).
- **Causas**: fallo temporal; configuración de gráfico incompatible; calculado con sintaxis errónea. [OFICIAL]
- **Solución**: higiene básica → revisar calculados → otros campos → refrescar/reconectar fuente → confirmar acceso al informe. Si persiste, reportar con ID de error y un informe de prueba mínimo. [OFICIAL]

### 2.4 Error de configuración del conjunto de datos y de fuente
- **Textos**: `Data set configuration error`, `Missing data source`, `No data set access`, `Data source not attached`, `Data source needs to be added`, `The underlying data has changed`, `Database connection error`.
- **Causas**: credenciales ausentes/revocadas, fuente eliminada, permisos retirados, esquema cambiado. [OFICIAL]
- **Solución (en orden)**: reemplazar la fuente en el componente → refrescar campos → reconectar → quitar y volver a añadir → crear fuente nueva de prueba → revocar y restaurar acceso de la cuenta. [OFICIAL]

### 2.5 No hay datos
- **Síntomas**: gráfico vacío con "No data" / "Sin datos".
- **Causas** [CONVENCIÓN]: rango de fechas sin datos (p. ej. fuente UA tras jul-2024; "hoy" en GA4), filtro demasiado restrictivo, control de filtro con valor por defecto, ámbito incorrecto, filtro por ID de campo de otra fuente, umbral de privacidad GA4 (thresholding).
- **Detección**: texto vacío + ausencia de marcas; comparar quitando filtros/ampliando fechas.
- **Solución**: ampliar rango; quitar filtros uno a uno; revisar filtros a nivel de página/informe; comprobar la fuente en el panel.

### 2.6 Cuota GA4 excedida
- **Textos** [OFICIAL]: `Exhausted concurrent requests quota. Please send fewer requests concurrently.` · `This property has issued too many requests in the last day.` · `...in the last hour.` · `Too many requests using this Google Analytics property have encountered errors in the last hour.` · `This property has issued too many potentially thresholded requests in the last hour.` · `This project/property has issued too many requests in the last hour.` · `This property is denied access to Google Analytics.`
- **Límites** (estándar / 360): 200 000 / 2 000 000 tokens/día; 40 000 / 400 000 tokens/hora; 14 000 / 140 000 tokens por proyecto+propiedad/hora; 10 / 50 concurrentes; 120 peticiones con posible umbral/hora. La cuota es **por propiedad**: afecta a todos los usuarios. [OFICIAL]
- **Detección**: regex de cuota; en edición, clic derecho → *Google Analytics token usage*.
- **Solución**: credenciales del propietario; una fuente GA4 reutilizable; menos gráficos/páginas; quitar embebidos de alto tráfico; extraer datos (esperar hasta 24 h a que se reinicie la cuota); exportar a BigQuery; Analytics 360; conector de partner. [OFICIAL]

### 2.7 Credenciales / permisos
- **Textos**: `No data set access`, `We are sorry, but you do not have access to this service...`, `You do not have access to Data Studio. To enable this service, please log in to the Admin console.`, diálogo OAuth.
- **Causas**: visor sin acceso con credenciales de visor; propietario de credenciales perdió acceso o dejó la empresa; servicio deshabilitado por el admin de Workspace. [OFICIAL]
- **Solución**: cambiar a credenciales del propietario (si es aceptable) o dar acceso al dataset; reasignar credenciales a una cuenta válida/cuenta de servicio; pedir al admin habilitar el servicio (el emisor no puede arreglarlo). GA4: permiso Read & Analyze. [OFICIAL]
- Emails/alertas programadas tras VPC-SC (`Organization VPC Service Controls prohibit access...`, `Service Control Failure`) → cuenta de servicio o nivel de acceso basado en identidad. [OFICIAL]

### 2.8 Errores de campos calculados (definidos por el usuario)
| Texto [OFICIAL] | Solución |
|---|---|
| `Invalid field name.` | revisar nombre/caracteres |
| `Invalid function name.` | revisar función |
| `Missing quotes.` | comillas emparejadas |
| `Mismatched parentheses.` | equilibrar paréntesis |
| `Function argument type mismatch.` | `CAST()` / tipo correcto |
| `Re-aggregating metrics is not supported.` | no aplicar SUM/AVG a métricas ya agregadas |
| `An expression can have either metrics or dimensions, but not both.` | separar o agregar todos los términos |
| `Metric expressions and aggregations are not allowed in this expression.` | crear como métrica |
- **Detección**: el editor de fórmulas resalta la parte errónea; leer el mensaje bajo la fórmula.

### 2.9 Errores de blends
| Texto [OFICIAL] | Solución |
|---|---|
| `One or more join configurations is incomplete.` | completar operador y condición |
| `One or more join configurations is missing a join condition.` | añadir condición (salvo cross join) |
| `Join key incomplete. Each selected data source must specify a join key field for every join key.` | añadir la clave en cada tabla |
| `One or more tables is missing its data source.` | reconectar la tabla |
- **Detección**: caja de join en rojo o campo rosa "Missing" en la configuración del blend.
- Otros: cifras infladas o colapsadas → revisar cardinalidad y añadir ID único; cross join → filas multiplicadas.

### 2.10 BigQuery
`Field is ambiguous` (alias), `HTTP 504 Gateway timeout` (3–5 min; simplificar, BI Engine, vistas materializadas), selector congelado (> 5 000 tablas), truncado (> 2 M filas), `CONDITION_NOT_MET` (CMEK), custom SQL con DECLARE/SET (usar un único SELECT). [OFICIAL]

### 2.11 Muestreo, umbrales y discrepancias GA4
- El conector usa los informes estándar/Data API, no Explorations; las cifras de usuarios y sesiones son estimaciones. [OFICIAL + CONVENCIÓN]
- Data Studio no avisa de muestreo como la UI de GA4. [CONVENCIÓN, MeasureSchool]
- Diferencias normales: vistas ±10 %, usuarios/sesiones ±20 % (vs UA). Key events pueden reprocesarse hasta 7 días. [OFICIAL]
- Segmentos y comparaciones de GA4 no están disponibles en el conector. Filtros por campo calculado → totales `null`. [OFICIAL]
- **Solución**: comparar mismo rango, excluir hoy, misma métrica (Total vs Active users), comparar con informes estándar; para exactitud usar export de BigQuery.

### 2.12 Zona horaria y rango de fechas [CONVENCIÓN]
- Síntoma: totales diarios desplazados o distintos a GA4/Ads.
- Causas: zona horaria de la propiedad/cuenta vs datos en UTC (BigQuery, algunos conectores envían GMT), rango "hoy" incompleto, rango de fechas de la tabla del blend en Custom.
- Solución: comprobar zona horaria de la propiedad; en BigQuery convertir con `DATETIME(ts, "Europe/Madrid")`; fijar rango explícito al validar.

### 2.13 Fuentes de Universal Analytics
- Desde el 1-jul-2024 la API UA no devuelve datos: los gráficos UA muestran error de fuente o "sin datos". [OFICIAL]
- **Detección**: fuente con conector Google Analytics apuntando a propiedad UA (ID `UA-XXXXX-Y` / vista) en *Administrar fuentes de datos agregadas*.
- **Solución**: migrar (ver `migracion.md`).

### 2.14 No se puede guardar / UI rota
`Sorry! We can't save this report right now.` → extensiones del navegador; deshabilitarlas. [OFICIAL]

## Procedimiento `skill_debug_report`
1. Abrir el informe en modo edición; recorrer todas las páginas.
2. Para cada componente: clasificar con las regex del §0 → categoría del catálogo.
3. Agrupar errores por fuente de datos (un fallo de fuente suele romper muchos gráficos).
4. Resolver primero fuentes/credenciales (2.4, 2.7), luego cuota (2.6), luego componentes (2.1, 2.2, 2.8, 2.9).
5. Tras cada corrección, recargar y re-escanear (refresco manual tiene cooldown de 1 min).
6. Si persiste: copiar informe, dejar solo el componente que falla y reportar con ID de error.

## Fuentes
- https://docs.cloud.google.com/looker/docs/studio/troubleshooting-guide
- https://docs.cloud.google.com/data-studio/add-edit-and-troubleshoot-calculated-fields
- https://docs.cloud.google.com/data-studio/create-edit-and-manage-blends
- https://docs.cloud.google.com/looker/docs/studio/how-blends-work-in-looker-studio
- https://docs.cloud.google.com/looker/docs/studio/bigquery-connector-troubleshooting
- https://docs.cloud.google.com/looker/docs/studio/connect-to-google-analytics
- https://docs.cloud.google.com/looker/docs/studio/replace-the-data-source-for-a-component-page-or-report
- https://docs.cloud.google.com/data-studio/data-credentials
- https://docs.cloud.google.com/data-studio/manage-data-freshness
- https://developers.google.com/analytics/devguides/reporting/data/v1/quotas
- https://support.google.com/analytics/answer/11583528
- https://support.google.com/analytics/answer/11986666
- https://measureschool.com/data-discrepancies-between-ga4-and-looker-studio/
