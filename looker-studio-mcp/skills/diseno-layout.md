# Skill: Diseño y layout de informes

> Contexto: desde el 16-abr-2026 Google renombró Looker Studio a **Data Studio** (y Looker Studio Pro a **Data Studio Pro**). La UI y la documentación pueden mostrar cualquiera de los dos nombres; el agente debe aceptar ambos al leer el DOM.
>
> Leyenda: **[OFICIAL]** = documentado por Google/W3C. **[CONVENCIÓN]** = práctica habitual de la comunidad, no es un límite de Google.

## 1. Modo de layout
- Hay dos modos: **Freeform** (lienzo con posiciones en px) y **Responsive** (rejilla de 12 columnas que se adapta al dispositivo). Se cambia en *Tema y diseño > Diseño > Modo de diseño*. [OFICIAL]
- Desde el 31-mar-2025 los "modern charts" son el valor por defecto en informes nuevos. [OFICIAL]
- Pasar de Freeform a Responsive solo funciona con **≤ 1 componente por página**; en otro caso hay que crear un informe responsive nuevo y copiar componentes. Puede perder posiciones, fondos y bordes. [OFICIAL]
- Responsive **no admite**: líneas/flechas, tamaño de lienzo, ajustes de rejilla y Snap To, agrupar componentes (usar secciones), componentes a nivel de informe, rotación, traer adelante/enviar atrás, modos "Ajustar al ancho"/"Tamaño real" y edición simultánea. [OFICIAL]
- Regla del agente: si el informe debe verse en móvil o embebido en una web estrecha, preferir Responsive desde el inicio; si es un informe tipo "PDF/pantalla" con layout preciso, Freeform.

## 2. Tamaño de lienzo (Freeform)
| Regla | Valor | Tipo |
|---|---|---|
| Rango de tamaño personalizado | min 10×10 px, máx **2000 px ancho × 10 000 px alto** | [OFICIAL] |
| Presets | US Letter (4:3), A4 (1.41:1, desde jul-2025), Screen 16:9; cada uno vertical/horizontal | [OFICIAL] |
| Tamaño por página | "Auto" hereda el del informe; una página con tamaño propio ignora el del informe | [OFICIAL] |
| Ancho por defecto típico | **1200 px** (alto ~900 px; 16:9 ≈ 1200×675) | [CONVENCIÓN] |
| Ancho para pantallas de portátil | 1366 px si el público usa 1366×768; no pasar de 1440 sin motivo | [CONVENCIÓN] |
| Alto de "primer pantallazo" | colocar KPIs y tendencia principal en los primeros **~700–900 px** | [CONVENCIÓN] |
| Alto total | páginas de hasta ~2000–2500 px; si hace falta más, dividir en otra página | [CONVENCIÓN] |

Checklist: todas las páginas con el mismo ancho; si una página es "larga", hacerlo explícito en la página (no en el informe).

## 3. Rejilla, espaciado y alineación
- Rejilla mínima del lienzo: **10 px**; ajustes de rejilla: Tamaño, Relleno (padding), Offset horizontal y vertical. "Fill-the-square snapping" empieza con rejilla ≥ **15 px**. [OFICIAL]
- Snap To: *Guías inteligentes* (alinear, redimensionar, espaciar) o *Rejilla*. [OFICIAL]
- Como Google no permite rejilla < 10 px, el "sistema de 8 px" no se puede imponer con el snap. Recomendación del agente [CONVENCIÓN]:
  - Usar rejilla de **10 o 20 px** y múltiplos de ella para x, y, ancho y alto.
  - Margen exterior de página: **20–40 px**.
  - Separación (gutter) entre componentes: **10–20 px**, idéntica en todo el informe.
  - Padding interno de cada tarjeta/gráfico: **10–16 px**.
- Alinear siempre bordes izquierdo/superior y anchos de una misma fila; todas las tarjetas de una fila con el mismo alto.
- Verificación programática: para cada fila (componentes con |y₁−y₂| ≤ 4 px), comprobar mismo `top` y `height`; gaps horizontales con desviación ≤ 2 px; `x mod grid == 0`.

## 4. Jerarquía visual (de arriba abajo)
1. **Cabecera** (título, logo, controles de fecha/filtros): 60–100 px de alto. Controles de rango de fechas arriba a la derecha. [CONVENCIÓN]
2. **Fila de KPIs** (scorecards, ver `kpi-scorecards.md`): 4–6 tarjetas. [CONVENCIÓN]
3. **Tendencias** (series temporales, 1–2 gráficos de ancho completo o 2 columnas).
4. **Desglose** (barras, tablas por canal, dispositivo, etc.).
5. **Detalle** (tablas paginadas) al final.
- Poner KPIs y resúmenes arriba y el detalle conforme se baja es la recomendación de practicantes (Loves Data). [CONVENCIÓN]
- Agrupar gráficos relacionados y separar secciones con cabeceras/divisores. [CONVENCIÓN]

## 5. Densidad
| Regla | Valor | Tipo |
|---|---|---|
| Componentes con datos por página | objetivo **≤ 10–15** (cada uno es al menos una consulta) | [CONVENCIÓN] |
| Consultas por página | evitar **≥ 25** (cifra de guías de rendimiento de Looker citadas por practicantes) | [CONVENCIÓN] |
| Columnas en tablas | ≤ 50 por rendimiento del navegador; para lectura humana ≤ 8–10 | [CONVENCIÓN] |
| Series en un gráfico de líneas | ≤ 5–7; usar Top N + "Otros" | [CONVENCIÓN] |
| Páginas | dividir por audiencia/tema; cada página recarga sus consultas al navegar | [CONVENCIÓN] |

## 6. Estilo consistente
- Definir el tema en *Tema y diseño* (colores, fuente, fondo, bordes) y no sobrescribir por componente salvo excepción. Desde sep-2025 existe estilo masivo para todas las series/dimensiones/métricas. [OFICIAL]
- Bordes: o todas las tarjetas con borde 1 px gris claro, o ninguna. Radio de esquina único (p. ej. **4–8 px**) en todo el informe. Sombras: ninguna o una sola. [CONVENCIÓN]
- Fondo de página claro neutro (#F5F6F8 o blanco) y tarjetas blancas. [CONVENCIÓN]

## 7. Color
- **Un color = un significado** en todo el informe (p. ej. una métrica siempre del mismo color). [CONVENCIÓN, Loves Data]
- Paleta categórica de **≤ 6–8 colores**; un color de acento para lo destacado y gris para el resto. [CONVENCIÓN]
- Verde/rojo solo para variación positiva/negativa; no confiar solo en el color (añadir signo o flecha). [CONVENCIÓN + WCAG]
- Si la métrica "baja es buena" (coste, tasa de rebote), invertir los colores de cambio en el scorecard.

## 8. Tipografía
| Elemento | Tamaño | Tipo |
|---|---|---|
| Título de página | 20–28 px | [CONVENCIÓN] |
| Título de gráfico/sección | 14–16 px, negrita | [CONVENCIÓN] |
| Valor de KPI | 28–36 px | [CONVENCIÓN] |
| Texto, ejes, etiquetas | 11–12 px mínimo, nunca < 10 px | [CONVENCIÓN] |
- Una sola familia tipográfica (máx. 2). Evitar fuentes decorativas. [CONVENCIÓN]

## 9. Accesibilidad
- Contraste de texto **≥ 4.5:1**; texto grande (≥ 18 pt ≈ 24 px, o ≥ 14 pt negrita ≈ 18.5 px) **≥ 3:1**. Elementos gráficos no textuales (líneas, barras, bordes de control) ≥ 3:1. [OFICIAL W3C WCAG 2.2]
- Añadir **texto alternativo** a imágenes (disponible desde jul-2025) y una descripción del informe. [OFICIAL]
- No usar solo color para codificar; etiquetas de datos o leyendas claras.

## 10. Móvil y embebido
- Responsive: secciones de ancho completo, alto = la columna más alta; previsualizar en Teléfono/Tablet/Pantalla grande. [OFICIAL]
- En embebidos los visores **no pueden refrescar datos manualmente**. [OFICIAL]
- Freeform embebido: elegir un ancho igual al del contenedor (iframe) y modo de visualización "Ajustar al ancho". [CONVENCIÓN]
- Navegación: Izquierda, Pestañas, Arriba-izquierda u Oculta; cabecera: Mostrar siempre, Ocultar automáticamente, Inicialmente oculta. Para embebidos de una sola página, ocultar navegación. [OFICIAL opciones / CONVENCIÓN uso]
- Componentes a nivel de informe (logo, filtros globales) aparecen en todas las páginas; posición Top/Bottom configurable. [OFICIAL]

## Checklist de auditoría (`skill_layout_audit`)
- [ ] Mismo ancho de lienzo en todas las páginas; ancho entre 1200 y 1440 px (o Responsive).
- [ ] Todos los x/y/w/h múltiplos de la rejilla; gutters uniformes (±2 px).
- [ ] Fila de KPIs arriba; tendencias debajo; tablas al final.
- [ ] ≤ 15 componentes con datos por página.
- [ ] ≤ 2 familias tipográficas; tamaños mínimos 11 px.
- [ ] Contraste ≥ 4.5:1 en texto; leyendas presentes.
- [ ] Bordes, radios y sombras uniformes.
- [ ] Controles de fecha/filtros en la cabecera, preferiblemente a nivel de informe.
- [ ] Sin componentes solapados ni fuera del lienzo.

## Fuentes
- https://docs.cloud.google.com/looker/docs/studio/report-and-page-layout
- https://docs.cloud.google.com/looker/docs/studio/create-a-responsive-report
- https://docs.cloud.google.com/data-studio/release-notes
- https://docs.cloud.google.com/data-studio/manage-data-freshness
- https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html
- https://www.lovesdata.com/blog/transform-your-reporting-a-looker-studio-dashboard-design-deep-dive/
- https://www.kevinleary.net/blog/optimizing-slow-looker-studio-reports/
- https://www.thebricks.com/resources/guide-how-to-change-page-size-in-looker-studio
