/**
 * High-level operations shared by the CLI (src/cli.ts) and the MCP server
 * (src/index.ts). Every operation feeds the learning layer (knowledge.ts).
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import type { Page } from 'puppeteer-core';
import { evaluateOn, getBrowser, getReportPage, REPORT_URL_RE } from './browser.js';
import { getTemplate, knownFix, learn, saveTemplate, seedKnowledge, summary } from './knowledge.js';
import { log } from './log.js';
import { requireEditMode } from './looker/report.js';
import {
  applyBoxModelScript,
  bindFieldsScript,
  diagnoseReportScript,
  pageInfoScript,
  readDataSourcesScript,
} from './looker/scripts.js';
import {
  captureTemplatesScript,
  componentExistsScript,
  createComponentScript,
  deleteComponentScript,
  exportReportScript,
  installNetMonitorScript,
  patchComponentScript,
  readNetLogScript,
  readyStateScript,
} from './looker/scripts2.js';
import type { DiagnoseIssue, DiagnoseResult } from './looker/types.js';
import type { Box, CreateComponentResult, ExportResult } from './looker/types2.js';
import { lintSpec, loadSpec, type ReportSpec, type ResolvedComponent } from './spec.js';

const T = Number(process.env.LS_EVAL_TIMEOUT_MS ?? 15_000);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

seedKnowledge();

// Node-side network log (puppeteer 'response' events): URL path + status only.
// More reliable than the in-page XHR hook (the editor does not always go through it).
const NET_RE = /\/(updatePage|updateReport|batchedDataV2|createReport|deletePage)\b/;
const netLogs = new WeakMap<Page, Array<{ path: string; status: number; t: number }>>();
function trackNet(page: Page): void {
  if (netLogs.has(page)) return;
  const log: Array<{ path: string; status: number; t: number }> = [];
  netLogs.set(page, log);
  page.on('response', (r) => {
    const u = r.url();
    if (!NET_RE.test(u)) return;
    log.push({ path: new URL(u).pathname, status: r.status(), t: Date.now() });
    if (log.length > 200) log.splice(0, log.length - 200);
  });
}
function netSince(page: Page, t0: number) {
  return (netLogs.get(page) ?? []).filter((e) => e.t >= t0);
}

// ---------------------------------------------------------------------------
// page lifecycle
// ---------------------------------------------------------------------------

export async function waitReady(page: Page, timeoutMs = 45_000): Promise<void> {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    const s = await evaluateOn(page, 5_000, readyStateScript).catch(() => null);
    if (s?.ready) {
      trackNet(page);
      await evaluateOn(page, 5_000, installNetMonitorScript).catch(() => undefined);
      return;
    }
    await sleep(500);
  }
  throw new Error('El editor no termino de cargar (legoUndoRedoService sin paginas).');
}

/** Opens (or reuses) a tab on the given report URL and waits for the editor. */
export async function openReport(url: string): Promise<{ url: string }> {
  const browser = await getBrowser();
  const pages = await browser.pages();
  const page = pages.find((p) => REPORT_URL_RE.test(p.url())) ?? (await browser.newPage());
  // Bring to front BEFORE navigating: in a hidden tab the editor does not boot
  // (observed 2026-11-03: it ends on the home page with the model empty).
  await page.bringToFront();
  await page.goto(url, { waitUntil: 'networkidle2', timeout: 90_000 });
  await waitReady(page);
  return { url: page.url() };
}

/** Reloads the report tab: renders components created via the API and drops any unsaved invalid state. */
export async function reloadReport(): Promise<{ url: string; components: number }> {
  const page = await getReportPage();
  await page.bringToFront();
  await page.reload({ waitUntil: 'networkidle2', timeout: 90_000 });
  await waitReady(page);
  const s = await evaluateOn(page, T, readyStateScript);
  return { url: s.url, components: s.components };
}

async function editPage(): Promise<Page> {
  const { page } = await requireEditMode();
  trackNet(page);
  await evaluateOn(page, 5_000, installNetMonitorScript).catch(() => undefined);
  return page;
}

// ---------------------------------------------------------------------------
// export / templates (learning: display types + templates)
// ---------------------------------------------------------------------------

export async function exportReport(file?: string): Promise<ExportResult & { learnedTemplates: string[]; file?: string }> {
  const page = await getReportPage();
  const res = await evaluateOn(page, T, exportReportScript);
  for (const t of res.types) learn('display_type', t, { seenIn: res.reportId });
  const learned = await captureTemplatesOn(page);
  if (file) writeFileSync(file, JSON.stringify(res, null, 2));
  return { ...res, learnedTemplates: learned, ...(file ? { file } : {}) };
}

async function captureTemplatesOn(page: Page): Promise<string[]> {
  const cap = await evaluateOn(page, T, captureTemplatesScript);
  for (const t of cap.registeredTypes) learn('display_type', t, { registered: true });
  const learned: string[] = [];
  for (const [type, tpl] of Object.entries(cap.templates)) {
    if (saveTemplate(type, tpl.config, { url: cap.url.split('?')[0], fromComponent: tpl.fromComponent, dataSourceId: tpl.dataSourceId }))
      learned.push(type);
  }
  return learned;
}

export async function captureTemplates(): Promise<{ learned: string[]; known: string[]; registeredTypes: number }> {
  const page = await getReportPage();
  const learned = await captureTemplatesOn(page);
  const s = summary();
  return { learned, known: s.templates, registeredTypes: s.displayTypes.length };
}

// ---------------------------------------------------------------------------
// diagnose with knowledge (learning: error reasons; output: known fixes)
// ---------------------------------------------------------------------------

export async function diagnoseWithKnowledge(): Promise<DiagnoseResult & { issues: Array<DiagnoseIssue & { fix?: unknown }> }> {
  const page = await getReportPage();
  const res = await evaluateOn(page, T, diagnoseReportScript);
  const issues = res.issues.map((i) => {
    const m = i.message.match(/reason (\d+)\):\s*([^|]*)\|?\s*([^|]*)/);
    if (m) learn('error_reason', m[1]!, { title: m[2]!.trim(), description: m[3]!.trim() });
    const fix = (m && knownFix(`reason:${m[1]}`)) ?? knownFix(i.code);
    return fix ? { ...i, fix } : i;
  });
  return { ...res, issues };
}

// ---------------------------------------------------------------------------
// data sources: "@field" selector
// ---------------------------------------------------------------------------

export async function resolveDataset(page: Page, sel: string | undefined): Promise<string | undefined> {
  if (!sel) return undefined;
  if (!sel.startsWith('@')) return sel;
  const field = sel.slice(1).toLowerCase();
  const ds = await evaluateOn(page, T, readDataSourcesScript);
  const hit = ds.dataSources.find((d) => d.fields.some((f) => f.id.toLowerCase() === field || f.name.toLowerCase() === field));
  if (!hit) throw new Error(`Ningun origen del informe tiene el campo "${sel.slice(1)}". Anade el origen o revisa el nombre.`);
  return hit.dataSourceId;
}

// ---------------------------------------------------------------------------
// create / delete (learning: outcomes, rejected saves, missing methods)
// ---------------------------------------------------------------------------

export interface CreateOptions {
  type: string;
  box: Box;
  pageId?: string;
  dataset?: string;
  dimensions?: string[];
  metrics?: string[];
  padding?: number;
}

export async function createComponent(o: CreateOptions): Promise<CreateComponentResult & { bound?: unknown; fix?: unknown }> {
  const page = await editPage();
  const datasetId = await resolveDataset(page, o.dataset);
  const hasFields = !!(o.dimensions?.length || o.metrics?.length);
  const t0 = Date.now();
  const res = await evaluateOn(page, T, createComponentScript, {
    type: o.type,
    box: o.box,
    ...(o.pageId ? { pageId: o.pageId } : {}),
    ...(datasetId ? { datasetId } : {}),
    ...(o.padding !== undefined ? { padding: o.padding } : {}),
    template: getTemplate(o.type),
    deferSave: hasFields,
  });
  if (!res.ok) {
    learn('create_fail', o.type, { error: res.error });
    throw new Error(res.error);
  }
  let bound: unknown;
  if (hasFields) {
    bound = await evaluateOn(page, T + 10_000, bindFieldsScript, {
      componentId: res.componentId!, dimensions: o.dimensions ?? [], metrics: o.metrics ?? [],
    });
  }
  await sleep(2500);
  const inPage = await evaluateOn(page, 5_000, readNetLogScript, t0).catch(() => []);
  const net = [...netSince(page, t0), ...inPage];
  const rejected = net.filter((e) => /updatePage/.test(e.path) && e.status >= 400);
  if (rejected.length) {
    learn('save_rejected', o.type, { source: res.source, status: rejected[0]!.status });
    await reloadReport(); // drop the invalid local state, otherwise every later save fails too
    const fix = knownFix('save_rejected:type_change');
    throw new Error(`El servidor rechazo el guardado (updatePage ${rejected[0]!.status}) del ${o.type} creado desde ${res.source}. Se recargo el informe. ${fix ?? ''}`);
  }
  learn('create_ok', o.type, { source: res.source?.startsWith('clone') ? 'clone' : res.source });
  return { ...res, ...(bound ? { bound } : {}) };
}

export async function deleteComponent(componentId: string): Promise<{ ok: boolean; method: string }> {
  const page = await editPage();
  const r = await evaluateOn(page, T, deleteComponentScript, componentId);
  if (r.ok) {
    learn('note', 'delete_method', { text: r.method });
    return { ok: true, method: r.method! };
  }
  if (r.needsKeyboard) {
    learn('method_missing', 'page.removeComponent', { fallback: 'select+Delete' });
    await page.bringToFront();
    await page.keyboard.press('Delete');
    await sleep(2000);
    const still = await evaluateOn(page, T, componentExistsScript, componentId);
    if (!still) return { ok: true, method: 'select+Delete' };
    throw new Error(`No se pudo borrar ${componentId} (la tecla Supr no tuvo efecto; ¿el foco esta en el lienzo?).`);
  }
  throw new Error(r.error ?? `No se pudo borrar ${componentId}.`);
}

// ---------------------------------------------------------------------------
// spec apply (idempotent through <spec>.state.json)
// ---------------------------------------------------------------------------

interface SpecState {
  reportId: string | null;
  keys: Record<string, string>;
}

export interface ApplyResult {
  dryRun: boolean;
  lint: ReturnType<typeof lintSpec>['issues'];
  actions: Array<{ key: string; action: 'create' | 'update' | 'skip'; componentId?: string; error?: string; warnings?: string[] }>;
  diagnose?: unknown;
  stateFile?: string;
}

export async function applySpec(specOrFile: string | ReportSpec, opts: { dryRun?: boolean; statePath?: string } = {}): Promise<ApplyResult> {
  const spec = typeof specOrFile === 'string' ? loadSpec(specOrFile) : specOrFile;
  const statePath = opts.statePath ?? (typeof specOrFile === 'string' ? specOrFile.replace(/\.json$/i, '') + '.state.json' : undefined);
  const { issues, components } = lintSpec(spec);
  const result: ApplyResult = { dryRun: !!opts.dryRun, lint: issues, actions: [], ...(statePath ? { stateFile: statePath } : {}) };
  if (issues.some((i) => i.severity === 'error')) {
    result.actions = components.map((c) => ({ key: c.key, action: 'skip' as const, error: 'lint con errores' }));
    return result;
  }
  const state: SpecState = statePath && existsSync(statePath) ? JSON.parse(readFileSync(statePath, 'utf8')) : { reportId: null, keys: {} };
  const page = opts.dryRun ? await getReportPage() : await editPage();
  const info = await evaluateOn(page, T, pageInfoScript);
  if (state.reportId && state.reportId !== info.internalReportId) {
    log(`El state ${statePath} es de otro informe (${state.reportId}); se ignora el mapeo de ids.`);
    state.keys = {};
  }
  state.reportId = info.internalReportId;

  for (const c of components) {
    const pageId = c.page === 'active' ? undefined : c.page;
    const existingId = c.id ?? state.keys[c.key];
    const exists = existingId ? await evaluateOn(page, T, componentExistsScript, existingId) : false;
    if (opts.dryRun) {
      result.actions.push({ key: c.key, action: exists ? 'update' : 'create', ...(exists ? { componentId: existingId } : {}) });
      continue;
    }
    try {
      if (exists) {
        await updateExisting(page, existingId!, c);
        state.keys[c.key] = existingId!;
        const extra = await patchIfNeeded(page, existingId!, c);
        result.actions.push({ key: c.key, action: 'update', componentId: existingId!, ...(extra.length ? { warnings: extra } : {}) });
      } else {
        const r = await createComponent({
          type: c.type, box: { x: c.x, y: c.y, width: c.w, height: c.h },
          ...(pageId ? { pageId } : {}), ...(c.dataset ? { dataset: c.dataset } : {}),
          dimensions: c.dimensions, metrics: c.metrics, ...(c.padding !== undefined ? { padding: c.padding } : {}),
        });
        state.keys[c.key] = r.componentId!;
        const extra = await patchIfNeeded(page, r.componentId!, c);
        result.actions.push({ key: c.key, action: 'create', componentId: r.componentId!, warnings: [...r.warnings, ...extra] });
      }
    } catch (e) {
      result.actions.push({ key: c.key, action: exists ? 'update' : 'create', error: (e as Error).message });
    }
    if (statePath) writeFileSync(statePath, JSON.stringify(state, null, 2));
  }
  if (!opts.dryRun) {
    await reloadReport();
    result.diagnose = await diagnoseWithKnowledge();
  }
  return result;
}

async function patchIfNeeded(page: Page, id: string, c: ResolvedComponent): Promise<string[]> {
  if (c.dateRangeDays === undefined && !c.stripStyles) return [];
  const r = await evaluateOn(page, T, patchComponentScript, {
    componentId: id,
    ...(c.dateRangeDays !== undefined ? { dateRangeDays: c.dateRangeDays } : {}),
    ...(c.stripStyles ? { stripThemeStyles: true } : {}),
  });
  if (!r.ok) throw new Error(r.error);
  return r.changes;
}

export async function patchComponent(args: { componentId: string; dateRangeDays?: number; stripThemeStyles?: boolean }) {
  const page = await editPage();
  const r = await evaluateOn(page, T, patchComponentScript, args);
  if (!r.ok) throw new Error(r.error);
  return r;
}

async function updateExisting(page: Page, id: string, c: ResolvedComponent): Promise<void> {
  await evaluateOn(page, T, applyBoxModelScript, {
    componentId: id,
    position: { x: c.x, y: c.y },
    dimensions: { width: c.w, height: c.h },
    ...(c.padding !== undefined ? { padding: { top: c.padding, right: c.padding, bottom: c.padding, left: c.padding } } : {}),
  });
  if (c.dimensions.length || c.metrics.length) {
    const r = await evaluateOn(page, T + 10_000, bindFieldsScript, { componentId: id, dimensions: c.dimensions, metrics: c.metrics });
    if (!r.ok) throw new Error(r.error);
  }
}

export { lintSpec, loadSpec, summary };
