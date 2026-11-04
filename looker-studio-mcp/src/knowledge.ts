/**
 * Learning layer. Everything the tools discover at runtime is persisted here and
 * reused on the next run (by the CLI and by the MCP server):
 *
 *   knowledge/
 *     learnings.jsonl        append-only events {ts, kind, key, data}
 *     templates/<type>.json  one component config per display type (for create)
 *
 * Kinds:
 *   error_reason     reason code -> title/description/dialog text seen in the editor
 *   fix              known fix for an issue code / error reason (from a human or the model)
 *   display_type     display types registered in the editor build
 *   template         a template was captured (type, origin)
 *   create_ok / create_fail / save_rejected   outcome of creating components
 *   method_missing   an internal method we expected is not there (build changed)
 *   note             free-form note recorded with record_learning / `ls learn`
 *
 * Location: LS_KNOWLEDGE_DIR or <package>/knowledge. No secrets are ever stored:
 * callers only pass ids, codes, types and messages shown in the UI.
 */
import { appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const KNOWLEDGE_DIR =
  process.env.LS_KNOWLEDGE_DIR ?? join(dirname(fileURLToPath(import.meta.url)), '..', 'knowledge');
const LOG = join(KNOWLEDGE_DIR, 'learnings.jsonl');
const TPL = join(KNOWLEDGE_DIR, 'templates');

export type LearningKind =
  | 'error_reason'
  | 'fix'
  | 'display_type'
  | 'template'
  | 'create_ok'
  | 'create_fail'
  | 'save_rejected'
  | 'method_missing'
  | 'note';

export interface Learning {
  ts: string;
  kind: LearningKind;
  key: string;
  data?: Record<string, unknown>;
}

function ensure(): void {
  if (!existsSync(TPL)) mkdirSync(TPL, { recursive: true });
}

export function readLearnings(): Learning[] {
  if (!existsSync(LOG)) return [];
  return readFileSync(LOG, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((l) => {
      try {
        return JSON.parse(l) as Learning;
      } catch {
        return null;
      }
    })
    .filter((x): x is Learning => !!x);
}

/** Appends a learning unless an identical (kind, key, data) one already exists. */
export function learn(kind: LearningKind, key: string, data?: Record<string, unknown>): boolean {
  ensure();
  const sig = JSON.stringify([kind, key, data ?? null]);
  const dup = readLearnings().some((l) => JSON.stringify([l.kind, l.key, l.data ?? null]) === sig);
  if (dup) return false;
  const entry: Learning = { ts: new Date().toISOString(), kind, key, ...(data ? { data } : {}) };
  appendFileSync(LOG, JSON.stringify(entry) + '\n');
  return true;
}

// ---- templates --------------------------------------------------------------

const safe = (t: string) => t.replace(/[^a-z0-9_-]/gi, '_');

export function saveTemplate(type: string, config: unknown, origin: Record<string, unknown>): boolean {
  ensure();
  const file = join(TPL, `${safe(type)}.json`);
  if (existsSync(file)) return false;
  writeFileSync(file, JSON.stringify({ type, capturedAt: new Date().toISOString(), origin, config }, null, 2));
  learn('template', type, origin);
  return true;
}

export function getTemplate(type: string): unknown | undefined {
  const file = join(TPL, `${safe(type)}.json`);
  if (!existsSync(file)) return undefined;
  return (JSON.parse(readFileSync(file, 'utf8')) as { config: unknown }).config;
}

export function listTemplates(): Array<{ type: string; capturedAt: string; origin: unknown }> {
  if (!existsSync(TPL)) return [];
  return readdirSync(TPL)
    .filter((f) => f.endsWith('.json'))
    .map((f) => {
      const j = JSON.parse(readFileSync(join(TPL, f), 'utf8')) as { type: string; capturedAt: string; origin: unknown };
      return { type: j.type, capturedAt: j.capturedAt, origin: j.origin };
    });
}

// ---- summary / lookups -------------------------------------------------------

export interface KnowledgeSummary {
  dir: string;
  counts: Record<string, number>;
  errorReasons: Record<string, { title?: unknown; description?: unknown; fix?: unknown }>;
  fixes: Record<string, unknown>;
  displayTypes: string[];
  templates: string[];
  createOutcomes: Record<string, { ok: number; fail: number; rejected: number }>;
  missingMethods: string[];
  notes: Array<{ ts: string; key: string; text: unknown }>;
}

export function summary(): KnowledgeSummary {
  const all = readLearnings();
  const s: KnowledgeSummary = {
    dir: KNOWLEDGE_DIR,
    counts: {},
    errorReasons: {},
    fixes: {},
    displayTypes: [],
    templates: listTemplates().map((t) => t.type),
    createOutcomes: {},
    missingMethods: [],
    notes: [],
  };
  const types = new Set<string>();
  for (const l of all) {
    s.counts[l.kind] = (s.counts[l.kind] ?? 0) + 1;
    const d = l.data ?? {};
    switch (l.kind) {
      case 'error_reason':
        s.errorReasons[l.key] = { ...s.errorReasons[l.key], title: d.title, description: d.description };
        break;
      case 'fix':
        s.fixes[l.key] = d.fix;
        break;
      case 'display_type':
        types.add(l.key);
        break;
      case 'create_ok':
      case 'create_fail':
      case 'save_rejected': {
        const o = (s.createOutcomes[l.key] ??= { ok: 0, fail: 0, rejected: 0 });
        if (l.kind === 'create_ok') o.ok++;
        else if (l.kind === 'create_fail') o.fail++;
        else o.rejected++;
        break;
      }
      case 'method_missing':
        s.missingMethods.push(l.key);
        break;
      case 'note':
        s.notes.push({ ts: l.ts, key: l.key, text: d.text });
        break;
      default:
        break;
    }
  }
  for (const [k, v] of Object.entries(s.fixes)) {
    if (k.startsWith('reason:') && s.errorReasons[k.slice(7)]) s.errorReasons[k.slice(7)]!.fix = v;
  }
  s.displayTypes = [...types].sort();
  return s;
}

/** Known fix for an issue code ("CUSTOM_AGGREGATION") or error reason ("reason:93"). */
export function knownFix(key: string): unknown | undefined {
  return summary().fixes[key];
}

/** Seeds fixes verified during reverse engineering (idempotent). */
export function seedKnowledge(): void {
  const seeds: Array<[string, string]> = [
    ['reason:93', 'El origen no permite editar campos en informes y el grafico usa agregacion personalizada: revincula con bind_fields_to_component (sin agregacion en metricas nativas) o habilita "editar campos en informes" en el origen.'],
    ['reason:13', 'Sin acceso al conjunto de datos subyacente: revisa credenciales del origen (propietario/visor) o que la hoja/tabla siga existiendo y compartida.'],
    ['CUSTOM_AGGREGATION', 'Agregacion distinta de la del origen: revincula el campo sin agregacion explicita si es metrica nativa.'],
    ['FIELD_NOT_IN_SCHEMA', 'El campo ya no existe en el origen (migracion o renombrado): usa inspect_data_sources y bind_fields_to_component con el campo nuevo.'],
    ['RAW_ROWS', 'Metrica sin agregar en un origen Sheets/CSV (todas las columnas son dimensiones): usa SUM(campo)/AVG(campo)/COUNT_DISTINCT(campo).'],
    ['reason:268', 'Orden no valido: el orden apunta a un campo que ya no esta en el grafico; vuelve a vincular con bind_fields_to_component (reasigna el orden) o elige el orden en el panel.'],
    ['SORT_INVALID', 'Orden huerfano: bind_fields_to_component lo reasigna a la primera metrica (desc) o a la fecha (asc) en series temporales.'],
    ['reason:267', 'Metrica no valida: el componente conserva una metrica que no existe en su origen (p. ej. heredada de una plantilla); bind la elimina o vincula una metrica del origen actual.'],
    ['reason:266', 'Dimension no valida: el campo de la dimension no existe en el origen del grafico; vincula una dimension del origen actual.'],
    ['save_rejected:scrubbed_template', 'No vacies conceptDefs/dimensiones/metricas de una plantilla: cambia solo el dataset y vincula los campos antes del primer guardado.'],
    ['save_rejected:type_change', 'updatePage 400 al crear: no cambies display.type de un JSON clonado; captura una plantilla real del tipo con capture_templates y recarga para descartar el estado invalido.'],
  ];
  for (const [k, fix] of seeds) learn('fix', k, { fix, source: 'seed' });
}
