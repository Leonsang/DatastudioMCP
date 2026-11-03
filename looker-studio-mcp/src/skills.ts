/**
 * Best-practice skills (Markdown in ../skills) exposed as MCP prompts and
 * resources. Each prompt = the skill's knowledge + a tool-driven procedure, so
 * the model can create, migrate or debug any report, not just this sample.
 */
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

const SKILLS_DIR = process.env.LS_SKILLS_DIR ?? join(dirname(fileURLToPath(import.meta.url)), '..', 'skills');

function loadSkill(file: string): string {
  const p = join(SKILLS_DIR, file);
  return existsSync(p) ? readFileSync(p, 'utf8') : `(No se encontro ${p}. Define LS_SKILLS_DIR.)`;
}

interface SkillDef {
  name: string;
  file: string;
  title: string;
  description: string;
  args?: Record<string, z.ZodType<string | undefined>>;
  procedure: (a: Record<string, string | undefined>) => string[];
}

const COMMON = [
  'Reglas de seguridad: trabaja sobre una COPIA del informe; confirma con el usuario antes de cambios masivos ',
  '(mas de 10 componentes) o de cambiar origenes de datos; aplica cambios de uno en uno y verifica con get_report_layout.',
];

const SKILLS: SkillDef[] = [
  {
    name: 'skill_layout_audit',
    file: 'diseno-layout.md',
    title: 'Auditar y corregir el layout',
    description: 'Audita lienzo, reticula, jerarquia, alineacion, color y accesibilidad; propone y aplica correcciones.',
    args: { apply: z.string().optional().describe('"true" para aplicar las correcciones; por defecto solo informe') },
    procedure: ({ apply }) => [
      '1. attach_to_report y get_report_layout (en cada pagina de `pages`).',
      '2. Contrasta el layout con la guia: margenes, reticula, gaps, jerarquia (KPIs arriba, tendencia, detalle), componentes por pagina, desbordes.',
      '3. Devuelve una tabla de hallazgos: | pagina | componente | regla | actual | objetivo | [OFICIAL]/[CONVENCION] |.',
      apply === 'true'
        ? '4. Aplica las correcciones de caja con set_component_box_model (uno a uno) y verifica con get_report_layout.'
        : '4. No modifiques nada: termina con el plan de cambios propuesto.',
    ],
  },
  {
    name: 'skill_kpi_row',
    file: 'kpi-scorecards.md',
    title: 'Disenar una fila de KPIs',
    description: 'Distribuye scorecards existentes en una fila uniforme y les asigna metricas clave con buenas practicas.',
    args: {
      count: z.string().optional().describe('Numero de scorecards (por defecto, los kpi-metric existentes en la fila superior)'),
      metrics: z.string().optional().describe('Metricas separadas por comas (id, t0.id o nombre visible)'),
    },
    procedure: ({ count, metrics }) => [
      '1. attach_to_report (modo edit), get_report_layout e inspect_data_sources.',
      `2. Selecciona ${count ?? 'los'} componentes kpi-metric de la fila superior (no hay herramienta para crear componentes: si faltan, pide al usuario que los anada).`,
      '3. Calcula w = floor((canvasWidth - margenIzq - margenDer - (N-1)*gap) / N), x_i = margenIzq + i*(w+gap), misma y y altura.',
      `4. Metricas: ${metrics ?? 'elige las 4-6 mas relevantes del esquema (type METRIC) segun la guia'}. Aplica con bind_fields_to_component (metrics:[una], dimensions:[]).`,
      '5. Aplica caja y padding con set_component_box_model; verifica y resume antes/despues.',
    ],
  },
  {
    name: 'skill_performance_audit',
    file: 'rendimiento.md',
    title: 'Auditar rendimiento',
    description: 'Detecta paginas pesadas, origenes duplicados, blends y riesgos de cuota; propone mejoras.',
    procedure: () => [
      '1. attach_to_report, diagnose_report (stats.dataComponentsPerPage) e inspect_data_sources (usedBy por origen).',
      '2. Para cada pagina: numero de componentes con datos, tablas con muchas filas, dimensiones de alta cardinalidad (get_component_config si hace falta).',
      '3. Evalua frescura/cache, extractos, blends y cuotas GA4 segun la guia.',
      '4. Entrega una lista priorizada (impacto/esfuerzo) de acciones. No modifiques el informe salvo peticion explicita.',
    ],
  },
  {
    name: 'skill_data_model_review',
    file: 'modelo-datos.md',
    title: 'Revisar modelo de datos',
    description: 'Revisa origenes, campos (ids vs nombres), calculados, blends y credenciales del informe.',
    procedure: () => [
      '1. inspect_data_sources: lista origenes, numero de dimensiones/metricas y que componentes usan cada uno.',
      '2. diagnose_report: busca FIELD_NOT_IN_SCHEMA y MISSING_CONCEPT_DEF.',
      '3. Para componentes sospechosos, get_component_config y revisa conceptDefs (sourceFieldName, formula, namespace t0/t1 en blends).',
      '4. Informa: mapa campo-id -> nombre visible -> componentes que lo usan, y recomendaciones de la guia (nombres, reutilizables, credenciales).',
    ],
  },
  {
    name: 'skill_migrate_ua_to_ga4',
    file: 'migracion.md',
    title: 'Migrar informe (UA -> GA4 / cambio de origen)',
    description: 'Planifica y ejecuta la migracion de campos de un informe a un nuevo origen, componente a componente.',
    args: { dryRun: z.string().optional().describe('"false" para ejecutar; por defecto solo plan') },
    procedure: ({ dryRun }) => [
      '1. attach_to_report (si se va a ejecutar, modo edit sobre una COPIA), inspect_data_sources y diagnose_report.',
      '2. Para cada componente con datos, construye la tabla | componente | campo actual | campo GA4 propuesto | tipo | notas | usando el mapeo de la guia y los campos reales del esquema destino.',
      '3. Marca lo que NO se migra automaticamente (calculados, filtros, segmentos, blends) para hacerlo a mano.',
      dryRun === 'false'
        ? '4. Ejecuta con bind_fields_to_component (mode replace) componente a componente; despues diagnose_report para confirmar 0 FIELD_NOT_IN_SCHEMA.'
        : '4. No modifiques nada: entrega el plan y pide confirmacion.',
    ],
  },
  {
    name: 'skill_debug_report',
    file: 'depuracion-errores.md',
    title: 'Depurar errores del informe',
    description: 'Encuentra componentes con error, clasifica la causa con el catalogo y propone o aplica la solucion.',
    procedure: () => [
      '1. attach_to_report y diagnose_report en el informe completo.',
      '2. Para cada issue de severidad error: get_component_config y clasifica con el catalogo (sintoma -> causa).',
      '3. Ten en cuenta: en modo view/preview las consultas nuevas fallan con PREFETCH_VALIDATION (ACCESS) aunque la configuracion sea correcta.',
      '4. Propone la solucion; si es de campos y el usuario lo confirma, aplicala con bind_fields_to_component y vuelve a diagnosticar.',
      '5. Resume: | componente | sintoma | causa | solucion | estado |.',
    ],
  },
];

export function registerSkills(server: McpServer): void {
  for (const s of SKILLS) {
    server.registerPrompt(
      s.name,
      { title: s.title, description: s.description, ...(s.args ? { argsSchema: s.args } : {}) },
      (args: Record<string, string | undefined> = {}) => ({
        messages: [
          {
            role: 'user' as const,
            content: {
              type: 'text' as const,
              text: [
                `# ${s.title}`,
                '',
                'Procedimiento (usa las herramientas MCP de looker-studio-mcp):',
                ...s.procedure(args),
                '',
                ...COMMON,
                '',
                '---',
                `## Guia de buenas practicas (${s.file})`,
                '',
                loadSkill(s.file),
              ].join('\n'),
            },
          },
        ],
      }),
    );
    server.registerResource(
      s.file.replace(/\.md$/, ''),
      `skill://${s.file}`,
      { title: s.title, description: s.description, mimeType: 'text/markdown' },
      async (uri) => ({ contents: [{ uri: uri.href, mimeType: 'text/markdown', text: loadSkill(s.file) }] }),
    );
  }
  server.registerResource(
    'internals',
    'skill://LOOKER_STUDIO_INTERNALS.md',
    { title: 'Internals del editor', description: 'Mecanismos internos de Looker Studio verificados por ingenieria inversa', mimeType: 'text/markdown' },
    async (uri) => ({ contents: [{ uri: uri.href, mimeType: 'text/markdown', text: loadSkill('LOOKER_STUDIO_INTERNALS.md') }] }),
  );
}
