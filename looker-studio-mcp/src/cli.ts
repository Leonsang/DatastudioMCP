#!/usr/bin/env node
/**
 * ls-studio: CLI for Looker Studio / Data Studio over CDP (no screenshots, no clicks).
 * Same engine as the MCP server. JSON on stdout, logs on stderr.
 */
import { disconnectIfConnected } from './browser.js';
import { learn, listTemplates, readLearnings, summary } from './knowledge.js';
import { attachToReport } from './looker/report.js';
import { getReportLayout } from './looker/layout.js';
import { setComponentBoxModel } from './looker/boxModel.js';
import { bindFieldsToComponent, inspectDataSources } from './looker/data.js';
import { getComponentConfig } from './looker/diagnose.js';
import {
  applySpec,
  captureTemplates,
  createComponent,
  deleteComponent,
  diagnoseWithKnowledge,
  exportReport,
  lintSpec,
  loadSpec,
  openReport,
  patchComponent,
  reloadReport,
} from './ops.js';

const HELP = `ls-studio <comando> [opciones]

Conexion (navegador con --remote-debugging-port; LS_CDP_URL, por defecto http://127.0.0.1:9222)
  open <url>                       Abre el informe (usa /edit para modificar) y espera al editor
  attach                           Informe activo: id, pagina, modo, lienzo
  reload                           Recarga (pinta componentes creados por API)

Lectura
  layout [--page <id>]             Componentes de la pagina con caja, estilo y campos
  sources                          Origenes de datos y campos
  config <componentId>             JSON interno de un componente
  diagnose                         Problemas + soluciones conocidas (aprende reason codes)
  export [-o informe.json]         Informe completo a JSON (aprende tipos y plantillas)

Escritura (modo /edit)
  box <id> [--x N --y N] [--w N --h N] [--padding N]
  bind <id> [--dims a,b] [--metrics "SUM(x),AVG(y)"] [--append]
  create --type <tipo> --box x,y,w,h [--page <id>] [--dataset <id|@campo>]
         [--dims a,b] [--metrics m1,m2] [--padding N]
  delete <id>
  patch <id> [--date-days N] [--strip-styles]   Periodo por defecto de un control / quitar estilos de tema

Informe como codigo
  lint <spec.json>                 Valida contra las skills (reticula, lienzo, KPIs, densidad)
  apply <spec.json> [--dry-run]    Crea/actualiza (idempotente via <spec>.state.json)

Aprendizaje (knowledge/)
  templates capture                Guarda una plantilla por tipo del informe abierto
  templates list
  learnings [--raw]                Resumen (o eventos) de lo aprendido
  learn <clave> <texto...>         Anade una nota o solucion (clave reason:93, CODIGO o tema)
`;

function parse(argv: string[]): { cmd: string; pos: string[]; flags: Record<string, string | true> } {
  const [cmd = 'help', ...rest] = argv;
  const pos: string[] = [];
  const flags: Record<string, string | true> = {};
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i]!;
    if (a.startsWith('--') || (a.startsWith('-') && a.length === 2)) {
      const k = a.replace(/^-+/, '');
      const v = rest[i + 1];
      if (v !== undefined && !v.startsWith('-')) {
        flags[k] = v;
        i++;
      } else flags[k] = true;
    } else pos.push(a);
  }
  return { cmd, pos, flags };
}

const list = (v: string | true | undefined): string[] =>
  typeof v === 'string' ? v.split(/,(?![^(]*\))/).map((s) => s.trim()).filter(Boolean) : [];
const num = (v: string | true | undefined): number | undefined => (typeof v === 'string' && v !== '' ? Number(v) : undefined);
const need = (v: string | undefined, what: string): string => {
  if (!v) throw new Error(`Falta ${what}.\n\n${HELP}`);
  return v;
};

async function main(): Promise<unknown> {
  const { cmd, pos, flags } = parse(process.argv.slice(2));
  switch (cmd) {
    case 'help':
    case '--help':
    case '-h':
      process.stdout.write(HELP);
      return undefined;
    case 'open':
      return openReport(need(pos[0], 'la URL del informe'));
    case 'attach':
      return attachToReport();
    case 'reload':
      return reloadReport();
    case 'layout':
      return getReportLayout(typeof flags.page === 'string' ? flags.page : undefined);
    case 'sources':
      return inspectDataSources();
    case 'config':
      return getComponentConfig(need(pos[0], 'componentId'));
    case 'diagnose':
      return diagnoseWithKnowledge();
    case 'export': {
      const file = typeof flags.o === 'string' ? flags.o : typeof flags.out === 'string' ? flags.out : undefined;
      const r = await exportReport(file);
      return file ? { file, pages: r.pages.length, types: r.types, learnedTemplates: r.learnedTemplates } : r;
    }
    case 'box': {
      const id = need(pos[0], 'componentId');
      const x = num(flags.x), y = num(flags.y), w = num(flags.w), h = num(flags.h), p = num(flags.padding);
      return setComponentBoxModel({
        componentId: id,
        ...(x !== undefined && y !== undefined ? { position: { x, y } } : {}),
        ...(w !== undefined && h !== undefined ? { dimensions: { width: w, height: h } } : {}),
        ...(p !== undefined ? { padding: p } : {}),
      });
    }
    case 'bind':
      return bindFieldsToComponent({
        componentId: need(pos[0], 'componentId'),
        dimensions: list(flags.dims),
        metrics: list(flags.metrics),
        mode: flags.append ? 'append' : 'replace',
      });
    case 'create': {
      const box = list(flags.box).map(Number);
      if (box.length !== 4 || box.some((v) => Number.isNaN(v))) throw new Error('--box x,y,w,h');
      const padding = num(flags.padding);
      return createComponent({
        type: need(typeof flags.type === 'string' ? flags.type : undefined, '--type'),
        box: { x: box[0]!, y: box[1]!, width: box[2]!, height: box[3]! },
        ...(typeof flags.page === 'string' ? { pageId: flags.page } : {}),
        ...(typeof flags.dataset === 'string' ? { dataset: flags.dataset } : {}),
        dimensions: list(flags.dims),
        metrics: list(flags.metrics),
        ...(padding !== undefined ? { padding } : {}),
      });
    }
    case 'patch': {
      const days = num(flags['date-days']);
      return patchComponent({
        componentId: need(pos[0], 'componentId'),
        ...(days !== undefined ? { dateRangeDays: days } : {}),
        ...(flags['strip-styles'] ? { stripThemeStyles: true } : {}),
      });
    }
    case 'delete':
      return deleteComponent(need(pos[0], 'componentId'));
    case 'lint':
      return lintSpec(loadSpec(need(pos[0], 'spec.json')));
    case 'apply':
      return applySpec(need(pos[0], 'spec.json'), { dryRun: !!flags['dry-run'] });
    case 'templates':
      if (pos[0] === 'capture') return captureTemplates();
      return listTemplates();
    case 'learnings':
      return flags.raw ? readLearnings() : summary();
    case 'learn': {
      const key = need(pos[0], 'la clave');
      const text = pos.slice(1).join(' ');
      const kind = /^reason:\d+$/.test(key) || /^[A-Z_]+$/.test(key) ? 'fix' : 'note';
      learn(kind, key, kind === 'fix' ? { fix: text, source: 'user' } : { text });
      return { recorded: kind, key };
    }
    default:
      throw new Error(`Comando desconocido "${cmd}".\n\n${HELP}`);
  }
}

main()
  .then(async (out) => {
    if (out !== undefined) process.stdout.write(JSON.stringify(out, null, 2) + '\n');
    await closeQuietly();
  })
  .catch(async (err) => {
    process.stderr.write(`Error: ${err instanceof Error ? err.message : String(err)}\n`);
    await closeQuietly();
    process.exit(1);
  });

/** Detach from the browser without closing it (it is the user's browser). */
async function closeQuietly(): Promise<void> {
  try {
    await disconnectIfConnected();
  } catch {
    /* ignore */
  }
}
