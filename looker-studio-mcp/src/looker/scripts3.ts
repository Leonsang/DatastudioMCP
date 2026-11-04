/**
 * PAGE-INJECTED SCRIPTS (v3): pages, themes, template synthesis, UX audit.
 * Self-contained functions (serialized by puppeteer). Verified mechanisms:
 *   theme:  report.config.resource.theme[] = {id, content:{themeFillColor, themeFontColor, ...}}
 *           report.addResource('theme', content) / updateResourceById('theme', id, content)
 *           report.setDisplayKeyValue('themeConfig', id)   (preset ids look like "t-default-modern")
 *           wrapperSaveService.save([report])               (report-level save)
 *   pages:  report.addPage(pageConfig)
 */

// ---------------------------------------------------------------------------
// theme
// ---------------------------------------------------------------------------

export function readThemeScript(): { themeConfig: string | null; custom: unknown | null; themes: number } {
  const w = window as any;
  const report = w.angular.element(document.body).injector().get('legoUndoRedoService').report;
  const keys = report.config.config.display.keys || {};
  const themeConfig = keys.themeConfig ? String(keys.themeConfig.value) : null;
  const list = (report.config.resource && report.config.resource.theme) || [];
  const hit = list.find((t: any) => t.id === themeConfig);
  const strip = (o: any) => JSON.parse(JSON.stringify(o, (k, v) => (k === '$$hashKey' ? undefined : v)));
  return { themeConfig, custom: hit ? strip(hit.content) : null, themes: list.length };
}

export function applyThemeScript(content: Record<string, unknown>): { ok: boolean; themeId: string | null; created: boolean; error?: string } {
  const w = window as any;
  try {
    const inj = w.angular.element(document.body).injector();
    const report = inj.get('legoUndoRedoService').report;
    const keys = report.config.config.display.keys || {};
    const cur = keys.themeConfig ? String(keys.themeConfig.value) : null;
    const list = (report.config.resource && report.config.resource.theme) || [];
    let id: string | null = null;
    let created = false;
    if (cur && list.some((t: any) => t.id === cur)) {
      report.updateResourceById('theme', cur, content);
      id = cur;
    } else {
      report.addResource('theme', content);
      const after = report.config.resource.theme;
      id = after[after.length - 1].id;
      created = true;
    }
    report.setDisplayKeyValue('themeConfig', id);
    inj.get('wrapperSaveService').save([report]);
    return { ok: true, themeId: id, created };
  } catch (e: any) {
    return { ok: false, themeId: null, created: false, error: String(e && e.message) };
  }
}

// ---------------------------------------------------------------------------
// pages
// ---------------------------------------------------------------------------

export function listPagesScript(): Array<{ id: string; name: string; components: number; index: number }> {
  const w = window as any;
  const report = w.angular.element(document.body).injector().get('legoUndoRedoService').report;
  return report.pages.map((p: any, i: number) => ({
    id: String(p.getId()),
    name: String((p.config.attribute && p.config.attribute.name) || ''),
    components: p.components.length,
    index: i,
  }));
}

export function addPageScript(): { ok: boolean; before: number; error?: string } {
  // The model-level report.addPage() is not persisted (updatePage 500 for an unknown page):
  // pages are created by the toolbar action, which calls POST /createPages (verified 2026-11-03).
  const w = window as any;
  try {
    const report = w.angular.element(document.body).injector().get('legoUndoRedoService').report;
    const before = report.pages.length;
    const btn = Array.from(document.querySelectorAll('button')).find((b) => /A[nñ]adir p[aá]gina|Add page/i.test((b as HTMLElement).innerText || b.getAttribute('aria-label') || ''));
    if (!btn) return { ok: false, before, error: 'Boton "Anadir pagina" no encontrado (modo edicion?).' };
    (btn as HTMLElement).click();
    return { ok: true, before };
  } catch (e: any) {
    return { ok: false, before: 0, error: String(e && e.message) };
  }
}

export function renamePageScript(args: { pageId: string; name: string }): { ok: boolean; error?: string } {
  const w = window as any;
  try {
    const inj = w.angular.element(document.body).injector();
    const report = inj.get('legoUndoRedoService').report;
    const page = report.pages.find((p: any) => String(p.getId()) === String(args.pageId));
    if (!page) return { ok: false, error: `Pagina ${args.pageId} no encontrada.` };
    if (typeof page.setAttributeValues === 'function') page.setAttributeValues({ name: args.name });
    else page.config.attribute.name = args.name;
    const rc = report.config.page.find((p: any) => String(p.id) === String(args.pageId));
    if (rc) rc.attribute.name = args.name;
    // Page-level save stores the page; the navigation list (view mode) comes from the report
    // config, so save the report too (observed 2026-11-03: names stayed "Pagina sin titulo").
    inj.get('wrapperSaveService').save([page]);
    inj.get('wrapperSaveService').save([report]);
    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: String(e && e.message) };
  }
}

// ---------------------------------------------------------------------------
// synthesizeComponentScript: a NEW display type without any template, from the
// type's registry defaults: clone a data component, switch display type, drop its
// display overrides. The caller binds fields matching the type's defaults
// (getDefaultNumOfDimensions/Metrics) before the first save.
// ---------------------------------------------------------------------------

export function synthesizeComponentScript(args: { type: string; box: { x: number; y: number; width: number; height: number }; pageId?: string }): {
  ok: boolean;
  componentId: string | null;
  defaults: { dims: number | null; metrics: number | null; time: boolean | null; geo: boolean | null };
  fieldConfigs?: Array<{ id: string; slot: string; kind: 'dimension' | 'metric'; min: number; count: number; supportedTypes?: number[] }>;
  error?: string;
} {
  const w = window as any;
  const fail = (error: string) => ({ ok: false, componentId: null, defaults: { dims: null, metrics: null, time: null, geo: null }, error });
  try {
    const inj = w.angular.element(document.body).injector();
    const report = inj.get('legoUndoRedoService').report;
    const reg = inj.get('legoMainRegistry');
    const obj = reg.getDisplayTypeObj(args.type);
    if (!obj) return fail(`Tipo "${args.type}" no registrado en este editor.`);
    const page = args.pageId ? report.pages.find((p: any) => String(p.getId()) === String(args.pageId)) : (report.pages.find((pg: any) => String(pg.getId()) === ((location.pathname.match(/\/page\/([^/]+)/) || [])[1] ?? '')) || report.pages[report.selected]) || report.pages[0];
    if (!page) return fail('Pagina no encontrada.');
    const all = [...report.pages.flatMap((p: any) => p.components)];
    const base = all.find((c: any) => c.config.config.display.type === 'simple-table') || all.find((c: any) => c.config.config.datasource && c.config.config.datasource.keys && c.config.config.datasource.keys.metrics);
    if (!base) return fail('No hay un componente con datos que clonar.');
    const cfg = base.duplicateConfig();
    cfg.config.display = { keys: {}, type: args.type, preset: 'default' };
    Object.assign(cfg.attribute, { left: Math.round(args.box.x), top: Math.round(args.box.y), width: Math.round(args.box.width), height: Math.round(args.box.height) });
    if (cfg.attribute) delete cfg.attribute.alias;
    const comp = page.addComponent(cfg);
    const call = (f: string) => { try { return typeof obj[f] === 'function' ? obj[f]() : null; } catch { return null; } };
    let fieldConfigs: any[] = [];
    try {
      fieldConfigs = (obj.getDataFieldConfigs() || []).map((f: any) => ({
        id: String(f.id), slot: String((f.options && f.options.conceptKey) || 'primary'), kind: f.type === 1 ? 'dimension' : 'metric',
        min: Number((f.options && f.options.min) ?? 0), count: Number((f.options && (f.options.defaultFieldCount ?? f.options.min)) ?? 0),
        ...(f.options && f.options.supportedTypes ? { supportedTypes: f.options.supportedTypes } : {}),
      }));
    } catch { /* older builds */ }
    return {
      ok: true,
      fieldConfigs,
      componentId: String(comp.getId()),
      defaults: { dims: call('getDefaultNumOfDimensions'), metrics: call('getDefaultNumOfMetrics'), time: call('getUseTimeAsDefault'), geo: call('getUseGeoAsDefault') },
    };
  } catch (e: any) {
    return fail(String(e && e.message));
  }
}

// ---------------------------------------------------------------------------
// uxAuditScript: raw facts for the UX audit (scoring happens in Node).
// ---------------------------------------------------------------------------

export function uxFactsScript(): {
  theme: unknown | null;
  themeConfig: string | null;
  components: Array<{ id: string; type: string; page: string; overrides: Record<string, unknown> }>;
  pages: Array<{ id: string; name: string; background: unknown }>;
} {
  const w = window as any;
  const report = w.angular.element(document.body).injector().get('legoUndoRedoService').report;
  const keys = report.config.config.display.keys || {};
  const themeConfig = keys.themeConfig ? String(keys.themeConfig.value) : null;
  const list = (report.config.resource && report.config.resource.theme) || [];
  const hit = list.find((t: any) => t.id === themeConfig);
  const THEME = /color|fontfamily|background|border|shadow|opacity/i;
  const components = report.pages.flatMap((p: any) =>
    p.components.map((c: any) => {
      const dk = c.config.config.display.keys || {};
      const overrides: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(dk)) {
        const val = (v as any) && (v as any).value;
        if (THEME.test(k) && val !== undefined && val !== null && !(Array.isArray(val) && val.every((x: any) => x === null || x === undefined))) overrides[k] = val;
      }
      return { id: String(c.getId()), type: String(c.config.config.display.type), page: String(p.getId()), overrides };
    }),
  );
  const pages = report.pages.map((p: any) => ({
    id: String(p.getId()),
    name: String((p.config.attribute && p.config.attribute.name) || ''),
    background: ((p.config.config.display.keys || {}).background || {}).value ?? null,
  }));
  return { theme: hit ? JSON.parse(JSON.stringify(hit.content, (k, v) => (k === '$$hashKey' ? undefined : v))) : null, themeConfig, components, pages };
}

// ---------------------------------------------------------------------------
// theme presets (ids found in the editor bundle 2026-11-03: t-default-modern, t-harvest, t-eucalyptus, ...)
// ---------------------------------------------------------------------------

export function setThemePresetScript(presetId: string): { ok: boolean; error?: string } {
  const w = window as any;
  try {
    const inj = w.angular.element(document.body).injector();
    const report = inj.get('legoUndoRedoService').report;
    report.setDisplayKeyValue('themeConfig', presetId);
    inj.get('wrapperSaveService').save([report]);
    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: String(e && e.message) };
  }
}

// ---------------------------------------------------------------------------
// filters: report.config.resource.filter[id] = {name, datasourceId, filterDefinition:{filterExpression:{...}}, version:3}
// referenced from page/component datasource.keys.filters.value = [id]
// ---------------------------------------------------------------------------

export function listFiltersScript(): Array<{ id: string; name: string; datasourceId: string; field: string | null; condition: string | null; include: boolean | null; values: unknown[]; usedBy: string[] }> {
  const w = window as any;
  const report = w.angular.element(document.body).injector().get('legoUndoRedoService').report;
  const res = (report.config.resource && report.config.resource.filter) || {};
  const usedBy: Record<string, string[]> = {};
  const note = (owner: string, keys: any) => {
    const v = keys && keys.filters && keys.filters.value;
    if (Array.isArray(v)) for (const id of v) (usedBy[id] = usedBy[id] || []).push(owner);
  };
  for (const p of report.pages) {
    note(`page:${p.getId()}`, p.config.config.datasource && p.config.config.datasource.keys);
    for (const c of p.components) note(`component:${c.getId()}`, c.config.config.datasource && c.config.config.datasource.keys);
  }
  return Object.entries(res).map(([id, f]: [string, any]) => {
    const ex = f.filterDefinition && f.filterDefinition.filterExpression;
    return {
      id, name: String(f.name || ''), datasourceId: String(f.datasourceId || ''),
      field: ex && ex.queryTimeTransformation ? ex.queryTimeTransformation.dataTransformation.sourceFieldName : null,
      condition: ex ? ex.filterConditionType : null, include: ex ? !!ex.include : null,
      values: ex ? [...(ex.stringValues || []), ...(ex.numberValues || [])] : [], usedBy: usedBy[id] || [],
    };
  });
}

export function addFilterScript(args: {
  name: string; datasetId: string; field: string; condition: string; values: Array<string | number>; include: boolean;
}): { ok: boolean; filterId: string | null; error?: string } {
  const w = window as any;
  try {
    const inj = w.angular.element(document.body).injector();
    const report = inj.get('legoUndoRedoService').report;
    // resolve field by id or display name using any component bound to that dataset
    const all = report.pages.flatMap((p: any) => p.components);
    const comp = all.find((c: any) => { try { return String(c.getDataSourceId()) === args.datasetId; } catch { return false; } });
    let concepts: any = {};
    try { concepts = (comp && comp.getSchema().qe.concepts) || report.getDatasourceSchema(args.datasetId).qe.concepts || {}; } catch { /* ignore */ }
    const list = Object.values(concepts) as any[];
    const f = concepts[args.field] || list.find((x) => String(x.displayName).toLowerCase() === args.field.toLowerCase());
    if (!f) return { ok: false, filterId: null, error: `Campo "${args.field}" no existe en el origen ${args.datasetId}.` };
    const qt = 'qt_' + Math.random().toString(36).slice(2, 12).padEnd(10, '0');
    const nums = args.values.filter((v) => typeof v === 'number') as number[];
    const strs = args.values.filter((v) => typeof v !== 'number').map(String);
    const before = new Set(Object.keys((report.config.resource && report.config.resource.filter) || {}));
    report.addResource('filter', {
      name: args.name,
      datasourceId: args.datasetId,
      filterDefinition: {
        filterExpression: {
          include: args.include, conceptType: 0, concept: { ns: 't0', name: qt },
          filterConditionType: args.condition, stringValues: strs, numberValues: nums,
          queryTimeTransformation: { dataTransformation: { sourceFieldName: String(f.name) } },
        },
      },
      version: 3,
    });
    const id = Object.keys(report.config.resource.filter).find((k) => !before.has(k)) || null;
    inj.get('wrapperSaveService').save([report]);
    return { ok: !!id, filterId: id };
  } catch (e: any) {
    return { ok: false, filterId: null, error: String(e && e.message) };
  }
}

export function attachFilterScript(args: { filterId: string; target: string; detach?: boolean }): { ok: boolean; filters: string[]; error?: string } {
  const w = window as any;
  try {
    const inj = w.angular.element(document.body).injector();
    const report = inj.get('legoUndoRedoService').report;
    const page = report.pages.find((p: any) => String(p.getId()) === args.target);
    const comp = page ? null : report.pages.flatMap((p: any) => p.components).find((c: any) => c.getId() === args.target);
    const owner = page || comp;
    if (!owner) return { ok: false, filters: [], error: `Destino ${args.target} no encontrado (id de pagina o componente).` };
    const keys = owner.config.config.datasource.keys;
    const cur: string[] = (keys.filters && Array.isArray(keys.filters.value) ? keys.filters.value : []).slice();
    const next = args.detach ? cur.filter((x) => x !== args.filterId) : cur.includes(args.filterId) ? cur : [...cur, args.filterId];
    if (typeof owner.setDataSourceKeyValue === 'function') owner.setDataSourceKeyValue('filters', next, true, true);
    else keys.filters = { stateKey: 'filters', dominant: 3, value: next };
    try { if (owner.syncState) owner.syncState(true); } catch { /* ignore */ }
    inj.get('wrapperSaveService').save([owner]);
    return { ok: true, filters: next };
  } catch (e: any) {
    return { ok: false, filters: [], error: String(e && e.message) };
  }
}

// ---------------------------------------------------------------------------
// probeDatasetSchemaScript: schema of a data source no component uses yet.
// report.getDatasourceSchema() stays empty until something queries the source, so
// add a temporary (never saved) component on it, query, read getSchema(), remove it.
// ---------------------------------------------------------------------------

export function probeStartScript(datasetId: string): { ok: boolean; error?: string } {
  const w = window as any;
  try {
    const report = w.angular.element(document.body).injector().get('legoUndoRedoService').report;
    const page = report.pages[0];
    const all = report.pages.flatMap((p: any) => p.components);
    const base = all.find((c: any) => c.config.config.display.type === 'kpi-metric') || all.find((c: any) => c.config.config.datasource && c.config.config.datasource.keys);
    if (!base) return { ok: false, error: 'Sin componentes para clonar.' };
    const cfg = base.duplicateConfig();
    cfg.config.datasource.keys.dataset = { stateKey: 'ds', dominant: 2, value: { id: datasetId } };
    Object.assign(cfg.attribute, { left: 0, top: 0, width: 10, height: 10 });
    const tmp = page.addComponent(cfg);
    try { tmp.syncState(true); } catch { /* ignore */ }
    w.__mcpProbe = { page, tmp };
    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: String(e && e.message) };
  }
}

/** Reads the probe's schema; removes the temporary (never saved) component when done or when `finish`. */
export function probeReadScript(finish: boolean): { ready: boolean; fields: Array<{ id: string; name: string; type: number; dataType: number }> } {
  const w = window as any;
  const pr = w.__mcpProbe;
  if (!pr) return { ready: true, fields: [] };
  let concepts: any = {};
  try { concepts = pr.tmp.getSchema()?.qe?.concepts || {}; } catch { /* ignore */ }
  const ready = Object.keys(concepts).length > 0;
  if (ready || finish) {
    try { pr.page.removeComponent(pr.tmp); } catch { /* ignore */ }
    w.__mcpProbe = null;
  }
  return { ready, fields: Object.values(concepts).map((f: any) => ({ id: String(f.name), name: String(f.displayName ?? f.name), type: Number(f.type), dataType: Number(f.dataType) })) };
}

export function fieldConfigsScript(type: string): Array<{ id: string; slot: string; kind: string; min: number; max: number | null }> {
  const w = window as any;
  try {
    const reg = w.angular.element(document.body).injector().get('legoMainRegistry');
    return (reg.getDisplayTypeObj(type).getDataFieldConfigs() || []).map((f: any) => ({
      id: String(f.id), slot: String((f.options && f.options.conceptKey) || 'primary'), kind: f.type === 1 ? 'dimension' : 'metric',
      min: Number((f.options && f.options.min) ?? 0), max: f.options && f.options.max !== undefined ? Number(f.options.max) : null,
    }));
  } catch {
    return [];
  }
}
