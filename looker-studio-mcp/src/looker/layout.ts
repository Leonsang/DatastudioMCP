import { evaluateOn, getReportPage } from '../browser.js';
import { parseReportUrl } from './report.js';
import { readLayoutScript } from './scripts.js';
import type { LayoutResult } from './types.js';

const EVAL_TIMEOUT_MS = Number(process.env.LS_EVAL_TIMEOUT_MS ?? 15_000);

/**
 * Reads the components of the given report page (or the visible one).
 * If `pageId` differs from the visible page, navigates the tab to it first.
 */
export async function getReportLayout(pageId?: string): Promise<LayoutResult> {
  const page = await getReportPage();
  const current = parseReportUrl(page.url());
  if (pageId && current.pageId && pageId !== current.pageId) {
    const target = page.url().replace(/\/page\/[^/?#]+/, `/page/${encodeURIComponent(pageId)}`);
    await page.goto(target, { waitUntil: 'networkidle2', timeout: 30_000 });
  }
  return evaluateOn(page, EVAL_TIMEOUT_MS, readLayoutScript, pageId);
}
