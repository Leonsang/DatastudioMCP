// Bisect a rejected create: template + dataset switch, with/without binding.
// Usage: node tools/probe-create.mjs <type> <@field|datasetId> [metric...]
// Cleans up whatever it creates.
import { createComponent, deleteComponent, reloadReport } from '../dist/ops.js';
import { getReportPage, disconnectIfConnected } from '../dist/browser.js';
import { fieldConfigsScript } from '../dist/looker/scripts3.js';
import { evaluateOn } from '../dist/browser.js';

const [type = 'gauge-viz', dataset = '@sesiones', ...metrics] = process.argv.slice(2);
const page = await getReportPage();
console.log('fieldConfigs', JSON.stringify(await evaluateOn(page, 10000, fieldConfigsScript, type)));
for (const variant of [{ label: 'switch-only', metrics: [] }, { label: 'switch+bind', metrics }]) {
  try {
    const r = await createComponent({ type, box: { x: 20, y: 20, width: 300, height: 200 }, dataset, metrics: variant.metrics });
    console.log(variant.label, 'OK', r.componentId, r.warnings);
    await deleteComponent(r.componentId);
  } catch (e) {
    console.log(variant.label, 'FAIL', e.message.slice(0, 160));
    const list = await (await fetch('http://127.0.0.1:9222/json/list')).json();
    const t = list.find((x) => x.type === 'page' && /\/reporting\//.test(x.url));
    const ws = new WebSocket(t.webSocketDebuggerUrl);
    await new Promise((r) => ws.addEventListener('open', r));
    const out = await Promise.race([
      new Promise((res) => { ws.addEventListener('message', (ev) => res(JSON.parse(ev.data))); ws.send(JSON.stringify({ id: 1, method: 'Runtime.evaluate', params: { expression: 'JSON.stringify(window.__mcpTrace||null)', returnByValue: true } })); }),
      new Promise((r) => setTimeout(() => r('raw CDP timeout: page frozen'), 5000)),
    ]);
    console.log('trace:', typeof out === 'string' ? out : out.result?.result?.value);
    ws.close();
    await reloadReport();
  }
}
await disconnectIfConnected();
