# Skills para el MCP de Looker Studio / Data Studio

Guías accionables (en español) para que un LLM cree, migre y depure informes manejando el editor en el navegador. Cada skill marca qué reglas son **[OFICIAL]** (Google/W3C) y cuáles son **[CONVENCIÓN]** de la comunidad.

> Nota: desde el 16-abr-2026 Looker Studio se llama **Data Studio** (Pro → Data Studio Pro). La UI y la documentación pueden usar los dos nombres.

| Archivo | Descripción | Prompt MCP propuesto |
|---|---|---|
| `diseno-layout.md` | Lienzo, rejilla, espaciado, jerarquía, color, tipografía, accesibilidad, responsive y embebido | `skill_layout_audit` |
| `kpi-scorecards.md` | Filas de KPIs: nº de tarjetas, anchos, comparación de periodos, números compactos, sparklines, formato condicional | `skill_kpi_row` |
| `rendimiento.md` | Componentes por página, caché/frescura, extractos, BI Engine, blends, cardinalidad, cuotas GA4 | `skill_performance_audit` |
| `modelo-datos.md` | Fuentes embebidas vs reutilizables, credenciales, dimensiones/métricas, IDs de campo, calculados, parámetros, blends, nombres | `skill_data_model_review` |
| `migracion.md` | UA → GA4 (tabla de mapeo), cambio de fuentes, qué se rompe, flujo con copia, paso a Pro, checklist | `skill_migrate_ua_to_ga4` |
| `depuracion-errores.md` | Catálogo de errores con síntomas, detección programática (texto DOM / estado del componente) y solución | `skill_debug_report` |

## Uso sugerido en el servidor MCP
- Exponer cada archivo como **prompt** MCP (nombre de la tabla) y, opcionalmente, como **resource** (`skill://<archivo>`), para que el modelo lo cargue antes de actuar.
- Encadenamientos típicos:
  - Crear informe: `skill_layout_audit` (plan) → `skill_kpi_row` → `skill_performance_audit` (verificación).
  - Migrar: `skill_data_model_review` → `skill_migrate_ua_to_ga4` → `skill_debug_report`.
  - Depurar: `skill_debug_report` → `skill_data_model_review` si el fallo es de fuente/campos.
