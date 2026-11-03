# Skill: Migraciones (UA → GA4, cambio de fuentes, Pro)

> **[OFICIAL]** = documentado por Google. **[CONVENCIÓN]** = práctica de la comunidad.

## 1. Contexto
- Universal Analytics: desde el **1-jul-2024** (semana del 1-jul para la mayoría, incluido UA 360) las peticiones a la API de UA fallan y **Looker Studio no muestra datos de UA**. Los datos ya exportados a BigQuery siguen disponibles. [OFICIAL]
- No se puede importar el histórico de UA en GA4 (modelos distintos). Para continuidad: exportes previos (BigQuery/Sheets) + blend o `CASE` por fecha de corte. [CONVENCIÓN]
- GA4 renombró "Conversions" a **"Key events"** (marzo 2024); "Conversions" queda para Google Ads. La página oficial de comparación UA/GA4 ya usa "key events". [OFICIAL término / fecha según fuentes secundarias]
- El 16-abr-2026 Looker Studio pasó a llamarse **Data Studio** (Pro → Data Studio Pro); informes, fuentes y enlaces se mantienen. [OFICIAL]

## 2. Mapeo UA → GA4 (conector Google Analytics)
| UA (Looker/Data Studio) | GA4 (nombre UI / API) | Nota |
|---|---|---|
| Users (`ga:users`) | **Total users** (`totalUsers`) | UA reportaba total; GA4 muestra **Active users** (`activeUsers`) como "Users" principal. Elegir según se quiera comparar |
| New Users | New users (`newUsers`) | |
| Sessions | Sessions (`sessions`) | Sesión GA4 no se reinicia a medianoche ni por campaña; cifras estimadas |
| Bounce Rate | **Engagement rate** (`engagementRate`) o Bounce rate (`bounceRate`) | GA4 bounce = 1 − engagement rate (sesión comprometida: ≥ 10 s, entre otros criterios) |
| Pageviews | **Views** (`screenPageViews`) | Incluye pantallas de app; o Event count filtrado a `page_view` |
| Unique Pageviews | — (aprox. Sessions con dimensión de página) | Sin equivalente directo |
| Pages / Session | Views per session (`screenPageViewsPerSession`) | |
| Avg. Session Duration | Average session duration (`averageSessionDuration`) | |
| Avg. Time on Page | User engagement (`userEngagementDuration`) / Views (campo calculado) | Se calcula distinto |
| Goal Completions (All) | **Key events** (`keyEvents`) | GA4 cuenta cada ocurrencia; UA 1 por sesión y objetivo |
| Goal Conversion Rate | Session key event rate (`sessionKeyEventRate`) | |
| Total Events | Event count (`eventCount`) | |
| Unique Events | — | Sin equivalente |
| Event Category / Action / Label | **Event name** + parámetros personalizados (custom dimensions) | Ya no existen |
| Page (`ga:pagePath`) | **Page path + query string** (`pagePathPlusQueryString`) | `ga:pagePath` incluía query string; *Page path* (`pagePath`) no |
| Page Title | Page title (`pageTitle`) | |
| Landing Page | Landing page + query string (`landingPagePlusQueryString`) | |
| Previous Page Path | Page referrer | Técnicamente distinto |
| Hostname | Hostname (`hostName`) | |
| Default Channel Grouping | **Session default channel group** (`sessionDefaultChannelGroup`) | Ámbito sesión; existe también "First user…" |
| Source / Medium | Session source / medium (`sessionSourceMedium`) | |
| Source / Medium (separados) | Session source / Session medium | |
| Campaign | Session campaign (`sessionCampaignName`) | |
| User Type | New / returning (`newVsReturning`) | |
| Device Category | Device category (`deviceCategory`) | |
| Country / City | Country / City | |
| Revenue | Total revenue (`totalRevenue`) / Purchase revenue (`purchaseRevenue`) | Total incluye suscripciones/ads |
| Transactions | Transactions (`transactions`) / Ecommerce purchases | |
| Product | Item name (`itemName`) | Ámbito item: no mezclar con métricas de sesión |
| Product Revenue | Item revenue (`itemRevenue`) | |
| Views (UA view) | — | Recrear con filtros de fuente/gráfico |
| Segments | — | El conector GA4 **no admite segmentos ni comparaciones** de GA4; usar filtros o *Audience name* |
[OFICIAL para nombres GA4 y diferencias de métricas; CONVENCIÓN para correspondencias exactas UA→GA4]

Diferencias esperables: vistas de página hasta ~**10 %** y usuarios/sesiones hasta ~**20 %**. GA4 procesa key events hasta **7 días** después. [OFICIAL]

## 3. Cambiar la fuente de un informe
Rutas [OFICIAL]:
- **Componente**: seleccionar gráfico(s) → panel *Setup* → clic en nombre de la fuente → elegir otra → *Agregar al informe*.
- **Página**: *Página > Configuración de la página actual* → fuente.
- **Informe**: *Archivo > Configuración del informe* → fuente. (Página/informe solo afectan a componentes nuevos.)
- Añadir fuente nueva: *Recurso > Administrar fuentes de datos agregadas > Agregar una fuente de datos*.
- Data Studio mapea por **ID de campo**, nombre y configuración; **campos calculados y filtros no se mapean**. Sin coincidencia → *"Chart configuration incomplete. Invalid/Missing dimensions, metrics, filters."* [OFICIAL]

## 4. Qué se rompe
- Dimensiones/métricas UA sin equivalente (Category/Action/Label, Unique events, Unique pageviews).
- **Campos calculados** que referencian campos UA (no se mapean).
- **Filtros** y controles de filtro (por ID de campo).
- **Segmentos** UA (no existen en el conector GA4).
- Rangos de fechas y ordenaciones que usaban campos UA.
- Combinaciones dimensión/métrica de ámbitos incompatibles (evento vs usuario vs item) → *"Invalid combination of metrics and dimensions"*; comprobar con el GA4 Dimensions & Metrics Explorer.
- Blends con tablas UA (reconectar tabla).
- Fuentes embebidas con credenciales de propietario si quien copia no es el propietario.

## 5. Flujo recomendado (copia de informe)
1. **Copia de referencia**: *Archivo > Hacer una copia* (o PDF) del original. Editar el original si hay que conservar la URL. [OFICIAL GOV.UK / CONVENCIÓN]
2. Inventariar: páginas, componentes, campos usados, calculados, filtros, blends (guardar JSON).
3. Añadir la fuente GA4 (una sola, reutilizable, credenciales del propietario).
4. Reemplazar la fuente **componente a componente** (o seleccionar todos los de una página).
5. Recorrer componentes con error y reasignar campos según la tabla del §2.
6. Recrear campos calculados en la fuente GA4 y filtros.
7. Sustituir segmentos por filtros/controles.
8. Validar contra la UI de GA4 (informes estándar, no Explorations) mismo rango, sin "hoy".
9. Eliminar la fuente UA de *Administrar fuentes de datos agregadas* cuando no la use nadie.

## 6. Data Studio → Data Studio Pro
- Pro: los activos **pertenecen a la organización** (proyecto de Google Cloud, IAM), team workspaces (Manager, Content Manager, Contributor), hasta **200** programaciones por informe, alertas, Gemini, soporte Cloud Customer Care (requiere plan de soporte), CMEK y residencia de datos. Prueba de **30 días**. [OFICIAL]
- Migración [CONVENCIÓN]: suscribir proyecto → crear team workspaces → mover informes/fuentes al workspace → revisar propietario de credenciales (usar cuentas de servicio para fuentes críticas) → verificar programaciones.

## Checklist `skill_migrate_ua_to_ga4`
- [ ] Copia de referencia creada.
- [ ] Inventario de campos UA usados por componente.
- [ ] Fuente GA4 única, reutilizable, permiso Read & Analyze.
- [ ] Todos los componentes reasignados; 0 componentes en estado de error.
- [ ] Calculados y filtros recreados; segmentos sustituidos.
- [ ] Etiquetas renombradas (p. ej. "Conversiones" → "Key events").
- [ ] Validación de cifras con tolerancia (±10 % vistas, ±20 % usuarios/sesiones).
- [ ] Nota en el informe explicando el cambio de definiciones.
- [ ] Fuente UA retirada.

## Fuentes
- https://support.google.com/analytics/answer/11583528
- https://support.google.com/analytics/answer/11986666
- https://developers.google.com/analytics/devguides/reporting/data/v1/api-schema
- https://docs.cloud.google.com/looker/docs/studio/replace-the-data-source-for-a-component-page-or-report
- https://docs.cloud.google.com/looker/docs/studio/connect-to-google-analytics
- https://docs.cloud.google.com/data-studio/embedded-data-sources
- https://docs.cloud.google.com/looker/docs/studio/about-looker-studio-pro
- https://docs.cloud.google.com/data-studio/release-notes
- https://docs.data-community.publishing.service.gov.uk/analysis/govuk-ga4/understand-ua-differences/migrate-assets
- https://bounteous.com/insights/2023/03/06/ua-ga4-dashboard-migration-looker-studio
