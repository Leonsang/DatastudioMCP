#!/usr/bin/env node
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { log } from './log.js';
import { attachToReport } from './looker/report.js';
import { getReportLayout } from './looker/layout.js';
import { setComponentBoxModel } from './looker/boxModel.js';
import { bindFieldsToComponent, inspectDataSources } from './looker/data.js';
import { getComponentConfig } from './looker/diagnose.js';
import { registerSkills } from './skills.js';
import { learn, listTemplates, readLearnings, summary } from './knowledge.js';
import {
  applySpec,
  captureTemplates,
  createComponent,
  deleteComponent,
  diagnoseWithKnowledge,
  exportReport,
  lintSpec,
  openReport,
  reloadReport,
} from './ops.js';
import { loadSpec, type ReportSpec } from './spec.js';

const server = new McpServer(
  { name: 'looker-studio-mcp', version: '0.2.0' },
  {
    instructions:
      'Controla un informe de Looker Studio abierto en Chrome/Edge con --remote-debugging-port. ' +
      'Empieza siempre con attach_to_report. Las herramientas que modifican el informe requieren modo edicion. ' +
      'Para crear, migrar o depurar informes usa los prompts skill_* (buenas practicas) y diagnose_report. ' +
      'Para construir informes como codigo: export_report, lint_report_spec, apply_report_spec, create_component. ' +
      'Lo que se descubre (errores, plantillas, fallos) se guarda en knowledge/: consulta get_learnings y registra hallazgos con record_learning.',
  },
);

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

function ok(data: unknown): CallToolResult {
  return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
}

function fail(err: unknown): CallToolResult {
  const message = err instanceof Error ? err.message : String(err);
  log('Error:', message);
  return { isError: true, content: [{ type: 'text', text: message }] };
}

async function run(fn: () => Promise<unknown>): Promise<CallToolResult> {
  try {
    return ok(await fn());
  } catch (err) {
    return fail(err);
  }
}

// ---------------------------------------------------------------------------
// schemas
// ---------------------------------------------------------------------------

const px = z.number().finite().min(0).describe('Pixeles del informe (sin zoom)');
const coord = z.number().finite().describe('Pixeles del informe (sin zoom), relativos al lienzo');

const PaddingSchema = z.union([
  px.describe('Mismo padding en los cuatro lados'),
  z
    .object({ top: px, right: px, bottom: px, left: px })
    .strict()
    .describe('Padding por lado'),
]);

const BoxModelInput = z
  .object({
    componentId: z.string().min(1).describe('Id del componente tal como lo devuelve get_report_layout'),
    padding: PaddingSchema.optional().describe('Padding interno: numero o {top,right,bottom,left}'),
    dimensions: z
      .object({ width: px.positive(), height: px.positive() })
      .strict()
      .optional()
      .describe('Nuevo tamano del componente'),
    position: z.object({ x: coord, y: coord }).strict().optional().describe('Nueva posicion (esquina superior izquierda)'),
  })
  .strict()
  .refine((v) => v.padding !== undefined || v.dimensions !== undefined || v.position !== undefined, {
    message: 'Indica al menos uno de: padding, dimensions, position.',
  });

// ---------------------------------------------------------------------------
// tools
// ---------------------------------------------------------------------------

server.registerTool(
  'attach_to_report',
  {
    title: 'Conectar al informe',
    description:
      'Se conecta por CDP al navegador (LS_CDP_URL, por defecto http://127.0.0.1:9222, o LS_CDP_WS) y localiza la ' +
      'pestana con el informe de Looker Studio (lookerstudio.google.com o datastudio.google.com). Devuelve ' +
      '{reportId, pageId, title, url, mode: edit|view|preview, canvas:{width,height,zoom}}. Llamala primero.',
    inputSchema: {},
    annotations: { readOnlyHint: true, openWorldHint: true },
  },
  async () => run(() => attachToReport()),
);

server.registerTool(
  'get_report_layout',
  {
    title: 'Leer layout de la pagina',
    description:
      'Lista los componentes de una pagina del informe con su caja y estilo: ' +
      '[{id, type, x, y, width, height, style:{padding:{top,right,bottom,left}, backgroundColor, borderColor, borderWidth, borderRadius}}], ' +
      'mas el tamano del lienzo. Coordenadas en pixeles del informe (sin zoom), relativas al lienzo. ' +
      'Si se indica pageId distinto de la pagina visible, navega a esa pagina.',
    inputSchema: {
      pageId: z.string().min(1).optional().describe('Id de pagina (segmento /page/<id> de la URL). Por defecto, la visible.'),
    },
    annotations: { readOnlyHint: true, openWorldHint: true },
  },
  async ({ pageId }) => run(() => getReportLayout(pageId)),
);

server.registerTool(
  'set_component_box_model',
  {
    title: 'Ajustar caja de un componente',
    description:
      'Cambia padding, tamano y/o posicion de UN componente. Requiere que el informe este en modo edicion (URL /edit). ' +
      'Hay que indicar al menos uno de padding, dimensions o position. Devuelve el estado antes/despues.',
    inputSchema: BoxModelInput,
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true },
  },
  async (args) => run(() => setComponentBoxModel(args)),
);

server.registerTool(
  'inspect_data_sources',
  {
    title: 'Inspeccionar fuentes de datos',
    description:
      'Lista las fuentes de datos del informe y sus campos: ' +
      '[{dataSourceId, name, fields:[{id, name, type: DIMENSION|METRIC, dataType}]}]. ' +
      'Usa los ids de campo con bind_fields_to_component.',
    inputSchema: {},
    annotations: { readOnlyHint: true, openWorldHint: true },
  },
  async () => run(() => inspectDataSources()),
);

server.registerTool(
  'bind_fields_to_component',
  {
    title: 'Vincular campos a un componente',
    description:
      'Asigna dimensiones y metricas a un componente (grafico, tabla, scorecard). Acepta el id de campo del origen ' +
      '("unique_users"), el id con namespace ("t0.unique_users") o el nombre visible ("Unique Users"). ' +
      'Crea internamente los conceptos qt_ por componente. mode=replace (defecto) sustituye el slot primario; ' +
      'mode=append anade. Una lista vacia deja ese slot sin cambios. Requiere modo edicion.',
    inputSchema: {
      componentId: z.string().min(1).describe('Id del componente (cd-..., de get_report_layout)'),
      dimensions: z.array(z.string().min(1)).describe('Campos dimension, en orden ([] = no tocar)'),
      metrics: z.array(z.string().min(1)).describe('Campos metrica, en orden ([] = no tocar). Admite agregacion: "SUM(ingresos)", "AVG(valoracion)", "COUNT_DISTINCT(id_pedido)", COUNT, MAX, MIN, NONE. Si el campo es una dimension del origen (Sheets/CSV) y no se indica, usa SUM para numeros y COUNT_DISTINCT para texto.'),
      mode: z.enum(['replace', 'append']).optional().describe('replace (defecto) o append'),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true },
  },
  async (args) => run(() => bindFieldsToComponent(args)),
);

server.registerTool(
  'diagnose_report',
  {
    title: 'Diagnosticar informe',
    description:
      'Recorre todas las paginas y devuelve problemas detectados: componentes en error, campos que no existen en el ' +
      'esquema del origen (tipico tras migraciones UA->GA4 o cambios de origen), conceptos qt_ huerfanos, graficos sin ' +
      'metricas, componentes fuera del lienzo o de la reticula, paginas con demasiados graficos y mensajes de error ' +
      'visibles en el canvas. Solo lectura; funciona tambien en modo vista.',
    inputSchema: {},
    annotations: { readOnlyHint: true, openWorldHint: true },
  },
  async () => run(() => diagnoseWithKnowledge()),
);

server.registerTool(
  'get_component_config',
  {
    title: 'Volcar configuracion de un componente',
    description:
      'Devuelve el JSON interno completo de un componente (attribute, config.display.keys, config.datasource.keys, ' +
      'conceptDefs). Util para depurar, comparar antes/despues o planificar una migracion. Solo lectura.',
    inputSchema: { componentId: z.string().min(1).describe('Id del componente (cd-...)') },
    annotations: { readOnlyHint: true, openWorldHint: true },
  },
  async ({ componentId }) => run(() => getComponentConfig(componentId)),
);

// ---------------------------------------------------------------------------
// tools v2: report as code + learning (additive)
// ---------------------------------------------------------------------------

const BoxSchema = z.object({ x: coord, y: coord, width: px.positive(), height: px.positive() }).strict();

server.registerTool(
  'open_report',
  {
    title: 'Abrir informe',
    description: 'Navega la pestana del informe (o una nueva) a la URL indicada y espera a que cargue el editor. Usa /edit para poder modificar.',
    inputSchema: { url: z.string().url().describe('URL del informe (.../reporting/<id>/page/<id>/edit)') },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
  },
  async ({ url }) => run(() => openReport(url)),
);

server.registerTool(
  'reload_report',
  {
    title: 'Recargar informe',
    description: 'Recarga la pestana: pinta los componentes creados por API y descarta estado local invalido.',
    inputSchema: {},
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true },
  },
  async () => run(() => reloadReport()),
);

server.registerTool(
  'export_report',
  {
    title: 'Exportar informe a JSON',
    description:
      'Devuelve el informe completo como JSON (paginas, configuracion de cada componente, origenes y campos). ' +
      'Si se indica file, lo escribe en disco y devuelve un resumen. Aprende los tipos y captura plantillas nuevas.',
    inputSchema: { file: z.string().optional().describe('Ruta de salida (opcional)') },
    annotations: { readOnlyHint: true, openWorldHint: true },
  },
  async ({ file }) =>
    run(async () => {
      const r = await exportReport(file);
      return file ? { file, pages: r.pages.length, types: r.types, learnedTemplates: r.learnedTemplates } : r;
    }),
);

server.registerTool(
  'capture_templates',
  {
    title: 'Capturar plantillas de componentes',
    description:
      'Guarda en knowledge/templates una plantilla por cada tipo de componente del informe abierto (funciona en view/preview). ' +
      'create_component las usa para crear tipos que no existen en el informe destino.',
    inputSchema: {},
    annotations: { readOnlyHint: true, openWorldHint: true },
  },
  async () => run(() => captureTemplates()),
);

server.registerTool(
  'list_templates',
  {
    title: 'Listar plantillas aprendidas',
    description: 'Tipos de componente con plantilla disponible en knowledge/templates.',
    inputSchema: {},
    annotations: { readOnlyHint: true },
  },
  async () => run(async () => listTemplates()),
);

server.registerTool(
  'create_component',
  {
    title: 'Crear componente',
    description:
      'Crea un componente (grafico, tabla, scorecard, control...) en modo edicion clonando uno del mismo tipo del informe o ' +
      'usando una plantilla aprendida. Opcionalmente cambia el origen (dataset: id o "@campo") y vincula campos ' +
      '(misma sintaxis que bind_fields_to_component). Detecta guardados rechazados y lo registra. Tras crear varios, usa reload_report para verlos.',
    inputSchema: {
      type: z.string().min(1).describe('Tipo interno: kpi-metric, simple-table, simple-linechart, simple-piechart, simple-geomap, google-map, pivot-table, simple-treemap, simple-scatterchart, bulletchart, gauge-viz, simple-sankey, simple-funnel, simple-daterangepicker, dimension-filter, ...'),
      box: BoxSchema,
      pageId: z.string().optional(),
      dataset: z.string().optional().describe('Id de origen o "@campo" (el origen que contiene ese campo)'),
      dimensions: z.array(z.string()).optional(),
      metrics: z.array(z.string()).optional(),
      padding: z.number().min(0).optional(),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
  },
  async (args) =>
    run(() =>
      createComponent({
        type: args.type,
        box: args.box,
        ...(args.pageId ? { pageId: args.pageId } : {}),
        ...(args.dataset ? { dataset: args.dataset } : {}),
        ...(args.dimensions ? { dimensions: args.dimensions } : {}),
        ...(args.metrics ? { metrics: args.metrics } : {}),
        ...(args.padding !== undefined ? { padding: args.padding } : {}),
      }),
    ),
);

server.registerTool(
  'delete_component',
  {
    title: 'Borrar componente',
    description: 'Borra un componente del informe (modo edicion). Confirma con el usuario antes de usarlo.',
    inputSchema: { componentId: z.string().min(1) },
    annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: true },
  },
  async ({ componentId }) => run(() => deleteComponent(componentId)),
);

const SpecInput = {
  spec: z.union([z.string(), z.record(z.string(), z.unknown())]).describe('Ruta a spec.json o el objeto spec'),
};
const toSpec = (spec: string | Record<string, unknown>): string | ReportSpec =>
  typeof spec === 'string' ? spec : (spec as unknown as ReportSpec);

server.registerTool(
  'lint_report_spec',
  {
    title: 'Validar spec de informe',
    description: 'Valida un spec contra las skills (reticula, lienzo, solapes, filas de KPIs, densidad por pagina) sin tocar el informe.',
    inputSchema: SpecInput,
    annotations: { readOnlyHint: true },
  },
  async ({ spec }) => run(async () => lintSpec(typeof spec === 'string' ? loadSpec(spec) : (spec as unknown as ReportSpec))),
);

server.registerTool(
  'apply_report_spec',
  {
    title: 'Aplicar spec de informe',
    description:
      'Crea o actualiza componentes segun el spec (idempotente: recuerda clave->componente en <spec>.state.json). ' +
      'No aplica si el lint tiene errores. dryRun=true solo muestra el plan. Al final recarga y diagnostica.',
    inputSchema: { ...SpecInput, dryRun: z.boolean().optional() },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true },
  },
  async ({ spec, dryRun }) => run(() => applySpec(toSpec(spec), { dryRun: !!dryRun })),
);

server.registerTool(
  'get_learnings',
  {
    title: 'Consultar lo aprendido',
    description: 'Resumen de knowledge/: reason codes vistos, soluciones conocidas, plantillas, resultados de creacion, metodos que faltan y notas.',
    inputSchema: { raw: z.boolean().optional().describe('true = eventos crudos') },
    annotations: { readOnlyHint: true },
  },
  async ({ raw }) => run(async () => (raw ? readLearnings() : summary())),
);

server.registerTool(
  'record_learning',
  {
    title: 'Registrar aprendizaje',
    description:
      'Guarda un hallazgo para futuras sesiones: una solucion (kind=fix, key "reason:93" o un codigo de issue) o una nota. ' +
      'Nunca incluyas tokens, cookies ni datos personales.',
    inputSchema: {
      kind: z.enum(['fix', 'note']),
      key: z.string().min(1),
      text: z.string().min(1),
    },
    annotations: { readOnlyHint: false, destructiveHint: false },
  },
  async ({ kind, key, text }) =>
    run(async () => ({ recorded: learn(kind, key, kind === 'fix' ? { fix: text, source: 'model' } : { text }) })),
);

server.registerResource(
  'knowledge',
  'knowledge://summary',
  { title: 'Conocimiento aprendido', description: 'Resumen de knowledge/ (se actualiza en cada uso)', mimeType: 'application/json' },
  async (uri) => ({ contents: [{ uri: uri.href, mimeType: 'application/json', text: JSON.stringify(summary(), null, 2) }] }),
);

server.registerPrompt(
  'skill_report_as_code',
  {
    title: 'Construir un informe como codigo',
    description: 'Disena un spec con buenas practicas, lo valida y lo aplica; aprende de los fallos.',
    argsSchema: { goal: z.string().optional().describe('Objetivo del informe / publico') },
  },
  ({ goal }) => ({
    messages: [
      {
        role: 'user' as const,
        content: {
          type: 'text' as const,
          text: [
            `Construye o actualiza el informe abierto como codigo${goal ? ` para: ${goal}` : ''}.`,
            '1. attach_to_report (modo edit), get_learnings (plantillas y soluciones conocidas) e inspect_data_sources.',
            '2. Si faltan plantillas de los tipos que necesitas, pide abrir un informe que los tenga y usa capture_templates.',
            '3. Escribe un spec (pages/components, macro row para KPIs; dataset "@campo"; metricas con SUM()/AVG()/COUNT_DISTINCT() en origenes Sheets).',
            '   Reglas: reticula 10 px, margen 20, gap 20, 4-6 KPIs de 100-140 px de alto arriba, tendencia, luego detalle; <=15 componentes con datos por pagina.',
            '4. lint_report_spec hasta 0 errores; apply_report_spec con dryRun; luego sin dryRun.',
            '5. Revisa el diagnose devuelto; para cada problema nuevo que resuelvas, record_learning (kind fix) con la solucion.',
          ].join('\n'),
        },
      },
    ],
  }),
);

// ---------------------------------------------------------------------------
// prompts (skills)
// ---------------------------------------------------------------------------

registerSkills(server);

server.registerPrompt(
  'skill_harmonize_paddings',
  {
    title: 'Armonizar paddings y espaciados',
    description: 'Alinea paddings, posiciones, tamanos y separaciones de tarjetas/tablas a una reticula.',
    argsSchema: {
      grid: z.string().optional().describe('Tamano de la reticula en px (por defecto "8")'),
    },
  },
  ({ grid }) => {
    const g = Number(grid ?? '8') > 0 ? Number(grid ?? '8') : 8;
    return {
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text: [
              `Armoniza el espaciado del informe de Looker Studio abierto usando una reticula de ${g}px.`,
              '',
              'Pasos:',
              '1. Llama a `attach_to_report` y comprueba que `mode` es "edit". Si no lo es, detente y pide al usuario que entre en modo edicion.',
              '2. Llama a `get_report_layout` y guarda el resultado como estado "ANTES".',
              '3. Analiza los componentes de tipo tarjeta/scorecard/tabla/grafico:',
              '   - paddings internos distintos entre componentes del mismo tipo;',
              '   - separaciones (gaps) horizontales y verticales irregulares entre componentes vecinos de la misma fila/columna;',
              `   - valores x, y, width, height y padding que no sean multiplos de ${g}.`,
              `4. Calcula los valores objetivo redondeando al multiplo de ${g} mas cercano (paddings, posiciones, tamanos y gaps). ` +
                'Usa un unico padding por tipo de componente (el mas frecuente, ya redondeado) y un unico gap por fila/columna. ' +
                'Evita solapamientos y no salgas del ancho del lienzo.',
              '5. Aplica los cambios con `set_component_box_model` UN componente cada vez (padding, dimensions y/o position solo si cambian).',
              '6. Al terminar vuelve a llamar a `get_report_layout` para verificar ("DESPUES") y corrige lo que no haya quedado bien.',
              '7. Informa con una tabla Markdown antes/despues: | id | tipo | x | y | width | height | padding | (antes -> despues), ' +
                'y una lista de los gaps normalizados. Menciona cualquier advertencia devuelta por las herramientas.',
            ].join('\n'),
          },
        },
      ],
    };
  },
);

server.registerPrompt(
  'skill_scaffold_kpi_row',
  {
    title: 'Montar una fila de KPIs',
    description: 'Distribuye N scorecards en una fila con ancho igual, separacion y padding uniformes, y les asigna metricas.',
    argsSchema: {
      count: z.string().describe('Numero de scorecards (N)'),
      metrics: z.string().optional().describe('Lista de ids de metricas separada por comas'),
      y: z.string().optional().describe('Posicion y de la fila en px (por defecto, la de los scorecards existentes o 16)'),
      gap: z.string().optional().describe('Separacion entre scorecards en px (por defecto "16")'),
      padding: z.string().optional().describe('Padding interno de cada scorecard en px (por defecto "16")'),
    },
  },
  ({ count, metrics, y, gap, padding }) => {
    const n = Math.max(1, Math.floor(Number(count)) || 1);
    const g = Number(gap ?? '16') >= 0 ? Number(gap ?? '16') : 16;
    const p = Number(padding ?? '16') >= 0 ? Number(padding ?? '16') : 16;
    const metricList = (metrics ?? '')
      .split(',')
      .map((m) => m.trim())
      .filter(Boolean);
    return {
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text: [
              `Crea/ajusta una fila de ${n} scorecards KPI en el informe de Looker Studio abierto.`,
              '',
              'Parametros:',
              `- N = ${n}`,
              `- gap = ${g}px`,
              `- padding = ${p}px`,
              `- y = ${y ?? 'la y minima de los scorecards existentes (o 16 si no hay)'}`,
              `- metricas = ${metricList.length ? metricList.join(', ') : 'no indicadas: elige tu las mas relevantes'}`,
              '',
              'Pasos:',
              '1. Llama a `attach_to_report` (debe estar en modo "edit") y a `get_report_layout`. Toma canvasWidth de `canvas.width`.',
              '2. Determina marginLeft y marginRight a partir del componente mas a la izquierda/derecha de la pagina (si no hay, usa el gap).',
              `3. Calcula w = (canvasWidth - marginLeft - marginRight - (N-1)*gap) / N y redondealo hacia abajo a entero.`,
              '4. Para cada i en 0..N-1: x_i = marginLeft + i*(w+gap).',
              `5. Elige los N scorecards existentes (type "scorecard", ordenados por x). Si hay menos de ${n}, indica al usuario cuantos debe ` +
                'anadir (Insertar > Scorecard) y continua con los que haya.',
              metricList.length
                ? '6. Usa las metricas indicadas, en orden, una por scorecard.'
                : '6. Llama a `inspect_data_sources` y elige las N metricas (type METRIC) mas relevantes para un resumen ejecutivo.',
              `7. Para cada scorecard i: llama a \`set_component_box_model\` con position {x: x_i, y}, dimensions {width: w, height: altura actual} y padding ${p}; ` +
                'despues llama a `bind_fields_to_component` con dimensions [] y metrics [metrica_i].',
              '8. Verifica con `get_report_layout` y resume en una tabla: | i | id | x | y | width | height | metrica |.',
            ].join('\n'),
          },
        },
      ],
    };
  },
);

// ---------------------------------------------------------------------------
// main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  log('Servidor MCP listo (stdio).');
}

process.on('unhandledRejection', (r) => log('unhandledRejection:', r instanceof Error ? r.stack ?? r.message : r));

main().catch((err) => {
  log('Fallo al arrancar:', err instanceof Error ? err.stack ?? err.message : err);
  process.exit(1);
});
