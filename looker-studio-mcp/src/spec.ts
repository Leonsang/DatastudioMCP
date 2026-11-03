/**
 * Report spec ("report as code"). A JSON file describing pages and components:
 *
 * {
 *   "grid": 10, "canvasWidth": 1200,
 *   "defaults": { "dataset": "@ingresos", "padding": 12 },
 *   "pages": [
 *     { "page": "active",                       // page id, or "active"
 *       "components": [
 *         { "key": "kpi_ingresos", "type": "kpi-metric", "x": 20, "y": 100, "w": 270, "h": 120,
 *           "metrics": ["SUM(ingresos)"] },
 *         { "row": { "y": 100, "h": 120, "margin": 20, "gap": 20 },   // KPI-row macro
 *           "items": [ { "key": "k1", "type": "kpi-metric", "metrics": ["ingresos"] }, ... ] },
 *         { "key": "tabla", "id": "cd-j2uffxuy8d", ... }               // adopt an existing component
 *       ] } ] }
 *
 * dataset: a data source id, or "@<field>" = the data source that has that field.
 * Lint rules come from the skills (diseno-layout.md, kpi-scorecards.md, rendimiento.md).
 */
import { readFileSync } from 'node:fs';

export interface SpecComponent {
  key: string;
  type: string;
  id?: string;
  x?: number;
  y?: number;
  w?: number;
  h?: number;
  padding?: number;
  dataset?: string;
  dimensions?: string[];
  metrics?: string[];
}

export interface SpecRow {
  row: { y: number; h: number; margin?: number; gap?: number; width?: number; x?: number };
  items: Array<Omit<SpecComponent, 'x' | 'y' | 'w' | 'h'>>;
}

export interface SpecPage {
  page?: string;
  components: Array<SpecComponent | SpecRow>;
}

export interface ReportSpec {
  grid?: number;
  canvasWidth?: number;
  canvasHeight?: number;
  defaults?: { dataset?: string; padding?: number };
  pages: SpecPage[];
}

export interface ResolvedComponent extends Required<Pick<SpecComponent, 'key' | 'type' | 'x' | 'y' | 'w' | 'h'>> {
  id?: string;
  padding?: number;
  dataset?: string;
  dimensions: string[];
  metrics: string[];
  page: string;
}

export interface LintIssue {
  severity: 'error' | 'warning' | 'info';
  key: string | null;
  rule: string;
  message: string;
}

export const KNOWN_TYPES = [
  'simple-linechart', 'simple-barchart', 'simple-histogram', 'simple-combochart', 'simple-piechart', 'simple-table',
  'google-map', 'simple-geomap', 'kpi-metric', 'simple-scatterchart', 'bulletchart', 'simple-areachart', 'pivot-table',
  'simple-treemap', 'gauge-viz', 'simple-sankey', 'simple-waterfall', 'simple-timeline', 'simple-funnel', 'third-party-viz',
  'framed-external-content', 'notebook-data-app', 'simple-description', 'image-component', 'arrow', 'placeholder', 'shape',
  'ellipse', 'generic-shape', 'filter-bar', 'metric-filter', 'advanced-filter', 'simple-daterangepicker', 'dimension-filter',
  'dataset-picker', 'dimension-control', 'button',
];
const NON_DATA = new Set(['simple-description', 'image-component', 'arrow', 'placeholder', 'shape', 'ellipse', 'generic-shape', 'framed-external-content', 'button']);

export function loadSpec(file: string): ReportSpec {
  const spec = JSON.parse(readFileSync(file, 'utf8')) as ReportSpec;
  if (!spec || !Array.isArray(spec.pages)) throw new Error(`${file}: falta "pages" (array).`);
  return spec;
}

/** Expands row macros and defaults into absolute boxes (skill kpi-scorecards formula). */
export function resolveSpec(spec: ReportSpec): ResolvedComponent[] {
  const grid = spec.grid ?? 10;
  const W = spec.canvasWidth ?? 1200;
  const floorGrid = (v: number) => Math.floor(v / grid) * grid;
  const out: ResolvedComponent[] = [];
  for (const p of spec.pages) {
    const page = p.page ?? 'active';
    for (const c of p.components) {
      if ('row' in c) {
        const { y, h } = c.row;
        const margin = c.row.margin ?? 20;
        const gap = c.row.gap ?? 20;
        const x0 = c.row.x ?? margin;
        const width = c.row.width ?? W - x0 - margin;
        const n = c.items.length;
        // w = (ancho - (n-1)*gap) / n, floored to the grid.
        const w = floorGrid((width - (n - 1) * gap) / n);
        c.items.forEach((it, i) => {
          out.push({
            key: it.key, type: it.type, id: it.id, x: x0 + i * (w + gap), y, w, h,
            padding: it.padding ?? spec.defaults?.padding, dataset: it.dataset ?? spec.defaults?.dataset,
            dimensions: it.dimensions ?? [], metrics: it.metrics ?? [], page,
          });
        });
      } else {
        out.push({
          key: c.key, type: c.type, id: c.id, x: c.x ?? 0, y: c.y ?? 0, w: c.w ?? 400, h: c.h ?? 300,
          padding: c.padding ?? spec.defaults?.padding, dataset: c.dataset ?? spec.defaults?.dataset,
          dimensions: c.dimensions ?? [], metrics: c.metrics ?? [], page,
        });
      }
    }
  }
  return out;
}

/** Best-practice validation (skills) before touching the report. */
export function lintSpec(spec: ReportSpec): { issues: LintIssue[]; components: ResolvedComponent[] } {
  const grid = spec.grid ?? 10;
  const W = spec.canvasWidth ?? 1200;
  const H = spec.canvasHeight ?? 10_000;
  const comps = resolveSpec(spec);
  const issues: LintIssue[] = [];
  const push = (severity: LintIssue['severity'], key: string | null, rule: string, message: string) =>
    issues.push({ severity, key, rule, message });

  const keys = new Set<string>();
  for (const c of comps) {
    if (!c.key) push('error', null, 'key', 'Cada componente necesita "key" (identificador estable del spec).');
    if (keys.has(c.key)) push('error', c.key, 'key', `Clave duplicada "${c.key}".`);
    keys.add(c.key);
    if (!KNOWN_TYPES.includes(c.type)) push('error', c.key, 'type', `Tipo desconocido "${c.type}".`);
    if ([c.x, c.y, c.w, c.h].some((v) => v % grid !== 0))
      push('warning', c.key, 'grid', `x/y/w/h (${c.x},${c.y},${c.w},${c.h}) no son multiplos de la reticula ${grid}px [diseno-layout §3].`);
    if (c.x < 0 || c.y < 0 || c.x + c.w > W || c.y + c.h > H)
      push('error', c.key, 'canvas', `Se sale del lienzo ${W}x${H} [diseno-layout §2].`);
    if (c.x < 20 || W - (c.x + c.w) < 20) push('info', c.key, 'margin', 'Margen exterior < 20 px [diseno-layout §3].');
    if (c.padding !== undefined && (c.padding < 10 || c.padding > 16))
      push('info', c.key, 'padding', `Padding ${c.padding}px fuera de 10–16 px [diseno-layout §3].`);
    if (c.type === 'kpi-metric') {
      if (c.metrics.length !== 1) push('warning', c.key, 'kpi', 'Un scorecard debe tener exactamente 1 metrica [kpi-scorecards].');
      if (c.h < 100 || c.h > 140) push('info', c.key, 'kpi', `Alto de scorecard ${c.h}px fuera de 100–140 [kpi-scorecards §1].`);
    }
    if (!NON_DATA.has(c.type) && !['filter-bar', 'simple-daterangepicker'].includes(c.type) && !c.dataset)
      push('warning', c.key, 'dataset', 'Sin dataset: se usara el del componente clonado o el del informe.');
  }

  const byPage = new Map<string, ResolvedComponent[]>();
  for (const c of comps) byPage.set(c.page, [...(byPage.get(c.page) ?? []), c]);
  for (const [page, list] of byPage) {
    // overlaps
    for (let i = 0; i < list.length; i++)
      for (let j = i + 1; j < list.length; j++) {
        const a = list[i]!, b = list[j]!;
        if (a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h)
          push('warning', a.key, 'overlap', `Se solapa con "${b.key}" en la pagina ${page}.`);
      }
    // density
    const data = list.filter((c) => !NON_DATA.has(c.type)).length;
    if (data > 25) push('error', null, 'density', `Pagina ${page}: ${data} componentes con datos (>25) [rendimiento].`);
    else if (data > 15) push('warning', null, 'density', `Pagina ${page}: ${data} componentes con datos (>15) [rendimiento].`);
    // KPI rows
    const kpis = list.filter((c) => c.type === 'kpi-metric');
    const rows = new Map<number, ResolvedComponent[]>();
    for (const k of kpis) rows.set(k.y, [...(rows.get(k.y) ?? []), k]);
    for (const [y, row] of rows) {
      if (row.length > 1 && (row.length < 4 || row.length > 6))
        push('info', null, 'kpi-row', `Fila de KPIs en y=${y} con ${row.length} tarjetas (recomendado 4–6) [kpi-scorecards §1].`);
      if (new Set(row.map((r) => r.h)).size > 1) push('warning', null, 'kpi-row', `Fila y=${y}: alturas distintas [kpi-scorecards §1].`);
      const sorted = [...row].sort((a, b) => a.x - b.x);
      const gaps = sorted.slice(1).map((r, i) => r.x - (sorted[i]!.x + sorted[i]!.w));
      if (gaps.length && Math.max(...gaps) - Math.min(...gaps) > 2) push('warning', null, 'kpi-row', `Fila y=${y}: separaciones irregulares (${gaps.join(', ')}) [diseno-layout §3].`);
    }
  }
  return { issues, components: comps };
}
