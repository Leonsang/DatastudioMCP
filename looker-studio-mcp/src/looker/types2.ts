/** Types for scripts2.ts (report-as-code). JSON-serializable only. */

export interface ReadyState {
  ready: boolean;
  pages: number;
  components: number;
  url: string;
}

export interface NetEntry {
  path: string;
  status: number;
  t: number;
}

export interface ExportedField {
  id: string;
  name: string;
  type: 'DIMENSION' | 'METRIC';
  dataType: string;
  defaultAggregation: number | null;
}

export interface ExportResult {
  exportedAt: string;
  url: string;
  title: string;
  reportId: string;
  canvas: { width: number; height: number };
  pages: Array<{ id: string; name: string; components: unknown[] }>;
  reportComponents: unknown[];
  dataSources: Array<{ id: string; usedBy: string[]; fields: ExportedField[] }>;
  types: string[];
}

export interface CaptureTemplatesResult {
  url: string;
  templates: Record<string, { config: unknown; fromComponent: string; dataSourceId: string }>;
  registeredTypes: string[];
}

export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface CreateComponentArgs {
  type: string;
  box: Box;
  pageId?: string;
  datasetId?: string;
  padding?: number;
  /** Learned template config (used only if the report has no component of that type). */
  template?: unknown;
  /** Do not save yet (the caller will bind fields, which saves). */
  deferSave?: boolean;
  /** Use the template even if the report has a component of the same type (variants). */
  preferTemplate?: boolean;
}

export interface CreateComponentResult {
  ok: boolean;
  componentId: string | null;
  type: string;
  /** "clone:<id>" or "template". */
  source: string | null;
  pageId?: string;
  warnings: string[];
  error?: string;
}

export interface DeleteComponentResult {
  ok: boolean;
  method: string | null;
  needsKeyboard: boolean;
  error?: string;
}
