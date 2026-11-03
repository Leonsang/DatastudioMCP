// Builds dist/mcp-bundle.js: every page-injected script from dist/looker/scripts.js
// exposed as window.__mcp.<name>. Useful to run the exact MCP logic from the
// browser console, a bookmarklet or an extension when CDP is not available.
//   node tools/build-bundle.mjs   (after npm run build)
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const load = (f) => import(new URL('file:///' + join(root, 'dist', 'looker', f).replace(/\\/g, '/')).href);
const scripts = { ...(await load('scripts.js')), ...(await load('scripts2.js')) };
const entries = Object.entries(scripts).filter(([, v]) => typeof v === 'function');
const body =
  '/* looker-studio-mcp page bundle (generated) */\n' +
  'window.__mcp = {\n' +
  entries.map(([name, fn]) => `  ${name}: (${fn.toString()})`).join(',\n') +
  '\n};\n';
const out = join(root, 'dist', 'mcp-bundle.js');
writeFileSync(out, body);
console.log(`${out}: ${entries.length} scripts, ${body.length} bytes`);
