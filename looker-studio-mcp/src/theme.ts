/**
 * Themes and UX audit.
 *
 * Friendly theme (spec "theme" / `ls-studio theme set`):
 *   { font, text, fill, accent, accentText, background, grid, increase, decrease,
 *     border, borderWeight, borderRadius, series: ["#..", ...], header }
 * is merged onto themes/base-theme.json (captured from a real report) and stored as
 * a custom theme resource in the report.
 *
 * UX audit rules come from skills/diseno-layout.md (§6 estilo, §7 color, §8 tipografia,
 * §9 accesibilidad WCAG 2.2) and kpi-scorecards.md §6.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const BASE = join(dirname(fileURLToPath(import.meta.url)), '..', 'themes', 'base-theme.json');

export interface FriendlyTheme {
  font?: string;
  text?: string;
  fill?: string;
  accent?: string;
  accentText?: string;
  accentFont?: string;
  background?: string;
  grid?: string;
  increase?: string;
  decrease?: string;
  border?: string;
  borderWeight?: number;
  borderRadius?: number;
  header?: string;
  series?: string[];
}

type Color = { color: string; opacity?: number; [k: string]: unknown };

export function baseTheme(): Record<string, any> {
  return JSON.parse(readFileSync(BASE, 'utf8'));
}

export function toThemeContent(t: FriendlyTheme, base: Record<string, any> = baseTheme()): Record<string, any> {
  const c = JSON.parse(JSON.stringify(base));
  const setColor = (k: string, v?: string) => {
    if (v) c[k] = { ...(c[k] as Color), color: v, opacity: 1 };
  };
  setColor('themeFillColor', t.fill);
  setColor('themeFontColor', t.text);
  setColor('themeAccentFillColor', t.accent);
  setColor('themeAccentFontColor', t.accentText);
  setColor('themeIncreaseColor', t.increase);
  setColor('themeDecreaseColor', t.decrease);
  setColor('themeGridColor', t.grid);
  setColor('themeBackground', t.background);
  setColor('themeBorderColor', t.border);
  setColor('themeComponentHeaderColor', t.header ?? t.text);
  if (t.font) c.themeFontFamily = t.font;
  if (t.accentFont ?? t.font) c.themeAccentFontFamily = t.accentFont ?? t.font;
  if (t.borderWeight !== undefined) c.themeBorderWeight = t.borderWeight;
  if (t.borderRadius !== undefined) c.themeBorderRadius = t.borderRadius;
  if (t.series?.length) {
    const tpl = (c.themeSeriesColor as Color[])[0] ?? { color: '#000', opacity: 1 };
    c.themeSeriesColor = (c.themeSeriesColor as Color[]).map((s, i) => {
      const col = t.series![i % t.series!.length]!;
      return { ...tpl, ...s, color: col, opacity: 1, disabled: false, available: true, seriesRef: { index: i }, themeRef: { index: 4 + i } };
    });
  }
  return c;
}

export function fromThemeContent(c: Record<string, any> | null): FriendlyTheme | null {
  if (!c) return null;
  const col = (k: string) => (c[k] && typeof c[k] === 'object' ? (c[k] as Color).color : undefined);
  return {
    font: c.themeFontFamily, text: col('themeFontColor'), fill: col('themeFillColor'), accent: col('themeAccentFillColor'),
    accentText: col('themeAccentFontColor'), background: col('themeBackground'), grid: col('themeGridColor'),
    increase: col('themeIncreaseColor'), decrease: col('themeDecreaseColor'), border: col('themeBorderColor'),
    borderWeight: c.themeBorderWeight, borderRadius: c.themeBorderRadius, header: col('themeComponentHeaderColor'),
    series: Array.isArray(c.themeSeriesColor) ? (c.themeSeriesColor as Color[]).slice(0, 8).map((s) => s.color) : [],
  };
}

// ---- WCAG ---------------------------------------------------------------------

function rgb(hex: string): [number, number, number] | null {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  let h = m[1]!;
  if (h.length === 3) h = h.split('').map((x) => x + x).join('');
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)) as [number, number, number];
}

function luminance(hex: string): number | null {
  const c = rgb(hex);
  if (!c) return null;
  const [r, g, b] = c.map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrast(a: string, b: string): number | null {
  const la = luminance(a), lb = luminance(b);
  if (la === null || lb === null) return null;
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return Math.round(((hi + 0.05) / (lo + 0.05)) * 100) / 100;
}

/** Rough perceptual distance (redmean); < 60 ~ hard to tell apart. */
function distance(a: string, b: string): number | null {
  const x = rgb(a), y = rgb(b);
  if (!x || !y) return null;
  const rm = (x[0] + y[0]) / 2;
  const [dr, dg, db] = [x[0] - y[0], x[1] - y[1], x[2] - y[2]];
  return Math.sqrt((2 + rm / 256) * dr * dr + 4 * dg * dg + (2 + (255 - rm) / 256) * db * db);
}

// ---- audit --------------------------------------------------------------------

export interface UxIssue {
  severity: 'error' | 'warning' | 'info';
  area: 'contraste' | 'tema' | 'paleta' | 'tipografia' | 'layout' | 'kpi';
  componentId: string | null;
  message: string;
  rule: string;
}

export interface UxFacts {
  theme: Record<string, any> | null;
  themeConfig: string | null;
  components: Array<{ id: string; type: string; page: string; overrides: Record<string, any> }>;
  pages: Array<{ id: string; name: string; background: unknown }>;
}

export function auditUx(f: UxFacts, layoutIssues: Array<{ code: string; componentId: string | null; message: string; severity: string }> = []) {
  const issues: UxIssue[] = [];
  const t = fromThemeContent(f.theme);
  const PAGE_BG = '#ffffff';
  if (!t) {
    issues.push({ severity: 'info', area: 'tema', componentId: null, rule: 'diseno-layout §6', message: `Tema predefinido "${f.themeConfig}" (sin personalizar): no se pueden comprobar sus colores; aplica uno con theme set para controlar marca y contraste.` });
  } else {
    const bg = t.fill && t.fill !== 'transparent' ? t.fill : PAGE_BG;
    const pairs: Array<[string, string | undefined, string | undefined, number, string]> = [
      ['texto sobre relleno', t.text, bg, 4.5, 'WCAG 1.4.3 texto ≥ 4.5:1'],
      ['texto de acento sobre acento', t.accentText, t.accent, 4.5, 'WCAG 1.4.3 texto ≥ 4.5:1'],
      ['cabecera sobre relleno', t.header, bg, 4.5, 'WCAG 1.4.3'],
      ['subida sobre relleno', t.increase, bg, 3, 'WCAG 1.4.11 no textual ≥ 3:1'],
      ['bajada sobre relleno', t.decrease, bg, 3, 'WCAG 1.4.11 no textual ≥ 3:1'],
    ];
    for (const [label, fg, back, min, rule] of pairs) {
      if (!fg || !back || back === 'transparent') continue;
      const r = contrast(fg, back);
      if (r !== null && r < min) issues.push({ severity: 'error', area: 'contraste', componentId: null, rule, message: `Contraste ${label} ${r}:1 (< ${min}:1): ${fg} sobre ${back}.` });
    }
    const series = (t.series ?? []).slice(0, 6);
    series.forEach((s, i) => {
      const r = contrast(s, bg);
      if (r !== null && r < 3) issues.push({ severity: 'warning', area: 'paleta', componentId: null, rule: 'WCAG 1.4.11', message: `Serie ${i + 1} (${s}) con contraste ${r}:1 sobre el fondo (< 3:1): lineas/barras dificiles de ver.` });
    });
    for (let i = 0; i < series.length; i++)
      for (let j = i + 1; j < series.length; j++) {
        const d = distance(series[i]!, series[j]!);
        if (d !== null && d < 60) issues.push({ severity: 'warning', area: 'paleta', componentId: null, rule: 'diseno-layout §7', message: `Series ${i + 1} y ${j + 1} casi iguales (${series[i]} / ${series[j]}).` });
      }
  }
  // per-component overrides (theme consistency) and their own contrast
  const fonts = new Set<string>();
  if (t?.font) fonts.add(t.font);
  for (const c of f.components) {
    const keys = Object.keys(c.overrides);
    if (keys.length) issues.push({ severity: 'info', area: 'tema', componentId: c.id, rule: 'diseno-layout §6', message: `${c.type} sobrescribe el tema en ${keys.length} claves (${keys.slice(0, 5).join(', ')}${keys.length > 5 ? '…' : ''}).` });
    for (const [k, v] of Object.entries(c.overrides)) {
      if (/fontfamily/i.test(k) && typeof v === 'string') fonts.add(v);
      if (/fontcolor/i.test(k) && v && typeof v === 'object' && typeof (v as Color).color === 'string') {
        const bgOv = c.overrides.backgroundColor ?? c.overrides.background;
        const back = (bgOv && typeof bgOv === 'object' && (bgOv as Color).color) || t?.fill || PAGE_BG;
        const r = contrast((v as Color).color, back === 'transparent' ? PAGE_BG : back);
        if (r !== null && r < 4.5) issues.push({ severity: 'error', area: 'contraste', componentId: c.id, rule: 'WCAG 1.4.3', message: `${c.type}: ${k} ${(v as Color).color} sobre ${back} = ${r}:1 (< 4.5:1).` });
      }
    }
  }
  if (fonts.size > 2) issues.push({ severity: 'warning', area: 'tipografia', componentId: null, rule: 'diseno-layout §8', message: `${fonts.size} familias tipograficas (${[...fonts].join(', ')}): usa como mucho 2.` });
  for (const l of layoutIssues) {
    if (['OFF_GRID', 'OUT_OF_CANVAS', 'TOO_MANY_CHARTS', 'COMPONENT_ERROR', 'UI_MESSAGE', 'SORT_INVALID', 'NO_METRICS'].includes(l.code))
      issues.push({ severity: l.severity === 'error' ? 'error' : l.severity === 'warning' ? 'warning' : 'info', area: 'layout', componentId: l.componentId, rule: l.code, message: l.message });
  }
  const weight = { error: 15, warning: 5, info: 1 } as const;
  const score = Math.max(0, 100 - issues.reduce((s, i) => s + weight[i.severity], 0));
  return { score, theme: t, issues };
}
