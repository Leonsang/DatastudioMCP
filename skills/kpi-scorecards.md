# Skill: Filas de KPIs y scorecards

> **[OFICIAL]** = documentado por Google. **[CONVENCIÓN]** = práctica de la comunidad.

## 1. Patrón de fila de KPIs
| Regla | Valor | Tipo |
|---|---|---|
| Nº de tarjetas por fila | **4–6** (máx. 8 en dos filas) | [CONVENCIÓN] |
| Posición | justo bajo la cabecera, en el primer pantallazo | [CONVENCIÓN] |
| Ancho por tarjeta (lienzo 1200 px, margen 20, gap 20) | 4 tarjetas ≈ 275 px; 5 ≈ 216 px; 6 ≈ 177 px | cálculo |
| Alto de tarjeta | 100–140 px (con sparkline ~140 px) | [CONVENCIÓN] |
| Orden | de la métrica de negocio principal (ingresos/conversiones) a las de soporte (sesiones, usuarios) | [CONVENCIÓN] |

Fórmula de ancho: `w = (ancho_lienzo − 2·margen − (n−1)·gap) / n`, redondeado hacia abajo a múltiplo de la rejilla.

Todas las tarjetas de la fila: mismo alto, mismo `y`, misma fuente de datos y mismos filtros/rango de fechas (salvo que se indique explícitamente).

## 2. Opciones del scorecard (pestaña Setup)
- **Comparison type**: Period, Value, Metric o None. **Comparison date range** solo aparece con "Period". [OFICIAL]
- **Show as progress**: trata el valor de comparación como objetivo y muestra % de progreso; **desactiva el sparkline**. Admite "Starting value". [OFICIAL]
- **Sparkline**: requiere que el campo primario sea una Métrica; *Add dimension* con una dimensión de fecha. [OFICIAL]

## 3. Opciones de estilo (pestaña Style)
- Métrica primaria: **Compact numbers** (p. ej. 354 700 → 354.7K) y **Decimal precision**. [OFICIAL]
- Comparación: **Positive change color**, **Negative change color**, Compact numbers, Decimal precision, **Show absolute change**, **Hide comparison label**. [OFICIAL]
- Sparkline: color, Fill, Smooth, Missing data (Line to zero / Line breaks / Linear interpolation). [OFICIAL]
- Progress visual: Bar, Circle o None. [OFICIAL]
- Formato condicional: *Add conditional formatting* (Style). [OFICIAL]

## 4. Reglas de periodo de comparación
- Por defecto usar **Periodo anterior** (p. ej. "Últimos 28 días" vs los 28 días previos). [CONVENCIÓN]
- Para negocios estacionales, añadir/usar **mismo periodo del año anterior**. [CONVENCIÓN]
- Rango por defecto del informe: **últimos 28 días** o "mes pasado"; excluir "hoy" en GA4 (datos incompletos). [CONVENCIÓN, ver `depuracion-errores.md`]
- Aplicar el mismo tipo de comparación a todas las tarjetas de una fila. [CONVENCIÓN]

## 5. Números compactos y precisión
| Tipo de métrica | Formato | Decimales |
|---|---|---|
| Conteos ≥ 10 000 | Compact numbers ON (12.3K, 1.2M) | 1 |
| Conteos < 10 000 | Compact OFF, separador de miles | 0 |
| Moneda | símbolo + compact si ≥ 10 000 | 0–1 (compact), 2 (no compact) |
| Tasas (%) | porcentaje | 1 |
| Duraciones | formato duración (mm:ss) | 0 |
Los umbrales son [CONVENCIÓN]; el redondeo compacto lo hace Google automáticamente.

## 6. Colores de cambio
- Métricas "más es mejor" (ingresos, conversiones): positivo verde, negativo rojo (por defecto).
- Métricas "menos es mejor" (CPC, CPA, rebote, coste): **invertir** Positive/Negative change color. [CONVENCIÓN]
- No depender solo del color: mantener flecha/signo; contraste ≥ 3:1 para el indicador (WCAG non-text). [CONVENCIÓN + W3C]

## 7. Formato condicional
- Usarlo para umbrales de negocio (p. ej. ROAS < 1 en rojo). Máx. **1–2 reglas** por tarjeta. [CONVENCIÓN]
- Preferir umbrales fijos sobre comparativos para evitar confusión con el color de variación. [CONVENCIÓN]

## 8. Rendimiento
- Cada scorecard es al menos una consulta (más con comparación y sparkline). Si hay > 6 KPIs de la misma fuente, valorar una tabla de una fila con varias métricas. [CONVENCIÓN, Databloo]
- En GA4, cada tarjeta consume tokens de cuota; ver `rendimiento.md`.

## Procedimiento `skill_kpi_row`
1. Elegir 4–6 métricas (preguntar objetivo de negocio si no está claro).
2. Calcular ancho con la fórmula; posicionar en `y = alto_cabecera + gap`.
3. Crear el primer scorecard: métrica, Comparison type = Period, Previous period, Compact numbers según tabla, decimales.
4. Si se pide tendencia: añadir sparkline (dimensión Fecha) y alto 140 px; no activar "Show as progress".
5. Duplicar el scorecard (copiar/pegar) y cambiar solo la métrica para heredar estilo.
6. Invertir colores en métricas "menos es mejor".
7. Verificar: mismos `y`/`h`, gaps iguales, ningún estado de error en las tarjetas.

## Fuentes
- https://docs.cloud.google.com/looker/docs/studio/scorecard-reference
- https://www.databloo.com/blog/speed-up-looker-studio/
- https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html
- https://www.lovesdata.com/blog/transform-your-reporting-a-looker-studio-dashboard-design-deep-dive/
