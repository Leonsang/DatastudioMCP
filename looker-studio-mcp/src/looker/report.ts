import type { Page } from 'puppeteer-core';
import { evaluateOn, getReportPage } from '../browser.js';
import { pageInfoScript } from './scripts.js';
import type { CanvasInfo, ReportInfo, ReportMode } from './types.js';

const EVAL_TIMEOUT_MS = Number(process.env.LS_EVAL_TIMEOUT_MS ?? 15_000);

/** Parses reportId / pageId / mode out of a Looker Studio report URL. */
export function parseReportUrl(url: string): Pick<ReportInfo, 'reportId' | 'pageId' | 'mode'> {
  let path = url;
  try {
    path = new URL(url).pathname;
  } catch {
    /* keep raw string */
  }
  const reportId = path.match(/\/reporting\/([^/?#]+)/)?.[1] ?? null;
  const pageId = path.match(/\/page\/([^/?#]+)/)?.[1] ?? null;
  const segments = path.split('/').filter(Boolean);
  let mode: ReportMode = 'view';
  if (segments.includes('edit')) mode = 'edit';
  else if (segments.includes('preview')) mode = 'preview';
  return { reportId, pageId, mode };
}

export interface AttachResult extends ReportInfo {
  canvas: CanvasInfo | null;
}

export async function attachToReport(page?: Page): Promise<AttachResult> {
  const p = page ?? (await getReportPage());
  const info = await evaluateOn(p, EVAL_TIMEOUT_MS, pageInfoScript);
  const url = info.url || p.url();
  return {
    ...parseReportUrl(url),
    title: info.title.replace(/\s*-\s*(Looker|Data) Studio\s*$/i, '') || info.title,
    url,
    canvas: info.canvas,
  };
}

/** Throws a descriptive error unless the report tab is in edit mode. */
export async function requireEditMode(): Promise<{ page: Page; info: ReportInfo }> {
  const page = await getReportPage();
  const info = { ...parseReportUrl(page.url()), title: await page.title(), url: page.url() };
  if (info.mode !== 'edit' && process.env.LS_ALLOW_NON_EDIT !== '1') {
    throw new Error(
      `El informe esta en modo "${info.mode}". Esta herramienta modifica el informe y requiere modo edicion: ` +
        'pulsa "Editar" en Looker Studio (la URL debe terminar en /edit) y vuelve a intentarlo.',
    );
  }
  return { page, info };
}
