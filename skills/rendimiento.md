# Skill: Rendimiento de informes

> **[OFICIAL]** = documentado por Google. **[CONVENCIÓN]** = práctica de la comunidad.

## 1. Límites oficiales relevantes
| Límite | Valor | Fuente |
|---|---|---|
| Extracto de datos (Extract Data) | **100 MB** y **750 000 filas** (si se supera el tamaño falla; si se superan filas, trunca) | [OFICIAL] |
| Blends | **máx. 5 tablas** por blend; solo condiciones de igualdad | [OFICIAL] |
| Filas por consulta BigQuery | **2 millones** por consulta de gráfico (más → truncado) | [OFICIAL] |
| Timeout BigQuery | ~**3–5 min** → `HTTP 504 Gateway timeout` | [OFICIAL] |
| Tablas por dataset BigQuery | > **5 000** congela el selector | [OFICIAL] |
| Tabla: dims/métricas | fuentes de esquema fijo (GA, Ads): **10 dims / 20 métricas**; esquema flexible (Sheets, BQ, SQL): **100 / 100** | [OFICIAL] |
| Refresco manual | cooldown de **1 minuto** | [OFICIAL] |
| Usuarios concurrentes | Data Studio no impone límite; el límite lo pone la fuente | [OFICIAL] |
| GA4 Data API (estándar / 360) | tokens/día 200 000 / 2 000 000; tokens/hora 40 000 / 400 000; tokens por proyecto+propiedad/hora 14 000 / 140 000; peticiones concurrentes 10 / 50; errores servidor/hora 10 / 50; peticiones con posible umbral 120/hora | [OFICIAL] |

## 2. Componentes y consultas por página
- Cada gráfico/control con datos genera consultas al cargar; más componentes = más consultas. [OFICIAL implícito / practicantes]
- Objetivo: **≤ 10–15 componentes con datos por página**; evitar **≥ 25 consultas** por página. [CONVENCIÓN]
- Repartir en varias páginas: cada página solo consulta al abrirse. [CONVENCIÓN]
- Consolidar: varios scorecards de la misma fuente → una tabla; varias series temporales → un gráfico con varias métricas. [CONVENCIÓN, Databloo]
- Componentes **a nivel de informe** (filtros, logo) se repiten en todas las páginas: no poner gráficos con datos a nivel de informe salvo necesidad. [CONVENCIÓN]

## 3. Caché y frescura de datos
| Conector | Opciones | Por defecto |
|---|---|---|
| BigQuery | 1–50 min o 1–12 h | **12 h** |
| Google Analytics | 1, 4 o 12 h | **12 h** |
| Google Sheets | 15 min, 1 h, 4 h, 12 h | **15 min** |
| Google Ads, CM360, Search Console, YouTube | fijo | **12 h** |
| MySQL/PostgreSQL/Redshift/Cloud SQL | 1–50 min o 1–12 h | — |
[OFICIAL]
- Una consulta repetida dentro del umbral se sirve desde memoria; consultas nuevas siempre van a la fuente. [OFICIAL]
- Regla: usar la frescura **más larga aceptable para el negocio** (diaria para Ads; varias veces al día para social). [OFICIAL ejemplos]
- Los extractos no usan frescura: tienen programación de auto-actualización. [OFICIAL]
- Credenciales del propietario permiten compartir caché entre visores (recomendado por Google para cuotas GA4). [OFICIAL]

## 4. Extract Data
- Usar cuando: fuente lenta o con cuota (GA4, conectores de partners), datos que no necesitan tiempo real, ≤ 750 000 filas.
- Extraer solo dimensiones/métricas necesarias y un rango de fechas acotado.
- Activar Auto update. Solo el propietario ve "EDIT CONNECTION". [OFICIAL]
- Extraer desde fuentes agregadas (GA, Ads) produce datos desagregados: se puede elegir cualquier agregación, pero cuidado con métricas no aditivas (usuarios, tasas). [OFICIAL + nota del agente]

## 5. BigQuery y BI Engine
- BI Engine mejora rendimiento y reduce coste de cómputo en informes BigQuery. [OFICIAL]
- Restricciones citadas por practicantes: solo INNER y LEFT OUTER joins aceleran; hasta 4 tablas dimensión < 5 M filas; resultados > 1 GiB no se aceleran. [CONVENCIÓN — verificar en docs BI Engine]
- Preferir tablas/vistas materializadas o tablas de consultas programadas frente a vistas pesadas en tiempo de ejecución. [OFICIAL]
- Particionar por fecha y clusterizar; usar filtros de partición; agrupar dimensiones de alta cardinalidad en BigQuery. [OFICIAL]
- Custom SQL debe ser un único `SELECT` (sin DECLARE/SET). [OFICIAL]
- Activar BigQuery Storage Read API (permisos `bigquery.readsessions.create` y `.getData`). [OFICIAL]

## 6. Blends
- Máx. 5 tablas; cada tabla se agrega por sus dimensiones antes del join. [OFICIAL]
- Los blends son costosos: si se usan a menudo, pre-unir en BigQuery/Sheets en una tabla maestra. [CONVENCIÓN]
- Evitar cross join (crecimiento multiplicativo). [CONVENCIÓN]

## 7. Filtros vs campos calculados
- Filtrar en origen (vista, custom query, filtro de la fuente) antes que en el gráfico. [CONVENCIÓN]
- Mover lógica pesada (CASE largos, REGEXP) al data warehouse; borrar campos calculados sin uso. [CONVENCIÓN]
- Filtros basados en campos calculados: en GA4 la fila de totales no aparece/da `null`. [OFICIAL]

## 8. Cardinalidad y tablas
- Evitar dimensiones de alta cardinalidad (URL completa con query string, ID de usuario, timestamp) en gráficos; usar Top N + "Group others", o agrupar. [CONVENCIÓN + OFICIAL opción]
- Tablas: paginación activa por defecto; "Per page" para filas por página (sugerido **10–25**). Top N desactiva la paginación. [OFICIAL opciones / CONVENCIÓN valor]
- ≤ 50 columnas por tabla. [CONVENCIÓN]
- Rango de fechas por defecto corto ("últimos 7/28 días") en vez de "año pasado". [CONVENCIÓN]

## 9. GA4: cuota de tokens
- Ver uso: en modo edición, clic derecho en el lienzo (informe) o en un gráfico → **Google Analytics token usage**. [OFICIAL]
- Mitigar: credenciales del propietario, una sola fuente GA4 reutilizable, menos gráficos, extraer datos, exportar GA4 a BigQuery, Analytics 360. [OFICIAL]

## Procedimiento `skill_performance_audit`
1. Por página: contar componentes con datos; marcar > 15.
2. Listar fuentes (*Recurso > Administrar fuentes de datos agregadas*): tipo, conector, credenciales, frescura.
3. Detectar duplicados de la misma fuente → proponer una reutilizable.
4. Listar blends (*Recurso > Administrar datos combinados*): nº de tablas, tipo de join; marcar cross join.
5. Revisar tablas: paginación, columnas > 10, dimensiones de alta cardinalidad.
6. GA4: medir tokens por página; si > ~25 % de la cuota horaria por carga, proponer extracto o BigQuery.
7. BigQuery: revisar particionado, BI Engine, Storage Read API.
8. Emitir informe con prioridad (alto: timeouts/cuota; medio: blends/cardinalidad; bajo: estilo).

## Fuentes
- https://docs.cloud.google.com/looker/docs/studio/improve-performance
- https://docs.cloud.google.com/data-studio/extract-data-for-faster-performance
- https://docs.cloud.google.com/data-studio/manage-data-freshness
- https://docs.cloud.google.com/looker/docs/studio/how-blends-work-in-looker-studio
- https://docs.cloud.google.com/looker/docs/studio/bigquery-connector-troubleshooting
- https://docs.cloud.google.com/bigquery/docs/bi-engine-looker-studio
- https://docs.cloud.google.com/looker/docs/studio/table-reference
- https://docs.cloud.google.com/looker/docs/studio/troubleshooting-guide
- https://docs.cloud.google.com/looker/docs/studio/connect-to-google-analytics
- https://developers.google.com/analytics/devguides/reporting/data/v1/quotas
- https://www.kevinleary.net/blog/optimizing-slow-looker-studio-reports/
- https://www.databloo.com/blog/speed-up-looker-studio/
