/**
 * Shared types between the Node side (tools) and the page-injected scripts.
 * Everything here must be JSON-serializable, because values cross the
 * puppeteer `page.evaluate` boundary.
 */

export type ReportMode = 'edit' | 'view' | 'preview';

export interface ReportInfo {
  reportId: string | null;
  pageId: string | null;
  title: string;
  url: string;
  mode: ReportMode;
}

/** Raw info returned by `pageInfoScript()` (URL parsing happens in Node). */
export interface PageInfoRaw {
  title: string;
  url: string;
  visibilityState: string;
  hasFocus: boolean;
  canvas: CanvasInfo | null;
  /** true when the AngularJS injector / legoUndoRedoService is reachable. */
  internals: boolean;
  /** Internal report UUID (report.config.id), differs from the URL id. */
  internalReportId: string | null;
  permissions: { isEditable: boolean; isOwner: boolean } | null;
  pages: Array<{ id: string; name: string }>;
  activePageId: string | null;
}

export interface CanvasInfo {
  /** Canvas (report page) width in report pixels. */
  width: number;
  /** Canvas (report page) height in report pixels. */
  height: number;
  /** Current zoom factor applied by the editor (screen px / report px). */
  zoom: number;
}

export interface Padding {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export interface ComponentStyle {
  padding: Padding;
  backgroundColor: string | null;
  borderColor: string | null;
  borderWidth: number | null;
  borderRadius: number | null;
  /** Whether this component type exposes padding* display keys. */
  supportsPadding?: boolean;
}

export interface LayoutComponent {
  id: string;
  type: string;
  /** Position/size in report coordinates (unzoomed, relative to canvas). */
  x: number;
  y: number;
  width: number;
  height: number;
  style: ComponentStyle;
  /** 'report' = shown on every page (report-level component). */
  level?: 'page' | 'report';
  /** Bound source field ids (sourceFieldName), not qt_ concept names. */
  data?: { dimensions: string[]; metrics: string[] };
  /** Error state detected in the model or in the rendered component. */
  error?: string | null;
}

export interface LayoutResult {
  pageId: string | null;
  canvas: CanvasInfo | null;
  components: LayoutComponent[];
  /** Notes about how the data was obtained (heuristic vs internals). */
  source: 'internals' | 'dom-heuristic';
  warnings: string[];
}

export interface BoxModelArgs {
  componentId: string;
  padding?: Padding;
  dimensions?: { width: number; height: number };
  position?: { x: number; y: number };
}

export interface BoxModelResult {
  ok: boolean;
  componentId: string;
  applied: string[];
  before: LayoutComponent | null;
  after: LayoutComponent | null;
  source: 'internals' | 'dom-heuristic';
  warnings: string[];
  error?: string;
}

export type FieldConcept = 'DIMENSION' | 'METRIC';

export interface DataSourceField {
  /** Field id in the data source (sourceFieldName), e.g. "unique_users". */
  id: string;
  /** Namespaced id, e.g. "t0.unique_users". */
  qualifiedId?: string;
  defaultAggregation?: number | null;
  name: string;
  type: FieldConcept;
  dataType: string;
}

export interface DataSource {
  dataSourceId: string;
  name: string;
  maxDimensions?: number | null;
  maxMetrics?: number | null;
  /** Component ids that query this data source. */
  usedBy?: string[];
  fields: DataSourceField[];
}

export interface DataSourcesResult {
  dataSources: DataSource[];
  source: 'internals' | 'dom-heuristic';
  warnings: string[];
}

export interface BindFieldsArgs {
  componentId: string;
  dimensions: string[];
  metrics: string[];
  /** replace (default) the primary slot, or append to it. */
  mode?: 'replace' | 'append';
  /** Remove primary dimensions when `dimensions` is empty (gauge, bullet, scorecard from a table). */
  clearDimensions?: boolean;
  /** Extra concept slots by conceptKey: { x_metric: ["SUM(a)"], breakdown: ["canal"] }. */
  slots?: Record<string, string[]>;
}

export interface BindFieldsResult {
  ok: boolean;
  componentId: string;
  dimensions: string[];
  metrics: string[];
  source: 'internals' | 'dom-heuristic';
  warnings: string[];
  error?: string;
}

export interface DiagnoseIssue {
  severity: 'error' | 'warning' | 'info';
  componentId: string | null;
  pageId: string | null;
  code: string;
  message: string;
}

export interface DiagnoseResult {
  issues: DiagnoseIssue[];
  stats: {
    pages: number;
    components: number;
    reportLevelComponents: number;
    dataComponentsPerPage: Record<string, number>;
    canvasWidth: number;
    /** Dominant layout grid detected (10, 8, 4) or 0 if none. */
    grid: number;
  } | null;
}
