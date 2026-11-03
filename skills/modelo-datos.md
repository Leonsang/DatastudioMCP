# Skill: Modelo de datos (fuentes, campos, blends, parámetros)

> **[OFICIAL]** = documentado por Google. **[CONVENCIÓN]** = práctica de la comunidad.

## 1. Fuentes de datos: embebidas vs reutilizables
| | Embebida | Reutilizable |
|---|---|---|
| Dónde se crea | dentro del informe | desde la home de Data Studio |
| Al copiar el informe | **se copia** (salvo credenciales del propietario y quien copia no es el propietario → no se copia y los gráficos dan error) | **no se copia**; la copia sigue apuntando a la misma fuente |
| Quién edita | cualquier editor del informe | solo a quien se comparte; solo el propietario de credenciales cambia la conexión |
| Conversión | *Recurso > Administrar fuentes de datos agregadas > Hacer reutilizable* (hay que ser propietario de credenciales). **No se puede volver a embebida.** | — |
[OFICIAL]
- Identificar tipo: columna "Type" en *Recurso > Administrar fuentes de datos agregadas*. [OFICIAL]
- Regla: modelos compartidos por varios informes → reutilizable; prototipos/informes aislados → embebida. [CONVENCIÓN alineada con Google]
- Las embebidas pueden exponer datos/metadatos sensibles a editores: ocultar campos no usados. [OFICIAL]

## 2. Credenciales
- **Propietario**: los visores ven datos sin acceso propio al dataset; compartir con confianza. Permite reutilizar caché (Google lo recomienda para cuotas GA4). [OFICIAL]
- **Visor**: cada visor necesita acceso al dataset. Desde sep-2025, hipervínculos e imágenes no se renderizan con credenciales de visor salvo que editor y visor compartan team workspace. [OFICIAL]
- **Cuenta de servicio**: para usuarios no humanos; necesaria para emails/alertas programadas tras VPC-SC. [OFICIAL]
- GA4 requiere permiso **Read & Analyze** (Lector y analista) o superior en la propiedad. [OFICIAL]

## 3. Campos: dimensiones vs métricas
- Dimensión = categoría (texto, fecha, geo); métrica = valor numérico agregado (SUM, AVG, COUNT, COUNT_DISTINCT, MIN, MAX). [OFICIAL]
- Fuentes de esquema fijo (GA4, Ads) traen métricas pre-agregadas: **no se pueden re-agregar** (SUM(Sessions) da error). [OFICIAL]
- En blends, las métricas de la fuente pasan a ser dimensiones numéricas no agregadas. [OFICIAL]

## 4. ID de campo vs nombre visible
- Cada campo tiene un **ID interno único**; los controles de filtro filtran por ID de campo. [OFICIAL]
- El ID **no se puede editar** en el editor de la fuente (para no romper otros informes); sí se puede **sobrescribir a nivel de informe** (útil para filtrar gráficos de fuentes distintas). [OFICIAL]
- Al reemplazar una fuente, Google mapea campos por **ID**, nombre y otra configuración; campos calculados y filtros **no se mapean**. [OFICIAL]
- Renombrar el nombre visible es seguro; ocultar un campo usado en otro informe **rompe** esos gráficos. [OFICIAL]
- Cambiar el ID de un parámetro rompe componentes y campos que lo usan. [OFICIAL]
- Regla del agente: al leer el DOM, identificar campos por nombre visible pero registrar el ID cuando esté disponible (panel de la fuente) para comparaciones en migraciones.

## 5. Campos calculados
- **De fuente** (fx, disponibles en todos los informes; requieren permiso de edición de la fuente) vs **de gráfico** (solo ese gráfico; no reutilizables; válidos con blends; se copian con el gráfico). [OFICIAL]
- El formato personalizado de valor solo existe en campos de gráfico. [OFICIAL]
- Reglas [OFICIAL]:
  - Nombres únicos, sin palabras reservadas.
  - No mezclar dimensiones y métricas en los argumentos de una función → error *"An expression can have either metrics or dimensions, but not both."*
  - No re-agregar → *"Re-aggregating metrics is not supported."*
  - Dimensión de gráfico sin agregaciones → *"Metric expressions and aggregations are not allowed in this expression."*
  - Texto: usar `CONCAT()`, no `+`. Tipos: usar `CAST()` ante *"Function argument type mismatch."*
- Patrones [CONVENCIÓN]:
  - Agrupar canales: `CASE WHEN REGEXP_MATCH(Session source / medium, ".*google / cpc.*") THEN "Paid Search" ... ELSE "Otros" END` (siempre con `ELSE`).
  - Ratios como métrica: `SUM(a) / SUM(b)`, nunca `SUM(a/b)` (en fuentes de esquema flexible).
  - Evitar división por cero: `CASE WHEN SUM(b) = 0 THEN NULL ELSE SUM(a)/SUM(b) END`.
  - Lógica pesada → al warehouse.

## 6. Parámetros
- Tipos: texto, número, booleano. Valores permitidos: cualquiera, lista (con nombre visible) o rango min–máx. Valor por defecto obligatorio en la práctica (si se oculta, se usa el defecto). [OFICIAL]
- Por URL: JSON URL-encoded en `params`; hay que habilitar cada uno en *Recurso > Administrar variables (parámetros)*, columna "Allow to be modified in report URL". [OFICIAL]
- BigQuery custom SQL acepta parámetros estándar (fecha inicio/fin, email del usuario) y personalizados (`@nombre`). [OFICIAL]
- Precedencia (menor → mayor): fuente, informe, página, grupo, gráfico/control. [OFICIAL]
- Riesgo: un parámetro puede exponer otra cuenta/tabla; restringir valores permitidos. [OFICIAL]

## 7. Blends
- Hasta **5 tablas**; cada tabla se une a la anterior. Joins: Inner, Left outer, Right outer, Full outer, Cross. Solo **igualdad** en condiciones (no <, >, ≠). Cross no usa condición. [OFICIAL]
- Cada tabla se agrega por sus dimensiones antes del join; sin clave única, filas idénticas colapsan → añadir un ID único si se necesitan filas. [OFICIAL]
- Un campo calculado de una tabla no puede referenciar campos de otra: usar campo de gráfico. [OFICIAL]
- Los blends son del informe (no reutilizables), se copian con él, heredan frescura y credenciales. Gestión: *Recurso > Administrar datos combinados*. [OFICIAL]
- Mover tablas puede romper condiciones; filtros de tabla solo con campos de esa tabla. [OFICIAL]
- Claves de join del mismo tipo de dato; normalizar mayúsculas/formato con campos calculados. [OFICIAL + CONVENCIÓN]
- Por defecto, **Left outer** con la tabla principal (hechos) a la izquierda. [CONVENCIÓN]

## 8. Convenciones de nombres [CONVENCIÓN]
- Fuentes: `[Plataforma] - [Cuenta/Propiedad] - [Nivel/Granularidad]`, p. ej. `GA4 - Tienda ES - Sesiones` o `BQ - ventas_diarias`.
- Campos calculados: prefijo de tipo o sufijo claro: `KPI_Tasa conversión`, `Dim_Canal agrupado`; evitar duplicar nombres del conector.
- Parámetros: `p_` + nombre (`p_objetivo_ingresos`).
- Blends: `Blend - [Fuente A] x [Fuente B] por [clave]`.
- Páginas: verbo/tema corto ("Resumen", "Adquisición", "Ecommerce").

## Procedimiento `skill_data_model_review`
1. Inventariar fuentes (tipo, conector, credenciales, frescura, nº de informes que la usan).
2. Duplicados → proponer una reutilizable.
3. Campos calculados: detectar errores de sintaxis, re-agregaciones, mezclas dim/métrica, CASE sin ELSE.
4. Blends: nº tablas, joins, claves, tipos; cross joins.
5. Parámetros: ID estables, valores permitidos acotados.
6. Credenciales: GA4 con muchos visores → propietario; datos sensibles → visor.
7. Nombres según convención.

## Fuentes
- https://docs.cloud.google.com/data-studio/embedded-data-sources
- https://docs.cloud.google.com/data-studio/data-credentials
- https://docs.cloud.google.com/data-studio/add-edit-and-troubleshoot-calculated-fields
- https://docs.cloud.google.com/looker/docs/studio/edit-a-data-source-article
- https://docs.cloud.google.com/looker/docs/studio/parameters
- https://docs.cloud.google.com/looker/docs/studio/how-blends-work-in-looker-studio
- https://docs.cloud.google.com/data-studio/create-edit-and-manage-blends
- https://docs.cloud.google.com/looker/docs/studio/replace-the-data-source-for-a-component-page-or-report
- https://docs.cloud.google.com/looker/docs/studio/connect-to-google-analytics
- https://docs.cloud.google.com/data-studio/release-notes
