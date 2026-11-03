/**
 * ============================================================================
 *  PAGE-INJECTED SCRIPTS  --  THE ONLY FILE THAT SHOULD CHANGE WHEN LOOKER
 *  STUDIO UPDATES ITS INTERNALS.
 * ============================================================================
 *
 * Every exported function is passed verbatim to `page.evaluate(fn, ...args)`.
 * Puppeteer serializes it with `Function.prototype.toString()`, so:
 *   - each function MUST be self-contained (helpers are duplicated on purpose);
 *   - arguments / return values MUST be JSON-serializable.
 *
 * Mechanism (see ../../../LOOKER_STUDIO_INTERNALS.md, captured 2026-11-03):
 *   injector = angular.element(document.body).injector()
 *   report   = injector.get('legoUndoRedoService').report
 *   comp     = report.pages[i].components[j] | report.components[j]
 *     comp.getId(), comp.config.attribute{top,left,width,height}
 *     comp.config.config.display.keys[k].value   (styles, "10px" strings)
 *     comp.setAttributeValues({...})              (re-render; autosave NOT guaranteed)
 *   injector.get('wrapperSaveService').save([comp])  (POST updatePage: explicit persist)
 *     comp.setDisplayKeyValue(k, v)               (style)
 *     comp.updateMetrics/updateDimensions('primary', conceptDefs[])
 *     comp.syncState(true)                        (re-query data)
 *   report.getDatasourceSchema(datasetId).qe.concepts  (fields; type 0=dim, 1=metric)
 *     -> may be EMPTY until loaded at report level (new reports): fall back to
 *        comp.getSchema().qe.concepts of a component bound to that dataset.
 *   comp.getError() -> {title, description, reason, errorTextInfo.errorDialogText}
 *
 * Only "readable" names are used. Minified 2-4 letter names change per deploy.
 * When the internals are unavailable, read-only scripts fall back to the DOM.
 */

import type {
  BindFieldsArgs,
  BindFieldsResult,
  BoxModelArgs,
  BoxModelResult,
  DataSourcesResult,
  DiagnoseResult,
  LayoutResult,
  PageInfoRaw,
} from './types.js';

// ---------------------------------------------------------------------------
// pageInfoScript
// ---------------------------------------------------------------------------

export function pageInfoScript(): PageInfoRaw {
  const w = window as any;
  let canvas: PageInfoRaw['canvas'] = null;
  let report: any = null;
  try {
    report = w.angular.element(document.body).injector().get('legoUndoRedoService').report;
  } catch {
    /* internals unavailable */
  }
  let zoom = 1;
  const wrap = document.querySelector<HTMLElement>('div.lego-component-repeat');
  if (wrap) {
    const declared = parseFloat(wrap.style.width);
    const real = wrap.getBoundingClientRect().width;
    if (declared > 0 && real > 0) zoom = Math.round((real / declared) * 1000) / 1000;
  }
  if (report && report.config && report.config.attribute) {
    const a = report.config.attribute;
    canvas = { width: Number(a.width) || 0, height: Number(a.height) || 0, zoom };
  }
  let permissions: any = null;
  try {
    let s: any;
    w.angular.element(document.body).injector().get('store').subscribe((x: any) => (s = x)).unsubscribe();
    // NOTE: unreliable — isEditable/isOwner read false even in /edit on an owned report.
    // Use the URL (/edit) to decide the mode.
    permissions = s && s.permissions ? { isEditable: !!s.permissions.isEditable, isOwner: !!s.permissions.isOwner } : null;
  } catch {
    /* ignore */
  }
  let pages: PageInfoRaw['pages'] = [];
  let activePageId: string | null = null;
  if (report) {
    pages = (report.config.page || []).map((p: any) => ({ id: String(p.id), name: String(p.attribute && p.attribute.name || '') }));
    const ap = report.pages[report.selected] || report.pages[0];
    activePageId = ap ? String(ap.getId()) : null;
  }
  return {
    title: document.title,
    url: location.href,
    visibilityState: document.visibilityState,
    hasFocus: document.hasFocus(),
    canvas,
    internals: !!report,
    internalReportId: report ? String(report.config.id) : null,
    permissions,
    pages,
    activePageId,
  };
}

// ---------------------------------------------------------------------------
// readLayoutScript
// ---------------------------------------------------------------------------

export function readLayoutScript(pageId?: string): LayoutResult {
  const w = window as any;
  const warnings: string[] = [];
  const px = (v: any): number => {
    if (v === undefined || v === null || v === '') return 0;
    const n = parseFloat(String(v));
    return isNaN(n) ? 0 : n;
  };
  let report: any = null;
  try {
    report = w.angular.element(document.body).injector().get('legoUndoRedoService').report;
  } catch {
    /* fallback below */
  }

  if (report) {
    const page =
      (pageId && report.pages.find((p: any) => String(p.getId()) === String(pageId))) ||
      report.pages[report.selected] ||
      report.pages[0];
    if (pageId && String(page.getId()) !== String(pageId)) warnings.push(`Pagina ${pageId} no encontrada; se usa la activa.`);
    const wrappers = Array.from(document.querySelectorAll<HTMLElement>('div.lego-component-repeat'));
    const geoKey = (t: any, l: any, wd: any, h: any) => [px(t), px(l), px(wd), px(h)].join(',');
    const wrapByGeo = new Map<string, HTMLElement>();
    for (const el of wrappers) wrapByGeo.set(geoKey(el.style.top, el.style.left, el.style.width, el.style.height), el);

    const toItem = (c: any, level: 'page' | 'report') => {
      const a = c.config.attribute || {};
      const keys = (c.config.config && c.config.config.display && c.config.config.display.keys) || {};
      const val = (k: string) => (keys[k] ? keys[k].value : undefined);
      const bg = val('background');
      const border = val('border');
      const el = wrapByGeo.get(geoKey(a.top, a.left, a.width, a.height));
      if (el) el.setAttribute('data-mcp-id', c.getId());
      const ds = (c.config.config && c.config.config.datasource && c.config.config.datasource.keys) || {};
      const dims = ds.dimensions && ds.dimensions.value ? ds.dimensions.value : null;
      const mets = ds.metrics && ds.metrics.value ? ds.metrics.value : null;
      const defs = c.config.conceptDefs || {};
      const fieldOf = (n: string) => {
        const d = defs[n];
        return d && d.queryTimeTransformation && d.queryTimeTransformation.dataTransformation
          ? d.queryTimeTransformation.dataTransformation.sourceFieldName || n
          : n;
      };
      const flat = (v: any) => (v ? (Object.values(v).flat() as string[]) : []);
      let error: string | null = null;
      try {
        if (c.hasError && c.hasError()) error = 'category:' + (c.getErrorCategory ? c.getErrorCategory() : '?');
      } catch {
        /* ignore */
      }
      if (!error && el) {
        const txt = el.innerText || '';
        const m = txt.match(/Error del sistema|Configuraci[oó]n de gr[aá]fico no v[aá]lida|Error de configuraci[oó]n de datos|Error de configuraci[oó]n del usuario|Sin acceso al conjunto de datos|System error|Invalid chart configuration|Data set configuration error/i);
        if (m) error = m[0];
      }
      return {
        id: String(c.getId()),
        type: String((c.config.config && c.config.config.display && c.config.config.display.type) || 'unknown'),
        level,
        x: px(a.left),
        y: px(a.top),
        width: px(a.width),
        height: px(a.height),
        style: {
          padding: { top: px(val('paddingTop')), right: px(val('paddingRight')), bottom: px(val('paddingBottom')), left: px(val('paddingLeft')) },
          supportsPadding: ['paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft'].some((k) => k in keys),
          backgroundColor: bg && typeof bg === 'object' ? bg.color ?? null : typeof bg === 'string' ? bg : null,
          borderColor: border && typeof border === 'object' ? border.color ?? null : null,
          borderWidth: border && typeof border === 'object' && border.size !== undefined ? Number(border.size) : null,
          borderRadius: border && typeof border === 'object' && border.radius !== undefined ? Number(border.radius) : null,
        },
        data: {
          dimensions: flat(dims).map(fieldOf),
          metrics: flat(mets).map(fieldOf),
        },
        error,
      };
    };
    const components = [
      ...page.components.map((c: any) => toItem(c, 'page')),
      ...report.components.map((c: any) => toItem(c, 'report')),
    ];
    const a = report.config.attribute || {};
    return {
      pageId: String(page.getId()),
      canvas: { width: px(a.width), height: px(a.height), zoom: 1 },
      components,
      source: 'internals',
      warnings,
    };
  }

  // ---- DOM fallback -------------------------------------------------------
  warnings.push('Internals no disponibles: layout leido del DOM (ids sinteticos, sin datos).');
  const wrappers = Array.from(document.querySelectorAll<HTMLElement>('div.lego-component-repeat'));
  const components = wrappers.map((el, i) => {
    const inner = el.querySelector<HTMLElement>('ng2-canvas-component');
    const firstDiv = inner ? (inner.firstElementChild as HTMLElement | null) : null;
    const cs = firstDiv ? getComputedStyle(firstDiv) : null;
    const id = el.getAttribute('data-mcp-id') || `dom-${i}`;
    el.setAttribute('data-mcp-id', id);
    return {
      id,
      type: inner ? inner.className.split(/\s+/)[0] || 'unknown' : 'unknown',
      level: 'page' as const,
      x: px(el.style.left),
      y: px(el.style.top),
      width: px(el.style.width),
      height: px(el.style.height),
      style: {
        padding: cs
          ? { top: px(cs.paddingTop), right: px(cs.paddingRight), bottom: px(cs.paddingBottom), left: px(cs.paddingLeft) }
          : { top: 0, right: 0, bottom: 0, left: 0 },
        supportsPadding: false,
        backgroundColor: cs ? cs.backgroundColor : null,
        borderColor: cs ? cs.borderTopColor : null,
        borderWidth: cs ? px(cs.borderTopWidth) : null,
        borderRadius: cs ? px(cs.borderTopLeftRadius) : null,
      },
      data: { dimensions: [], metrics: [] },
      error: null,
    };
  });
  return { pageId: pageId ?? null, canvas: null, components, source: 'dom-heuristic', warnings };
}

// ---------------------------------------------------------------------------
// applyBoxModelScript
// ---------------------------------------------------------------------------

export async function applyBoxModelScript(args: BoxModelArgs): Promise<BoxModelResult> {
  const w = window as any;
  const warnings: string[] = [];
  const applied: string[] = [];
  const px = (v: any): number => {
    const n = parseFloat(String(v ?? ''));
    return isNaN(n) ? 0 : n;
  };
  let report: any;
  try {
    report = w.angular.element(document.body).injector().get('legoUndoRedoService').report;
  } catch {
    return { ok: false, componentId: args.componentId, applied, before: null, after: null, source: 'internals', warnings, error: 'No se encontro legoUndoRedoService (internals de Looker Studio no disponibles).' };
  }
  const all = [...report.pages.flatMap((p: any) => p.components), ...report.components];
  const comp = all.find((c: any) => c.getId() === args.componentId);
  if (!comp) {
    return { ok: false, componentId: args.componentId, applied, before: null, after: null, source: 'internals', warnings, error: `Componente ${args.componentId} no encontrado. Usa get_report_layout para ver los ids (cd-...).` };
  }
  const snap = () => {
    const a = comp.config.attribute;
    const keys = comp.config.config.display.keys || {};
    const v = (k: string) => (keys[k] ? keys[k].value : undefined);
    return {
      id: comp.getId(),
      type: comp.config.config.display.type,
      x: px(a.left), y: px(a.top), width: px(a.width), height: px(a.height),
      style: {
        padding: { top: px(v('paddingTop')), right: px(v('paddingRight')), bottom: px(v('paddingBottom')), left: px(v('paddingLeft')) },
        backgroundColor: null, borderColor: null, borderWidth: null, borderRadius: null,
      },
    };
  };
  const before = snap();

  if (args.padding) {
    const keys = comp.config.config.display.keys || {};
    const sides: Array<[string, number]> = [
      ['paddingTop', args.padding.top],
      ['paddingRight', args.padding.right],
      ['paddingBottom', args.padding.bottom],
      ['paddingLeft', args.padding.left],
    ];
    const supported = sides.filter(([k]) => k in keys);
    if (supported.length === 0) {
      warnings.push(`El tipo "${before.type}" no expone padding (no hay claves padding* en display.keys). Se ignora el padding.`);
    }
    for (const [k, v] of supported) {
      comp.setDisplayKeyValue(k, `${Math.round(v)}px`);
      applied.push(`${k}=${Math.round(v)}px`);
    }
    const missing = sides.filter(([k]) => !(k in keys)).map(([k]) => k);
    if (supported.length && missing.length) warnings.push(`Lados sin soporte en este tipo: ${missing.join(', ')}.`);
  }

  const attrs: Record<string, number> = {};
  if (args.position) { attrs.left = Math.round(args.position.x); attrs.top = Math.round(args.position.y); }
  if (args.dimensions) { attrs.width = Math.round(args.dimensions.width); attrs.height = Math.round(args.dimensions.height); }
  const changedAttrs = Object.entries(attrs).filter(([k, v]) => px(comp.config.attribute[k]) !== v);

  if (changedAttrs.length) {
    comp.setAttributeValues(Object.fromEntries(changedAttrs));
    for (const [k, v] of changedAttrs) applied.push(`${k}=${v}`);
  }
  if (applied.length) {
    // Explicit persistence: wrapperSaveService.save([comp]) -> POST updatePage (full
    // page snapshot). Verified 2026-11-03 in /edit: setAttributeValues alone does NOT
    // always schedule the autosave.
    try {
      w.angular.element(document.body).injector().get('wrapperSaveService').save([comp]);
    } catch (e: any) {
      warnings.push('wrapperSaveService.save fallo (' + (e && e.message) + '); se usa el empujon de atributos.');
      const l = px(comp.config.attribute.left);
      comp.setAttributeValues({ left: l + 1 });
      comp.setAttributeValues({ left: l });
    }
  }
  await new Promise((r) => setTimeout(r, 400));
  const after = snap();
  if (args.padding && JSON.stringify(after.style.padding) === JSON.stringify(before.style.padding) && applied.some((a) => a.startsWith('padding'))) {
    warnings.push('El padding no cambio en config tras aplicarlo; revisa en el panel de propiedades.');
  }
  return { ok: true, componentId: args.componentId, applied, before, after, source: 'internals', warnings };
}

// ---------------------------------------------------------------------------
// readDataSourcesScript
// ---------------------------------------------------------------------------

export function readDataSourcesScript(): DataSourcesResult {
  const w = window as any;
  const warnings: string[] = [];
  let report: any;
  try {
    report = w.angular.element(document.body).injector().get('legoUndoRedoService').report;
  } catch {
    return { dataSources: [], source: 'internals', warnings: ['Internals no disponibles (legoUndoRedoService).'] };
  }
  const ids = new Set<string>();
  const rootDs = report.config.config && report.config.config.datasource && report.config.config.datasource.keys.dataset;
  if (rootDs && rootDs.value && rootDs.value.id) ids.add(String(rootDs.value.id));
  const all = [...report.pages.flatMap((p: any) => p.components), ...report.components];
  const usage: Record<string, string[]> = {};
  for (const c of all) {
    const k = c.config.config && c.config.config.datasource && c.config.config.datasource.keys && c.config.config.datasource.keys.dataset;
    const id = k && k.value && k.value.id ? String(k.value.id) : rootDs && rootDs.value ? String(rootDs.value.id) : null;
    if (id) { ids.add(id); (usage[id] = usage[id] || []).push(c.getId()); }
  }
  try { for (const x of report.getDatasourceIds() || []) ids.add(String(x)); } catch { /* ignore */ }

  const dtNames: Record<number, string> = { 0: 'TEXT', 1: 'BOOLEAN', 2: 'DATE', 3: 'NUMBER', 4: 'CURRENCY', 5: 'NUMBER', 6: 'PERCENT', 7: 'GEO', 8: 'URL', 9: 'DATETIME' };
  const dataSources = [] as DataSourcesResult['dataSources'];
  for (const id of ids) {
    let schema: any = null;
    try { schema = report.getDatasourceSchema(id); } catch (e: any) { warnings.push(`getDatasourceSchema(${id}) fallo: ${e && e.message}`); }
    let concepts = schema && schema.qe && schema.qe.concepts ? schema.qe.concepts : {};
    if (!Object.keys(concepts).length) {
      // New reports: the report-level schema loads lazily; a bound component has it.
      const c = all.find((x: any) => { try { return String(x.getDataSourceId()) === id; } catch { return false; } });
      try { const cs = c && c.getSchema(); if (cs && cs.qe && cs.qe.concepts) { schema = cs; concepts = cs.qe.concepts; } } catch { /* ignore */ }
    }
    const fields = Object.entries(concepts).map(([key, f]: [string, any]) => ({
      id: String(f.name || key),
      qualifiedId: String(f.id || ''),
      name: String(f.displayName || f.name || key),
      type: f.type === 1 ? ('METRIC' as const) : ('DIMENSION' as const),
      dataType: dtNames[f.dataType] ?? String(f.dataType),
      defaultAggregation: f.defaultAggregation ?? null,
    }));
    if (!fields.length) warnings.push(`Origen ${id}: esquema vacio o aun no cargado.`);
    dataSources.push({
      dataSourceId: id,
      name: id,
      maxDimensions: schema && schema.qe ? schema.qe.maxDimensions ?? null : null,
      maxMetrics: schema && schema.qe ? schema.qe.maxMetrics ?? null : null,
      usedBy: usage[id] || [],
      fields,
    });
  }
  return { dataSources, source: 'internals', warnings };
}

// ---------------------------------------------------------------------------
// bindFieldsScript
// ---------------------------------------------------------------------------

export async function bindFieldsScript(args: BindFieldsArgs): Promise<BindFieldsResult> {
  const w = window as any;
  const warnings: string[] = [];
  const fail = (error: string): BindFieldsResult => ({ ok: false, componentId: args.componentId, dimensions: [], metrics: [], source: 'internals', warnings, error });
  let report: any;
  try {
    report = w.angular.element(document.body).injector().get('legoUndoRedoService').report;
  } catch {
    return fail('Internals no disponibles (legoUndoRedoService).');
  }
  const all = [...report.pages.flatMap((p: any) => p.components), ...report.components];
  const comp = all.find((c: any) => c.getId() === args.componentId);
  if (!comp) return fail(`Componente ${args.componentId} no encontrado.`);
  if (typeof comp.updateMetrics !== 'function') return fail(`El tipo "${comp.config.config.display.type}" no admite campos.`);

  const dsKeys = comp.config.config.datasource.keys;
  const dsId = (dsKeys.dataset && dsKeys.dataset.value && dsKeys.dataset.value.id) || report.config.config.datasource.keys.dataset.value.id;
  let concepts: any = {};
  try { concepts = (comp.getSchema && comp.getSchema()?.qe?.concepts) || {}; } catch { /* fall back */ }
  if (!Object.keys(concepts).length) {
    try { concepts = report.getDatasourceSchema(dsId).qe.concepts || {}; } catch { return fail(`No se pudo leer el esquema del origen ${dsId}.`); }
  }
  if (!Object.keys(concepts).length) return fail(`Esquema del origen ${dsId} vacio (aun no cargado).`);
  const list = Object.values(concepts) as any[];

  // dataTransformation.aggregation codes (verified 2026-11-03 against known values):
  // 0 NONE, 1 AVG, 2 COUNT, 3 COUNT_DISTINCT, 4 MAX, 5 MIN, 6 SUM.
  const AGG: Record<string, number> = { NONE: 0, AVG: 1, COUNT: 2, COUNT_DISTINCT: 3, MAX: 4, MIN: 5, SUM: 6 };
  // Accepts "unique_users", "t0.unique_users", the display name "Unique Users",
  // and for metrics an aggregation wrapper: "SUM(ingresos)", "AVG(valoracion)", "COUNT_DISTINCT(id_pedido)".
  const resolve = (ref: string, want: 0 | 1) => {
    let r = String(ref).trim();
    let agg: number | undefined;
    const m = r.match(/^([A-Za-z_]+)\((.+)\)$/);
    if (m && want === 1) {
      const code = AGG[m[1].toUpperCase()];
      if (code === undefined) { warnings.push(`Agregacion "${m[1]}" no soportada (usa ${Object.keys(AGG).join(', ')}).`); return null; }
      agg = code;
      r = m[2].trim();
    }
    const bare = r.replace(/^t\d+\./, '');
    const f = concepts[bare] || list.find((x) => x.id === r) || list.find((x) => String(x.displayName).toLowerCase() === r.toLowerCase());
    if (!f) { warnings.push(`Campo "${ref}" no existe en el origen ${dsId}.`); return null; }
    if (want === 0 && f.type === 1) warnings.push(`"${ref}" es METRICA pero se pidio como DIMENSION.`);
    if (want === 1 && agg === undefined && f.type !== 1) {
      // A dimension used as metric (typical in Sheets/CSV: every column is a dimension).
      // Without an explicit aggregation it would return raw rows (NONE).
      agg = f.dataType === 2 ? AGG.SUM : AGG.COUNT_DISTINCT;
      warnings.push(`"${ref}" es una dimension del origen; se usa como metrica con ${agg === AGG.SUM ? 'SUM' : 'COUNT_DISTINCT'}.`);
    }
    // Native metrics: no explicit aggregation unless asked. An aggregation different from the
    // source's default counts as "custom" and fails (reason 93) when the source forbids editing fields.
    return { f, agg };
  };
  const mkDef = ({ f, agg }: { f: any; agg?: number }) => {
    const qt = 'qt_' + Math.random().toString(36).slice(2, 12).padEnd(10, '0');
    const ns = String(f.namespace || 't0');
    const dataTransformation: Record<string, unknown> = { sourceFieldName: String(f.name) };
    if (agg !== undefined) dataTransformation.aggregation = agg;
    return { name: qt, id: `${ns}.${qt}`, namespace: ns, queryTimeTransformation: { dataTransformation, displayTransformation: {} } };
  };
  const dimFields = args.dimensions.map((d) => resolve(d, 0)).filter(Boolean) as { f: any; agg?: number }[];
  const metFields = args.metrics.map((m) => resolve(m, 1)).filter(Boolean) as { f: any; agg?: number }[];
  if (dimFields.length !== args.dimensions.length || metFields.length !== args.metrics.length) {
    return fail('Algunos campos no se pudieron resolver. Usa inspect_data_sources para ver los ids validos.');
  }

  const mode = args.mode ?? 'replace';
  const existing = (slot: 'dimensions' | 'metrics') => {
    const v = comp.getDataSourceKeyValue(slot);
    return v && v.primary ? (v.primary as string[]).map((n) => comp.config.conceptDefs[n]).filter(Boolean) : [];
  };
  if (args.dimensions.length) {
    const defs = dimFields.map(mkDef);
    comp.updateDimensions('primary', mode === 'append' ? [...existing('dimensions'), ...defs] : defs);
  }
  if (args.metrics.length) {
    const defs = metFields.map(mkDef);
    comp.updateMetrics('primary', mode === 'append' ? [...existing('metrics'), ...defs] : defs);
  }
  try { comp.syncState(true); } catch (e: any) { warnings.push('syncState fallo: ' + (e && e.message)); }
  // Persist: wrapperSaveService.save([comp]) -> POST updatePage with the full page
  // snapshot (verified 2026-11-03: bindings survive a reload in /edit).
  // updateMetrics/updateDimensions alone never trigger the autosave.
  try {
    w.angular.element(document.body).injector().get('wrapperSaveService').save([comp]);
  } catch (e: any) {
    warnings.push('wrapperSaveService.save fallo (' + (e && e.message) + '); se usa el empujon de atributos.');
    const l = Number(comp.config.attribute.left) || 0;
    comp.setAttributeValues({ left: l + 1 });
    comp.setAttributeValues({ left: l });
  }

  await new Promise((r) => setTimeout(r, 2500));
  let error: string | undefined;
  try {
    if (comp.hasError && comp.hasError()) {
      const e = (comp.getError && comp.getError()) || {};
      const detail = [e.title, e.description, e.errorTextInfo && e.errorTextInfo.errorDialogText].filter(Boolean).join(' | ').replace(/<[^>]+>/g, '');
      error = `El componente muestra un error tras vincular (categoria ${comp.getErrorCategory()}, reason ${e.reason ?? '?'}): ${detail || 'sin detalle'}. En view/preview el servidor rechaza consultas nuevas (PREFETCH_VALIDATION).`;
    }
  } catch { /* ignore */ }
  if (error) warnings.push(error);
  const names = (slot: 'dimensions' | 'metrics') => {
    const v = comp.getDataSourceKeyValue(slot);
    return v && v.primary ? (v.primary as string[]).map((n) => comp.config.conceptDefs[n]?.queryTimeTransformation?.dataTransformation?.sourceFieldName ?? n) : [];
  };
  return { ok: true, componentId: args.componentId, dimensions: names('dimensions'), metrics: names('metrics'), source: 'internals', warnings };
}

// ---------------------------------------------------------------------------
// diagnoseReportScript  (debugging / migration)
// ---------------------------------------------------------------------------

export function diagnoseReportScript(): DiagnoseResult {
  const w = window as any;
  const issues: DiagnoseResult['issues'] = [];
  let report: any;
  try {
    report = w.angular.element(document.body).injector().get('legoUndoRedoService').report;
  } catch {
    return { issues: [{ severity: 'error', componentId: null, pageId: null, code: 'NO_INTERNALS', message: 'Internals no disponibles; no se puede diagnosticar.' }], stats: null };
  }
  const rootDsId = report.config.config.datasource.keys.dataset?.value?.id;
  const schemaCache: Record<string, any> = {};
  const schemaOf = (id: string) => {
    if (!(id in schemaCache)) {
      let c: any = null;
      try { c = report.getDatasourceSchema(id)?.qe?.concepts || null; } catch { /* ignore */ }
      if (!c || !Object.keys(c).length) {
        const comp = [...report.pages.flatMap((p: any) => p.components), ...report.components].find((x: any) => { try { return String(x.getDataSourceId()) === id; } catch { return false; } });
        try { c = comp?.getSchema?.()?.qe?.concepts || c; } catch { /* ignore */ }
      }
      schemaCache[id] = c && Object.keys(c).length ? c : null;
    }
    return schemaCache[id];
  };
  const W = Number(report.config.attribute?.width) || 0;
  // Dominant grid: the largest of 10/8/4 that fits >= 80% of all coordinates.
  const coords: number[] = report.pages.flatMap((p: any) => p.components.flatMap((c: any) => {
    const at = c.config.attribute;
    return [at.left, at.top, at.width, at.height].map(Number);
  }));
  const grid = [10, 8, 4].find((g) => coords.length && coords.filter((v) => v % g === 0).length / coords.length >= 0.8) ?? 0;
  let totalComps = 0;
  const perPage: Record<string, number> = {};
  for (const page of report.pages) {
    const pid = String(page.getId());
    const hasFields = (c: any) => {
      const k = c.config.config.datasource?.keys;
      return !!k && ['dimensions', 'metrics'].some((s) => k[s]?.value && Object.values(k[s].value).flat().length > 0);
    };
    const dataComps = page.components.filter(hasFields);
    perPage[pid] = dataComps.length;
    totalComps += page.components.length;
    if (dataComps.length > 25) issues.push({ severity: 'warning', componentId: null, pageId: pid, code: 'TOO_MANY_CHARTS', message: `${dataComps.length} componentes con datos en la pagina: rendimiento degradado (recomendado <= 25).` });
    for (const c of page.components) {
      const id = c.getId();
      const type = c.config.config.display.type;
      const a = c.config.attribute;
      if (W && Number(a.left) + Number(a.width) > W) issues.push({ severity: 'warning', componentId: id, pageId: pid, code: 'OUT_OF_CANVAS', message: `${type} sobresale del lienzo (${a.left}+${a.width} > ${W}).` });
      if (grid && (Number(a.left) % grid || Number(a.top) % grid || Number(a.width) % grid || Number(a.height) % grid)) issues.push({ severity: 'info', componentId: id, pageId: pid, code: 'OFF_GRID', message: `${type} fuera de la reticula dominante de ${grid}px (x=${a.left}, y=${a.top}, w=${a.width}, h=${a.height}).` });
      try {
        if (c.hasError && c.hasError()) {
          const e = (c.getError && c.getError()) || {};
          const detail = [e.title, e.description, e.errorTextInfo && e.errorTextInfo.errorDialogText].filter(Boolean).join(' | ').replace(/<[^>]+>/g, '');
          issues.push({ severity: 'error', componentId: id, pageId: pid, code: 'COMPONENT_ERROR', message: `${type} en estado de error (categoria ${c.getErrorCategory()}, reason ${e.reason ?? '?'}): ${detail || 'sin detalle'}` });
        }
      } catch { /* ignore */ }
      const ds = c.config.config.datasource?.keys;
      if (!ds) continue;
      const dsId = ds.dataset?.value?.id || rootDsId;
      const concepts = dsId ? schemaOf(dsId) : null;
      const defs = c.config.conceptDefs || {};
      for (const slot of ['dimensions', 'metrics']) {
        const v = ds[slot]?.value;
        if (!v) continue;
        for (const n of Object.values(v).flat() as string[]) {
          const def = defs[n];
          const src = def?.queryTimeTransformation?.dataTransformation?.sourceFieldName;
          if (!def) issues.push({ severity: 'error', componentId: id, pageId: pid, code: 'MISSING_CONCEPT_DEF', message: `${slot} usa ${n} sin conceptDef.` });
          else if (src && concepts && !concepts[src] && !def.queryTimeTransformation?.dataTransformation?.formula) issues.push({ severity: 'error', componentId: id, pageId: pid, code: 'FIELD_NOT_IN_SCHEMA', message: `Campo "${src}" no existe en el origen ${dsId} (migracion o campo eliminado).` });
          const agg = def?.queryTimeTransformation?.dataTransformation?.aggregation;
          const dflt = src && concepts && concepts[src] ? concepts[src].defaultAggregation : undefined;
          if (def && agg !== undefined && dflt !== undefined && agg !== dflt) issues.push({ severity: 'warning', componentId: id, pageId: pid, code: 'CUSTOM_AGGREGATION', message: `${slot} "${concepts[src].displayName ?? src}" usa agregacion ${agg} distinta de la del origen (${dflt}). Si el origen no permite editar campos en informes, el grafico falla: revincula con bind_fields_to_component.` });
        }
      }
      if (ds.metrics && !(Object.values(ds.metrics.value || {}).flat().length) && ['kpi-metric', 'simple-table', 'simple-barchart', 'simple-linechart', 'simple-piechart'].includes(type)) {
        issues.push({ severity: 'error', componentId: id, pageId: pid, code: 'NO_METRICS', message: `${type} sin metricas: "Configuracion de grafico no valida".` });
      }
    }
  }
  const el = Array.from(document.querySelectorAll<HTMLElement>('div.lego-component-repeat'));
  for (const e of el) {
    const t = e.innerText || '';
    const m = t.match(/Error del sistema|Configuraci[oó]n de gr[aá]fico no v[aá]lida|Error de configuraci[oó]n de datos|Error de configuraci[oó]n del usuario|Sin acceso al conjunto de datos|System error|Invalid chart configuration|Data set configuration error|No hay datos|No data/i);
    if (m) issues.push({ severity: /No hay datos|No data/i.test(m[0]) ? 'info' : 'error', componentId: e.getAttribute('data-mcp-id'), pageId: null, code: 'UI_MESSAGE', message: `Mensaje visible en el canvas: "${m[0]}".` });
  }
  return { issues, stats: { pages: report.pages.length, components: totalComps, reportLevelComponents: report.components.length, dataComponentsPerPage: perPage, canvasWidth: W, grid } };
}

// ---------------------------------------------------------------------------
// readComponentConfigScript  (raw config dump for debugging / migration)
// ---------------------------------------------------------------------------

export function readComponentConfigScript(componentId: string): { ok: boolean; config?: unknown; error?: string } {
  const w = window as any;
  try {
    const report = w.angular.element(document.body).injector().get('legoUndoRedoService').report;
    const all = [...report.pages.flatMap((p: any) => p.components), ...report.components];
    const c = all.find((x: any) => x.getId() === componentId);
    if (!c) return { ok: false, error: `Componente ${componentId} no encontrado.` };
    return { ok: true, config: JSON.parse(JSON.stringify(c.config)) };
  } catch (e: any) {
    return { ok: false, error: String(e && e.message) };
  }
}
