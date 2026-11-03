// Probe why a learned template is rejected (updatePage 400) in the target report.
// Usage: node tools/probe-template.mjs <type> [variant...]
// Variants: asis | switch | scrub | minimal  (each runs on a fresh reload)
import { readFileSync } from 'node:fs';
import puppeteer from 'puppeteer-core';

const [type = 'simple-linechart', ...variants] = process.argv.slice(2);
const tpl = JSON.parse(readFileSync(new URL(`../knowledge/templates/${type}.json`, import.meta.url))).config;
const b = await puppeteer.connect({ browserURL: process.env.LS_CDP_URL ?? 'http://127.0.0.1:9222', defaultViewport: null });
const page = (await b.pages()).find((p) => /\/reporting\/.+\/edit/.test(p.url()));
if (!page) throw new Error('Abre el informe destino en /edit');
await page.bringToFront();
const statuses = [];
page.on('response', (r) => { if (/updatePage/.test(r.url())) statuses.push(r.status()); });

const ready = async () => {
  for (let i = 0; i < 90; i++) {
    const ok = await page.evaluate(() => { try { return angular.element(document.body).injector().get('legoUndoRedoService').report.pages.length > 0; } catch { return false; } }).catch(() => false);
    if (ok) return;
    await new Promise((r) => setTimeout(r, 500));
  }
};

for (const v of variants.length ? variants : ['asis', 'switch', 'scrub', 'minimal']) {
  await page.reload({ waitUntil: 'networkidle2' });
  await ready();
  statuses.length = 0;
  const res = await page.evaluate((tpl, v) => {
    const inj = angular.element(document.body).injector();
    const report = inj.get('legoUndoRedoService').report;
    const p = report.pages[0];
    const minter = p.components[0];
    const cfg = JSON.parse(JSON.stringify(tpl));
    cfg.id = minter.duplicateConfig().id;
    if (cfg.attribute) delete cfg.attribute.alias;
    Object.assign(cfg.attribute, { left: 20, top: 600, width: 400, height: 200 });
    const ourDs = minter.getDataSourceId();
    const keys = cfg.config.datasource.keys;
    const info = { srcDs: keys.dataset?.value?.id, keys: Object.keys(keys), behavior: !!cfg.behavior, attrKeys: Object.keys(cfg.attribute) };
    if (v !== 'asis') keys.dataset = { stateKey: 'ds', dominant: 2, value: { id: ourDs } };
    if (v === 'scrub' || v === 'minimal') {
      const scrub = (x) => typeof x === 'string' ? (x.startsWith('qt_') ? undefined : x) : Array.isArray(x) ? x.map(scrub).filter((y) => y !== undefined) : x && typeof x === 'object' ? Object.fromEntries(Object.entries(x).map(([k, y]) => [k, scrub(y)]).filter(([, y]) => y !== undefined)) : x;
      for (const k of Object.keys(keys)) if (k !== 'dataset' && keys[k] && 'value' in keys[k]) { const s = scrub(keys[k].value); if (s === undefined) delete keys[k].value; else keys[k].value = s; }
      cfg.conceptDefs = {};
    }
    if (v === 'minimal') {
      // keep only dataset + dims/metrics slots, drop everything else
      for (const k of Object.keys(keys)) if (!['dataset', 'dimensions', 'metrics'].includes(k)) delete keys[k];
      delete cfg.behavior;
    }
    const c = p.addComponent(cfg);
    inj.get('wrapperSaveService').save([c]);
    window.__probeId = c.getId();
    return info;
  }, tpl, v);
  await new Promise((r) => setTimeout(r, 3500));
  console.log(JSON.stringify({ variant: v, statuses: [...statuses], ...res }));
  // Clean up: the probe must not leave components behind when the save succeeded.
  if (statuses.includes(200)) {
    await page.evaluate(() => {
      const inj = angular.element(document.body).injector();
      const p = inj.get('legoUndoRedoService').report.pages[0];
      const c = p.components.find((x) => x.getId() === window.__probeId);
      if (c) { p.removeComponent(c); inj.get('wrapperSaveService').save([p]); }
    });
    await new Promise((r) => setTimeout(r, 2500));
  }
}
await page.reload({ waitUntil: 'networkidle2' });
await b.disconnect();
