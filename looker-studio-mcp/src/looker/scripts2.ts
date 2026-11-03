/**
 * ============================================================================
 *  PAGE-INJECTED SCRIPTS (v2): report-as-code + learning hooks.
 * ============================================================================
 * Same rules as scripts.ts: each exported function is serialized and run inside
 * the report tab, so it must be self-contained and JSON in / JSON out.
 *
 * Mechanism (verified 2026-11-03, see LOOKER_STUDIO_INTERNALS.md):
 *   cfg = comp.duplicateConfig()           -> full JSON with a fresh "cd-" id
 *   c   = page.addComponent(cfg)           -> inserts it (renders after reload)
 *   injector.get('wrapperSaveService').save([c])  -> POST updatePage
 *   Changing display.type of a cloned config -> updatePage 400: a template of
 *   the same type is required.
 */

import type {
  CaptureTemplatesResult,
  CreateComponentArgs,
  CreateComponentResult,
  DeleteComponentResult,
  ExportResult,
  NetEntry,
  ReadyState,
} from './types2.js';

// ---------------------------------------------------------------------------
// readyStateScript: is the editor model loaded?
// ---------------------------------------------------------------------------

export function readyStateScript(): ReadyState {
  const w = window as any;
  try {
    const report = w.angular.element(document.body).injector().get('legoUndoRedoService').report;
    const pages = report && report.pages ? report.pages.length : 0;
    const comps = pages ? report.pages.reduce((n: number, p: any) => n + p.components.length, 0) : 0;
    return { ready: pages > 0, pages, components: comps, url: location.href };
  } catch {
    return { ready: false, pages: 0, components: 0, url: location.href };
  }
}

// ---------------------------------------------------------------------------
// Network monitor: records ONLY path + status of save/data calls.
// Never headers or bodies (they carry the XSRF token and report content).
// ---------------------------------------------------------------------------

export function installNetMonitorScript(): { installed: boolean } {
  const w = window as any;
  if (w.__mcpNet) return { installed: true };
  w.__mcpNet = [] as Array<{ path: string; status: number; t: number }>;
  const RE = /\/(updatePage|updateReport|batchedDataV2|createReport|deletePage)\b/;
  const origOpen = XMLHttpRequest.prototype.open;
  const origSend = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function (this: any, method: string, url: string | URL, ...rest: any[]) {
    this.__mcpPath = String(url).split('?')[0];
    return (origOpen as any).call(this, method, url, ...rest);
  } as any;
  XMLHttpRequest.prototype.send = function (this: any, ...args: any[]) {
    const path: string = this.__mcpPath || '';
    if (RE.test(path)) {
      this.addEventListener('loadend', () => {
        const log = w.__mcpNet as any[];
        log.push({ path: path.replace(/^https?:\/\/[^/]+/, ''), status: this.status, t: Date.now() });
        if (log.length > 200) log.splice(0, log.length - 200);
      });
    }
    return (origSend as any).apply(this, args);
  } as any;
  const origFetch = w.fetch;
  if (typeof origFetch === 'function') {
    w.fetch = function (input: any, init?: any) {
      const path = String((input && input.url) || input).split('?')[0];
      const p = origFetch.call(this, input, init);
      if (RE.test(path)) {
        p.then((res: Response) => {
          (w.__mcpNet as any[]).push({ path: path.replace(/^https?:\/\/[^/]+/, ''), status: res.status, t: Date.now() });
        }).catch(() => undefined);
      }
      return p;
    };
  }
  return { installed: true };
}

export function readNetLogScript(since: number): NetEntry[] {
  const w = window as any;
  return ((w.__mcpNet || []) as NetEntry[]).filter((e) => e.t >= since);
}

// ---------------------------------------------------------------------------
// exportReportScript: whole report as JSON ("source file" of the report).
// ---------------------------------------------------------------------------

export function exportReportScript(): ExportResult {
  const w = window as any;
  const report = w.angular.element(document.body).injector().get('legoUndoRedoService').report;
  const clone = (o: any) => JSON.parse(JSON.stringify(o));
  const pageNames: Record<string, string> = {};
  for (const p of report.config.page || []) pageNames[String(p.id)] = String((p.attribute && p.attribute.name) || '');
  const all = [...report.pages.flatMap((p: any) => p.components), ...report.components];
  const dtNames: Record<number, string> = { 0: 'TEXT', 1: 'BOOLEAN', 2: 'NUMBER', 6: 'DATE', 7: 'DATETIME' };
  const ids = new Set<string>();
  try { for (const x of report.getDatasourceIds() || []) ids.add(String(x)); } catch { /* ignore */ }
  for (const c of all) { try { const d = c.getDataSourceId(); if (d) ids.add(String(d)); } catch { /* ignore */ } }
  const dataSources = [...ids].map((id) => {
    let concepts: any = {};
    try { concepts = report.getDatasourceSchema(id)?.qe?.concepts || {}; } catch { /* ignore */ }
    if (!Object.keys(concepts).length) {
      const c = all.find((x: any) => { try { return String(x.getDataSourceId()) === id; } catch { return false; } });
      try { concepts = c?.getSchema?.()?.qe?.concepts || {}; } catch { /* ignore */ }
    }
    return {
      id,
      usedBy: all.filter((x: any) => { try { return String(x.getDataSourceId()) === id; } catch { return false; } }).map((x: any) => String(x.getId())),
      fields: Object.values(concepts).map((f: any) => ({
        id: String(f.name), name: String(f.displayName ?? f.name), type: (f.type === 1 ? 'METRIC' : 'DIMENSION') as 'METRIC' | 'DIMENSION',
        dataType: dtNames[f.dataType] ?? String(f.dataType), defaultAggregation: f.defaultAggregation ?? null,
      })),
    };
  });
  const a = report.config.attribute || {};
  return {
    exportedAt: new Date().toISOString(),
    url: location.href,
    title: document.title,
    reportId: String(report.config.id),
    canvas: { width: Number(a.width) || 0, height: Number(a.height) || 0 },
    pages: report.pages.map((p: any) => ({
      id: String(p.getId()),
      name: pageNames[String(p.getId())] ?? '',
      components: p.components.map((c: any) => clone(c.config)),
    })),
    reportComponents: report.components.map((c: any) => clone(c.config)),
    dataSources,
    types: [...new Set(all.map((c: any) => String(c.config.config.display.type)))],
  };
}

// ---------------------------------------------------------------------------
// captureTemplatesScript: one config per display type present in the report.
// ---------------------------------------------------------------------------

export function captureTemplatesScript(): CaptureTemplatesResult {
  const w = window as any;
  const report = w.angular.element(document.body).injector().get('legoUndoRedoService').report;
  const all = [...report.pages.flatMap((p: any) => p.components), ...report.components];
  const templates: CaptureTemplatesResult['templates'] = {};
  for (const c of all) {
    const type = String(c.config.config.display.type);
    if (templates[type]) continue;
    const cfg = JSON.parse(JSON.stringify(c.config));
    templates[type] = { config: cfg, fromComponent: String(c.getId()), dataSourceId: (() => { try { return String(c.getDataSourceId() || ''); } catch { return ''; } })() };
  }
  let registered: string[] = [];
  try {
    const reg = w.angular.element(document.body).injector().get('legoMainRegistry');
    const k = Object.keys(reg).find((x) => reg[x] && typeof reg[x] === 'object' && reg[x]['kpi-metric']);
    registered = k ? Object.keys(reg[k]) : [];
  } catch { /* ignore */ }
  return { url: location.href, templates, registeredTypes: registered };
}

// ---------------------------------------------------------------------------
// createComponentScript
// ---------------------------------------------------------------------------

export function createComponentScript(args: CreateComponentArgs): CreateComponentResult {
  const w = window as any;
  const warnings: string[] = [];
  const fail = (error: string): CreateComponentResult => ({ ok: false, componentId: null, type: args.type, source: null, warnings, error });
  let inj: any;
  let report: any;
  try {
    inj = w.angular.element(document.body).injector();
    report = inj.get('legoUndoRedoService').report;
  } catch {
    return fail('Internals no disponibles (legoUndoRedoService).');
  }
  const page = args.pageId
    ? report.pages.find((p: any) => String(p.getId()) === String(args.pageId))
    : report.pages[report.selected] || report.pages[0];
  if (!page) return fail(`Pagina ${args.pageId} no encontrada.`);
  const all = [...report.pages.flatMap((p: any) => p.components), ...report.components];

  // 1) Same-type component in this report (best fidelity) 2) learned template.
  const same = all.find((c: any) => c.config.config.display.type === args.type);
  let cfg: any;
  let source: string;
  if (same) {
    cfg = same.duplicateConfig();
    source = `clone:${same.getId()}`;
  } else if (args.template) {
    const minter = all[0];
    if (!minter) return fail('El informe no tiene componentes: crea uno en la UI para poder generar ids.');
    const fresh = minter.duplicateConfig();
    cfg = JSON.parse(JSON.stringify(args.template));
    cfg.id = fresh.id;
    if (cfg.attribute) delete cfg.attribute.alias;
    source = 'template';
  } else {
    return fail(`No hay componente ni plantilla del tipo "${args.type}". Captura una con capture_templates desde un informe que lo tenga.`);
  }
  if (cfg.config.display.type !== args.type) return fail('La plantilla no coincide con el tipo pedido.');

  cfg.attribute = Object.assign(cfg.attribute || {}, {
    left: Math.round(args.box.x), top: Math.round(args.box.y), width: Math.round(args.box.width), height: Math.round(args.box.height),
  });

  // Switch dataset and scrub field references (qt_ concepts) from the source.
  const keys = cfg.config.datasource && cfg.config.datasource.keys;
  const curDs = keys && keys.dataset && keys.dataset.value && keys.dataset.value.id;
  const wantDs = args.datasetId || curDs;
  if (keys && wantDs && wantDs !== curDs) {
    keys.dataset = { stateKey: 'ds', dominant: 2, value: { id: wantDs } };
    const scrub = (v: any): any => {
      if (typeof v === 'string') return v.startsWith('qt_') ? undefined : v;
      if (Array.isArray(v)) return v.map(scrub).filter((x) => x !== undefined);
      if (v && typeof v === 'object') {
        const o: any = {};
        for (const [k, x] of Object.entries(v)) { const s = scrub(x); if (s !== undefined) o[k] = s; }
        return o;
      }
      return v;
    };
    for (const k of Object.keys(keys)) {
      if (k === 'dataset') continue;
      if (keys[k] && 'value' in keys[k]) {
        const s = scrub(keys[k].value);
        if (s === undefined) delete keys[k].value; else keys[k].value = s;
      }
    }
    cfg.conceptDefs = {};
    warnings.push(`Origen cambiado de ${curDs} a ${wantDs}: campos del original eliminados; vincula campos con bind.`);
  }
  if (args.padding !== undefined && cfg.config.display && cfg.config.display.keys) {
    const dk = cfg.config.display.keys;
    for (const side of ['Top', 'Right', 'Bottom', 'Left']) {
      const k = 'padding' + side;
      if (k in dk) dk[k] = { stateKey: k, dominant: 2, value: `${Math.round(args.padding)}px` };
    }
  }
  let comp: any;
  try {
    comp = page.addComponent(cfg);
  } catch (e: any) {
    return fail('page.addComponent fallo: ' + (e && e.message));
  }
  if (!args.deferSave) {
    try { inj.get('wrapperSaveService').save([comp]); } catch (e: any) { warnings.push('save fallo: ' + (e && e.message)); }
  }
  return { ok: true, componentId: String(comp.getId()), type: args.type, source, warnings, pageId: String(page.getId()) };
}

// ---------------------------------------------------------------------------
// deleteComponentScript: uses an internal remove method when available;
// otherwise selects the component so the caller can press Delete (trusted key).
// ---------------------------------------------------------------------------

export function deleteComponentScript(componentId: string): DeleteComponentResult {
  const w = window as any;
  let inj: any;
  let report: any;
  try {
    inj = w.angular.element(document.body).injector();
    report = inj.get('legoUndoRedoService').report;
  } catch {
    return { ok: false, method: null, needsKeyboard: false, error: 'Internals no disponibles.' };
  }
  const page = report.pages.find((p: any) => p.components.some((c: any) => c.getId() === componentId));
  if (!page) return { ok: false, method: null, needsKeyboard: false, error: `Componente ${componentId} no encontrado.` };
  const comp = page.components.find((c: any) => c.getId() === componentId);
  for (const m of ['removeComponent', 'deleteComponent']) {
    if (typeof page[m] === 'function') {
      try {
        page[m](comp);
        if (page.components.some((c: any) => c.getId() === componentId)) page[m](componentId);
        if (!page.components.some((c: any) => c.getId() === componentId)) {
          try { inj.get('wrapperSaveService').save([page]); } catch { /* page-level save may differ */ }
          return { ok: true, method: `page.${m}`, needsKeyboard: false };
        }
      } catch { /* try next */ }
    }
  }
  try {
    report.selectComponents([comp], true);
    return { ok: false, method: 'select', needsKeyboard: true };
  } catch (e: any) {
    return { ok: false, method: null, needsKeyboard: false, error: 'No se pudo seleccionar: ' + (e && e.message) };
  }
}

export function componentExistsScript(componentId: string): boolean {
  const w = window as any;
  try {
    const report = w.angular.element(document.body).injector().get('legoUndoRedoService').report;
    return [...report.pages.flatMap((p: any) => p.components), ...report.components].some((c: any) => c.getId() === componentId);
  } catch {
    return false;
  }
}
