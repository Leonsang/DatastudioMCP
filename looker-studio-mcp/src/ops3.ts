/**
 * Operations v3: pages, themes, template synthesis and UX audit.
 * Shared by CLI and MCP; every outcome feeds knowledge/.
 */
import type { Page } from 'puppeteer-core';
import { evaluateOn, getReportPage } from './browser.js';
import { learn, listTemplates, saveTemplate } from './knowledge.js';
import { requireEditMode } from './looker/report.js';
import { bindFieldsScript, diagnoseReportScript, readComponentConfigScript, readDataSourcesScript } from './looker/scripts.js';
import { deleteComponentScript } from './looker/scripts2.js';
import {
  addFilterScript,
  reportSettingsScript,
  addPageScript,
  attachFilterScript,
  listFiltersScript,
  setThemePresetScript,
  applyThemeScript,
  listPagesScript,
  readThemeScript,
  renamePageScript,
  synthesizeComponentScript,
  uxFactsScript,
} from './looker/scripts3.js';
import { reloadReport, resolveDataset } from './ops.js';
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { auditUx, fromThemeContent, toThemeContent, type FriendlyTheme, type UxFacts } from './theme.js';

const T = Number(process.env.LS_EVAL_TIMEOUT_MS ?? 15_000);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function watchSaves(page: Page) {
  const statuses: number[] = [];
  const on = (r: { url(): string; status(): number }) => {
    if (/\/(updatePage|updateReport|createPages)\b/.test(r.url())) statuses.push(r.status());
  };
  page.on('response', on);
  return { statuses, stop: () => page.off('response', on) };
}

// ---- theme ---------------------------------------------------------------------

export async function readTheme() {
  const page = await getReportPage();
  const r = await evaluateOn(page, T, readThemeScript);
  return { themeConfig: r.themeConfig, customThemes: r.themes, theme: fromThemeContent(r.custom as Record<string, unknown> | null), raw: r.custom };
}

export async function applyTheme(theme: FriendlyTheme) {
  const { page } = await requireEditMode();
  const cur = await evaluateOn(page, T, readThemeScript);
  const content = toThemeContent(theme, (cur.custom as Record<string, any> | null) ?? undefined);
  const w = watchSaves(page);
  const r = await evaluateOn(page, T, applyThemeScript, content);
  await sleep(2500);
  w.stop();
  if (!r.ok) throw new Error(r.error);
  if (w.statuses.some((s) => s >= 400)) {
    learn('save_rejected', 'theme', { statuses: w.statuses });
    await reloadReport();
    throw new Error(`El guardado del tema fue rechazado (${w.statuses.join(',')}); se recargo el informe.`);
  }
  learn('note', 'theme_applied', { text: r.created ? 'theme resource created' : 'theme resource updated' });
  return { ...r, saves: w.statuses };
}

// ---- theme presets / library -----------------------------------------------------

/** Preset ids found in the editor bundle (2026-11-03). Spanish names from the "Tema y diseno" panel. */
export const THEME_PRESETS: Record<string, string> = {
  't-default-modern': 'Predeterminado (moderno)', 't-default': 'Predeterminado', 't-edge': 'Edge', 't-constellation': 'Constelacion',
  't-groovy': 'Groovy', 't-insight': 'Insight', 't-ocean': 'Oceano', 't-harvest': 'Cosecha', 't-eucalyptus': 'Eucalipto', 't-pop': 'Pop',
  't-fog': 'Niebla', 't-lagoon': 'Laguna', 't-executive': 'Ejecutivo', 't-woodsy': 'Bosque', 't-royalty': 'Realeza', 't-sienna': 'Siena',
  't-material': 'Material', 't-muted': 'Apagado', 't-primary': 'Primario', 't-cut-out': 'Recorte', 't-shift': 'Shift',
  't-energetic': 'Energetico', 't-forest': 'Selva', 't-magazine': 'Revista', 't-tunnel': 'Tunel', 't-quartz': 'Cuarzo', 't-onyx': 'Onix',
};
const LIBRARY = join(dirname(fileURLToPath(import.meta.url)), '..', 'themes', 'library');

export function themeLibrary() {
  const own = existsSync(LIBRARY)
    ? readdirSync(LIBRARY).filter((f) => f.endsWith('.json')).map((f) => ({ name: f.replace(/\.json$/, ''), file: join(LIBRARY, f) }))
    : [];
  return { presets: Object.entries(THEME_PRESETS).map(([id, name]) => ({ id, name })), library: own };
}

export async function useThemePreset(idOrName: string) {
  const { page } = await requireEditMode();
  const lib = themeLibrary().library.find((t) => t.name === idOrName);
  if (lib) return applyTheme(JSON.parse(readFileSync(lib.file, 'utf8')));
  const id = THEME_PRESETS[idOrName] ? idOrName : Object.entries(THEME_PRESETS).find(([, n]) => n.toLowerCase() === idOrName.toLowerCase())?.[0];
  if (!id) throw new Error(`Tema "${idOrName}" no encontrado. Usa theme presets para ver los disponibles.`);
  const w = watchSaves(page);
  const r = await evaluateOn(page, T, setThemePresetScript, id);
  await sleep(2500);
  w.stop();
  if (!r.ok) throw new Error(r.error);
  learn('note', 'theme_preset', { text: id });
  return { ok: true, themeConfig: id, saves: w.statuses };
}

export async function exportTheme(file: string) {
  const t = await readTheme();
  if (!t.raw) throw new Error(`El informe usa el tema predefinido "${t.themeConfig}": no hay colores que exportar (aplica uno personalizado o importa de la biblioteca).`);
  writeFileSync(file, JSON.stringify({ friendly: t.theme, raw: t.raw }, null, 2));
  return { file, theme: t.theme };
}

export async function importTheme(file: string) {
  const j = JSON.parse(readFileSync(file, 'utf8'));
  // accepts {friendly, raw} (export), or a friendly theme object
  return applyTheme((j.friendly ?? j) as FriendlyTheme);
}

// ---- filters -----------------------------------------------------------------------

export interface FilterSpec {
  name: string;
  field: string;
  /** EQ, CONTAINS, STARTS_WITH, RM (regex), RP (regex parcial), IN, NU (nulo), GT, GE, LT, LE, BETWEEN */
  op?: string;
  values?: Array<string | number>;
  include?: boolean;
  dataset?: string;
}

export async function listFilters() {
  return evaluateOn(await getReportPage(), T, listFiltersScript);
}

export async function addFilter(f: FilterSpec, target?: string) {
  const { page } = await requireEditMode();
  const existing = (await evaluateOn(page, T, listFiltersScript)).find((x) => x.name === f.name);
  let filterId = existing?.id ?? null;
  if (!filterId) {
    const datasetId = (await resolveDataset(page, f.dataset ?? `@${f.field}`))!;
    const r = await evaluateOn(page, T, addFilterScript, {
      name: f.name, datasetId, field: f.field, condition: (f.op ?? 'EQ').toUpperCase(), values: f.values ?? [], include: f.include ?? true,
    });
    if (!r.ok) throw new Error(r.error ?? 'No se pudo crear el filtro.');
    filterId = r.filterId!;
    await sleep(1500);
  }
  let attached: string[] | undefined;
  if (target) {
    const w = watchSaves(page);
    const a = await evaluateOn(page, T, attachFilterScript, { filterId, target });
    await sleep(2500);
    w.stop();
    if (!a.ok) throw new Error(a.error);
    if (w.statuses.some((s) => s >= 400)) {
      learn('save_rejected', 'filter', { statuses: w.statuses });
      throw new Error(`Aplicar el filtro fue rechazado (${w.statuses.join(',')}).`);
    }
    attached = a.filters;
  }
  learn('create_ok', 'filter', { source: existing ? 'reused' : 'addResource' });
  return { filterId, reused: !!existing, ...(attached ? { target, filters: attached } : {}) };
}

export async function detachFilter(filterId: string, target: string) {
  const { page } = await requireEditMode();
  const a = await evaluateOn(page, T, attachFilterScript, { filterId, target, detach: true });
  if (!a.ok) throw new Error(a.error);
  await sleep(2000);
  return a;
}

// ---- report settings ------------------------------------------------------------------

export async function reportSettings(patch?: Record<string, unknown>) {
  if (!patch || !Object.keys(patch).length) return evaluateOn(await getReportPage(), T, reportSettingsScript, null);
  const { page } = await requireEditMode();
  const w = watchSaves(page);
  const r = await evaluateOn(page, T, reportSettingsScript, patch);
  await sleep(2500);
  w.stop();
  if (!r.ok) throw new Error(r.error);
  if (w.statuses.some((s) => s >= 400)) throw new Error(`Guardado rechazado (${w.statuses.join(',')}).`);
  return { ...r, saves: w.statuses };
}


// ---- page display names (navigation) ------------------------------------------------
// The viewer navigation reads store.reportNavigation.navigationInfo.navItems[].page.displayName,
// saved by POST /updateReportNavigationInfo (verified 2026-11-03). The stable way found to change
// it is the editor's own "Gestionar paginas > Cambiar nombre" flow, driven with real input events.

function navNames(): string[] {
  let s: any;
  (window as any).angular.element(document.body).injector().get('store').subscribe((x: any) => (s = x)).unsubscribe();
  return s.reportNavigation.navigationInfo.navItems.map((n: any) => (n.page && n.page.displayName) || '');
}

async function openManagePages(page: Page): Promise<void> {
  const open = await page.evaluate(() =>
    Array.from(document.querySelectorAll('*')).some((e) => e.children.length === 0 && /P[aá]ginas del informe|Report pages/.test(((e as HTMLElement).innerText || '').trim())));
  if (open) return;
  await page.evaluate(() => {
    const b = Array.from(document.querySelectorAll('button')).find((x) => /^(P[aá]gina|Page)$/.test(((x as HTMLElement).innerText || '').trim()));
    if (b) (b as HTMLElement).click();
  });
  await sleep(800);
  await page.evaluate(() => {
    const panes = Array.from(document.querySelectorAll('.cdk-overlay-pane'));
    const pane = panes[panes.length - 1];
    const it = pane && Array.from(pane.querySelectorAll('button,[role=menuitem]')).find((e) => /Gestionar p[aá]ginas|Manage pages/.test((e as HTMLElement).innerText));
    if (it) (it as HTMLElement).click();
  });
  await sleep(1200);
}

export async function renamePageUi(index: number, name: string): Promise<{ ok: boolean; displayNames: string[]; saves: number[] }> {
  const { page } = await requireEditMode();
  await page.bringToFront();
  await page.setViewport({ width: 1900, height: 1100 });
  await sleep(800);
  const statuses: number[] = [];
  const onResp = (r: { url(): string; status(): number }) => {
    if (/updateReportNavigationInfo/.test(r.url())) statuses.push(r.status());
  };
  page.on('response', onResp);
  try {
    await openManagePages(page);
    const names = (await page.evaluate(navNames)) as string[];
    if (names[index] === undefined) throw new Error(`No hay pagina en la posicion ${index}.`);
    if (names[index] === name) return { ok: true, displayNames: names, saves: [] };
    const rows = await page.evaluate((list: string[]) =>
      Array.from(document.querySelectorAll('*'))
        .filter((e) => e.children.length === 0 && list.includes(((e as HTMLElement).innerText || '').trim()))
        .map((e) => { const r = e.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })
        .filter((b) => b.x > window.innerWidth * 0.6 && b.y > 250)
        .sort((a, b) => a.y - b.y), names);
    const row = rows[index];
    if (!row) throw new Error('Fila de la pagina no encontrada en "Paginas del informe".');
    await page.mouse.move(row.x, row.y);
    await sleep(500);
    const more = await page.evaluate((y: number) =>
      Array.from(document.querySelectorAll('button,[role=button]'))
        .map((b) => { const r = b.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2, t: ((b as HTMLElement).innerText || '').trim() }; })
        .filter((b) => Math.abs(b.y - y) < 12 && !b.t && b.x > window.innerWidth * 0.6)
        .sort((a, b) => b.x - a.x)[0] || null, row.y);
    if (!more) throw new Error('Menu de la fila no encontrado.');
    await page.mouse.click(more.x, more.y);
    await sleep(700);
    const mi = await page.evaluate(() => {
      const panes = Array.from(document.querySelectorAll('.cdk-overlay-pane'));
      const it = Array.from(panes[panes.length - 1].querySelectorAll('button,[role=menuitem]')).find((e) => /Cambiar nombre|Rename/.test((e as HTMLElement).innerText));
      if (!it) return null;
      const r = it.getBoundingClientRect();
      return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
    });
    if (!mi) throw new Error('Opcion "Cambiar nombre" no encontrada.');
    await page.mouse.click(mi.x, mi.y);
    await sleep(800);
    const input = await page.evaluate((y: number) =>
      Array.from(document.querySelectorAll('input'))
        .map((e) => { const r = e.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })
        .find((b) => Math.abs(b.y - y) < 16) || null, row.y);
    if (!input) throw new Error('Campo de nombre no encontrado.');
    await page.mouse.click(input.x, input.y);
    await page.keyboard.down('Control');
    await page.keyboard.press('KeyA');
    await page.keyboard.up('Control');
    await page.keyboard.press('Backspace');
    await page.keyboard.type(name);
    await page.keyboard.press('Enter');
    for (let i = 0; i < 20 && !statuses.length; i++) await sleep(250);
    const after = (await page.evaluate(navNames)) as string[];
    if (after[index] !== name) throw new Error(`El nombre visible quedo como "${after[index]}".`);
    learn('note', 'rename_page_ui', { text: 'Gestionar paginas > Cambiar nombre -> POST /updateReportNavigationInfo' });
    return { ok: true, displayNames: after, saves: [...statuses] };
  } finally {
    page.off('response', onResp);
    await page.keyboard.press('Escape').catch(() => undefined);
    await page.setViewport(null as never).catch(() => undefined);
  }
}

// ---- pages ---------------------------------------------------------------------

export async function listPages() {
  return evaluateOn(await getReportPage(), T, listPagesScript);
}

export async function addPage(name: string) {
  const { page } = await requireEditMode();
  const w = watchSaves(page);
  // A narrow window folds the toolbar and hides "Anadir pagina": widen the viewport meanwhile.
  await page.bringToFront();
  await page.setViewport({ width: 1900, height: 1100 });
  await sleep(800);
  let r = await evaluateOn(page, T, addPageScript);
  if (!r.ok) {
    // Fallback: menu "Pagina" > "Nueva pagina" (the toolbar button is not always rendered).
    const opened = await page.evaluate(() => {
      const b = Array.from(document.querySelectorAll('button')).find((x) => /^(P[aá]gina|Page)$/.test(((x as HTMLElement).innerText || '').trim()));
      if (b) (b as HTMLElement).click();
      return !!b;
    });
    await sleep(800);
    const clicked = opened && (await page.evaluate(() => {
      const it = Array.from(document.querySelectorAll('[role=menuitem],button')).find((x) => /Nueva p[aá]gina|New page/i.test((x as HTMLElement).innerText || ''));
      if (it) (it as HTMLElement).click();
      return !!it;
    }));
    if (clicked) r = { ...r, ok: true };
  }
  await sleep(500);
  await page.setViewport(null as never).catch(() => undefined);
  if (!r.ok) {
    w.stop();
    learn('method_missing', 'toolbar:add-page', { error: r.error });
    throw new Error(r.error);
  }
  let pages = await evaluateOn(page, T, listPagesScript);
  for (let i = 0; i < 20 && pages.length <= r.before; i++) {
    await sleep(500);
    pages = await evaluateOn(page, T, listPagesScript);
  }
  const created = pages[pages.length - 1];
  if (!created || pages.length <= r.before) {
    w.stop();
    throw new Error('La pagina no aparecio tras pulsar "Anadir pagina".');
  }
  await sleep(1500);
  const rn = await evaluateOn(page, T, renamePageScript, { pageId: created.id, name });
  await sleep(2000);
  w.stop();
  if (!rn.ok) throw new Error(rn.error);
  await renamePageUi(pages.length - 1, name).catch((e) =>
    learn('note', 'rename_page_ui_failed', { text: String((e as Error).message).slice(0, 200) }));
  learn('create_ok', 'page', { source: 'toolbar+rename' });
  return { ok: true, pageId: created.id, name, url: page.url(), saves: w.statuses };
}

export async function renamePage(pageId: string, name: string) {
  const { page } = await requireEditMode();
  const r = await evaluateOn(page, T, renamePageScript, { pageId, name });
  if (!r.ok) throw new Error(r.error);
  await sleep(1500);
  // model name (above) + the visible navigation name (viewer nav / "Paginas del informe")
  const idx = (await evaluateOn(page, T, listPagesScript)).findIndex((p) => p.id === pageId);
  const nav = idx >= 0 ? await renamePageUi(idx, name) : null;
  return { ...r, navigation: nav?.displayNames };
}

// ---- template synthesis ------------------------------------------------------------

/** Field roles per display type, used to bind a valid minimal config before the first save. */
const RECIPES: Record<string, { dims: Array<'text' | 'date' | 'number' | 'geo'>; metrics: number }> = {
  'simple-treemap': { dims: ['text', 'text'], metrics: 1 },
  'pivot-table': { dims: ['text'], metrics: 1 },
  'simple-scatterchart': { dims: ['text'], metrics: 2 },
  bulletchart: { dims: [], metrics: 1 },
  'gauge-viz': { dims: [], metrics: 1 },
  'simple-combochart': { dims: ['date'], metrics: 2 },
  'simple-areachart': { dims: ['date'], metrics: 1 },
  'simple-sankey': { dims: ['text', 'text'], metrics: 1 },
  'simple-funnel': { dims: ['text'], metrics: 1 },
  'simple-waterfall': { dims: ['text'], metrics: 1 },
  'simple-histogram': { dims: ['number'], metrics: 1 },
  'google-map': { dims: ['geo'], metrics: 1 },
  'simple-barchart': { dims: ['text'], metrics: 1 },
  'simple-linechart': { dims: ['date'], metrics: 1 },
  'simple-piechart': { dims: ['text'], metrics: 1 },
  'simple-geomap': { dims: ['geo'], metrics: 1 },
  'simple-table': { dims: ['text'], metrics: 1 },
};

export async function synthesizeTemplates(types: string[], opts: { pageId?: string } = {}) {
  const { page } = await requireEditMode();
  const known = new Set(listTemplates().map((t) => t.type));
  const ds = await evaluateOn(page, T, readDataSourcesScript);
  const results: Array<{ type: string; ok: boolean; status?: number[]; error?: string; skipped?: string }> = [];
  for (const type of types) {
    if (known.has(type)) {
      results.push({ type, ok: true, skipped: 'ya hay plantilla' });
      continue;
    }
    const s = await evaluateOn(page, T, synthesizeComponentScript, { type, box: { x: 20, y: 20, width: 400, height: 300 }, ...(opts.pageId ? { pageId: opts.pageId } : {}) });
    if (!s.ok) {
      learn('create_fail', type, { source: 'synth', error: s.error });
      results.push({ type, ok: false, error: s.error });
      continue;
    }
    const id = s.componentId!;
    const dsId = await evaluateOn(page, T, readComponentConfigScript, id).then((r: any) => r.config?.config?.datasource?.keys?.dataset?.value?.id);
    const src = ds.dataSources.find((d) => d.dataSourceId === dsId) ?? ds.dataSources.find((d) => d.fields.length);
    const fields = src?.fields ?? [];
    const BAD = /(^|_)id(_|$)|url|imagen|image|comentario|lat_long/i;
    const used = new Set<string>();
    const pick = (role: string) => {
      const f = fields.find((x) => !used.has(x.id) && !BAD.test(x.name) && (
        role === 'date' ? x.dataType === 'DATE' :
        role === 'number' ? x.dataType === 'NUMBER' :
        role === 'geo' ? /pais|country|codigo_pais|ciudad|city|region/i.test(x.name) :
        x.dataType === 'TEXT'));
      if (f) used.add(f.id);
      return f;
    };
    const metricRef = () => { const f = pick('number'); return f ? (f.type === 'METRIC' ? f.name : `SUM(${f.name})`) : undefined; };
    // Field slots: from the type's own getDataFieldConfigs (learned at runtime), else the static recipe.
    const fcs = s.fieldConfigs ?? [];
    const recipe = RECIPES[type];
    let dims: string[] = [], metrics: string[] = [];
    const slots: Record<string, string[]> = {};
    if (fcs.length) {
      for (const fc of fcs.filter((f) => f.min >= 1 || f.slot === 'primary')) {
        const n = Math.max(fc.min, fc.count, fc.slot === 'primary' ? 1 : 0);
        const refs: string[] = [];
        for (let i = 0; i < n; i++) {
          const role = fc.kind === 'metric' ? 'metric' : fc.supportedTypes?.includes(1) || (recipe?.dims[i] === 'date') ? 'date' : recipe?.dims[i] === 'geo' ? 'geo' : recipe?.dims[i] === 'number' ? 'number' : 'text';
          const r = role === 'metric' ? metricRef() : pick(role)?.name;
          if (r) refs.push(r);
        }
        if (fc.slot === 'primary') (fc.kind === 'dimension' ? dims : metrics).push(...refs);
        else if (refs.length) slots[fc.slot] = refs;
      }
      learn('note', `fields:${type}`, { text: JSON.stringify(fcs.map((f) => `${f.slot}:${f.kind}:${f.min}`)) });
    } else if (recipe) {
      dims = recipe.dims.map((r) => pick(r)?.name).filter(Boolean) as string[];
      metrics = Array.from({ length: recipe.metrics }, metricRef).filter(Boolean) as string[];
    } else {
      results.push({ type, ok: false, error: 'sin configuracion de campos para este tipo' });
      continue;
    }
    const w = watchSaves(page);
    const b = await evaluateOn(page, T + 10_000, bindFieldsScript, { componentId: id, dimensions: dims, metrics, clearDimensions: !dims.length, ...(Object.keys(slots).length ? { slots } : {}) });
    await sleep(2500);
    w.stop();
    if (!b.ok || w.statuses.some((x) => x >= 400)) {
      learn('save_rejected', type, { source: 'synth', statuses: w.statuses, error: b.error });
      results.push({ type, ok: false, status: w.statuses, error: b.error ?? 'updatePage rechazado' });
      await reloadReport();
      continue;
    }
    const cfg = await evaluateOn(page, T, readComponentConfigScript, id);
    if (cfg.ok) saveTemplate(type, cfg.config, { source: 'synthesized', fields: { dims, metrics } });
    learn('create_ok', type, { source: 'synth' });
    // remove the scaffold component
    await evaluateOn(page, T, deleteComponentScript, id);
    await sleep(1500);
    results.push({ type, ok: true, status: w.statuses });
  }
  return { results, templates: listTemplates().map((t) => t.type) };
}

// ---- template seeding from the editor's own insert menu ---------------------------

/**
 * Inserts each menu option (aria-label of PRESET-PREVIEW, e.g. "Tabla dinamica con mapa de calor")
 * with a real click on the canvas, captures the config the editor generated, saves it as template
 * (`<type>` if new, plus `<type>@<option>`) and deletes the component. No screenshots involved.
 */
export async function seedTemplatesFromUi(labels: string[]) {
  const { page } = await requireEditMode();
  const results: Array<{ label: string; ok: boolean; type?: string; error?: string }> = [];
  await page.bringToFront();
  await page.setViewport({ width: 1900, height: 1100 });
  await sleep(1000);
  try {
    for (const label of labels) {
      const before = new Set<string>(await page.evaluate(() =>
        (window as any).angular.element(document.body).injector().get('legoUndoRedoService').report.pages.flatMap((p: any) => p.components.map((c: any) => c.getId()))));
      // "control:<texto>" -> menu "Anadir un control" (items are buttons matched by text);
      // otherwise -> menu "Anadir un grafico" (PRESET-PREVIEW matched by aria-label).
      const isControl = label.startsWith('control:');
      const item = isControl ? label.slice(8) : label;
      const opened = await page.evaluate((ctl) => {
        const sel = ctl
          ? 'button[aria-label="Añadir un control"], button[aria-label="Add a control"]'
          : 'button[aria-label="Añadir un gráfico"], button[aria-label="Add a chart"]';
        const b = document.querySelector(sel) as HTMLElement | null;
        if (b) b.click();
        return !!b;
      }, isControl);
      await sleep(900);
      const picked = opened && (await page.evaluate((l, ctl) => {
        const panes = Array.from(document.querySelectorAll('.cdk-overlay-pane'));
        const pane = panes[panes.length - 1] || document;
        const cands = Array.from(pane.querySelectorAll(ctl ? 'button,[role=menuitem]' : 'preset-preview,[role=menuitem]'));
        const el = cands.find((e) => (ctl ? ((e as HTMLElement).innerText || '').replace(/\s+/g, ' ').trim() === l : e.getAttribute('aria-label') === l)) as HTMLElement | undefined;
        if (el) el.click();
        return !!el;
      }, item, isControl));
      if (!picked) {
        await page.keyboard.press('Escape');
        results.push({ label, ok: false, error: opened ? 'opcion no encontrada en el menu' : 'boton "Anadir un grafico" no encontrado' });
        learn('method_missing', `insert-menu:${label}`);
        continue;
      }
      await sleep(500);
      const box = await page.evaluate(() => {
        const c = document.querySelector('.ng2-canvas-container');
        const r = c ? c.getBoundingClientRect() : null;
        return r ? { x: r.x, y: r.y } : null;
      });
      if (!box) {
        results.push({ label, ok: false, error: 'lienzo no encontrado' });
        continue;
      }
      await page.mouse.click(box.x + 80, box.y + 80);
      await sleep(2500);
      const added = await page.evaluate((prev: string[]) => {
        const rep = (window as any).angular.element(document.body).injector().get('legoUndoRedoService').report;
        const all = rep.pages.flatMap((p: any) => p.components);
        const c = all.find((x: any) => !prev.includes(x.getId()));
        return c ? { id: String(c.getId()), type: String(c.config.config.display.type), config: JSON.parse(JSON.stringify(c.config)) } : null;
      }, [...before]);
      if (!added) {
        // Some options do not add a canvas component (e.g. the report-level viewer filter bar).
        await page.keyboard.press('Escape').catch(() => undefined);
        results.push({ label, ok: false, error: 'no se creo ningun componente en el lienzo (puede ser un elemento de informe)' });
        continue;
      }
      const slug = item.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
      saveTemplate(added.type, added.config, { source: isControl ? 'control-menu' : 'insert-menu', label: item });
      saveTemplate(`${added.type}@${slug}`, added.config, { source: isControl ? 'control-menu' : 'insert-menu', label: item });
      learn('create_ok', added.type, { source: 'insert-menu' });
      await evaluateOn(page, T, deleteComponentScript, added.id);
      await sleep(1500);
      results.push({ label, ok: true, type: added.type });
    }
  } finally {
    await page.setViewport(null as never).catch(() => undefined);
  }
  return { results, templates: listTemplates().map((t) => t.type) };
}

// ---- UX audit ------------------------------------------------------------------

export async function uxAudit() {
  const page = await getReportPage();
  const facts = (await evaluateOn(page, T, uxFactsScript)) as UxFacts;
  const diag = await evaluateOn(page, T, diagnoseReportScript);
  return auditUx(facts, diag.issues);
}
