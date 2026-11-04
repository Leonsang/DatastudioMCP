// Step-by-step bind on a fresh component created from a template, logging progress into
// window.__steps so it can be read even if the page freezes. Cleans up (reload discards unsaved).
// Usage: node tools/probe-bind-steps.mjs <type> <@field> <metric>
import { createComponentScript } from '../dist/looker/scripts2.js';
import { evaluateOn, getReportPage, disconnectIfConnected } from '../dist/browser.js';
import { resolveDataset } from '../dist/ops.js';
import { getTemplate } from '../dist/knowledge.js';

const [type = 'gauge-viz', ds = '@sesiones', metric = 'rebote_pct'] = process.argv.slice(2);
const page = await getReportPage();
const datasetId = await resolveDataset(page, ds);
const c = await evaluateOn(page, 15000, createComponentScript, { type, box: { x: 20, y: 20, width: 300, height: 200 }, datasetId, template: getTemplate(type), deferSave: true });
console.log('created', c.componentId, c.source);
const run = page.evaluate((id, metric) => {
  const w = window;
  w.__steps = [];
  const step = (s) => w.__steps.push(`${Date.now() % 100000} ${s}`);
  const rep = w.angular.element(document.body).injector().get('legoUndoRedoService').report;
  const comp = rep.pages.flatMap((p) => p.components).find((x) => x.getId() === id);
  step('found ' + !!comp);
  const concepts = comp.getSchema().qe.concepts;
  step('schema ' + Object.keys(concepts).length);
  const f = Object.values(concepts).find((x) => x.displayName === metric);
  const qt = 'qt_probe' + Math.random().toString(36).slice(2, 8);
  const def = { name: qt, id: 't0.' + qt, namespace: 't0', queryTimeTransformation: { dataTransformation: { sourceFieldName: f.name, aggregation: 1 }, displayTransformation: {} } };
  step('before updateMetrics; metrics=' + JSON.stringify(comp.getDataSourceKeyValue('metrics')) + ' dims=' + JSON.stringify(comp.getDataSourceKeyValue('dimensions')));
  comp.updateMetrics('primary', [def]);
  step('after updateMetrics');
  comp.syncState(true);
  step('after syncState');
  w.angular.element(document.body).injector().get('wrapperSaveService').save([comp]);
  step('save called');
  return w.__steps;
}, c.componentId, metric);
const statuses = [];
page.on('response', (r) => { if (/updatePage/.test(r.url())) statuses.push(r.status()); });
const res = await Promise.race([run, new Promise((r) => setTimeout(() => r('TIMEOUT'), 15000))]);
await new Promise((r) => setTimeout(r, 3500));
console.log(JSON.stringify(res, null, 1), 'save statuses', statuses);
const full = await evaluateOn(page, 30000, (await import('../dist/looker/scripts.js')).bindFieldsScript, { componentId: c.componentId, dimensions: [], metrics: ['AVG(' + metric + ')'], clearDimensions: true }).catch((e) => 'ERR ' + e.message);
await new Promise((r) => setTimeout(r, 3000));
console.log('full bind:', JSON.stringify(full).slice(0, 400), 'statuses', statuses);
if (res === 'TIMEOUT') {
  const list = await (await fetch('http://127.0.0.1:9222/json/list')).json();
  console.log('page frozen; raw targets:', list.filter((t) => t.type === 'page').length);
}
await page.reload({ waitUntil: 'networkidle2' }).catch(() => {});
await disconnectIfConnected();
