// Prints the server's error body for rejected saves while synthesizing a type.
// Only the response of updatePage (an error JSON) is read; request headers/bodies are never touched.
// Usage: node tools/probe-save-error.mjs <type>
import puppeteer from 'puppeteer-core';
import { synthesizeTemplates } from '../dist/ops3.js';
import { disconnectIfConnected, getReportPage } from '../dist/browser.js';

const type = process.argv[2] ?? 'bulletchart';
const page = await getReportPage();
const bodies = [];
page.on('response', async (r) => {
  if (/updatePage/.test(r.url()) && r.status() >= 400) {
    try { bodies.push((await r.text()).replace(/^\)\]\}'\n?/, '').slice(0, 800)); } catch { /* ignore */ }
  }
});
const res = await synthesizeTemplates([type]);
console.log(JSON.stringify(res.results));
console.log([...new Set(bodies)].join('\n---\n'));
await disconnectIfConnected();
void puppeteer;
