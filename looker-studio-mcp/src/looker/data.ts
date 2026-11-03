import { evaluate, evaluateOn } from '../browser.js';
import { requireEditMode } from './report.js';
import { bindFieldsScript, readDataSourcesScript } from './scripts.js';
import type { BindFieldsArgs, BindFieldsResult, DataSourcesResult } from './types.js';

const EVAL_TIMEOUT_MS = Number(process.env.LS_EVAL_TIMEOUT_MS ?? 15_000);

export async function inspectDataSources(): Promise<DataSourcesResult> {
  return evaluate(readDataSourcesScript);
}

export async function bindFieldsToComponent(args: BindFieldsArgs): Promise<BindFieldsResult> {
  const { page } = await requireEditMode();
  const res = await evaluateOn(page, EVAL_TIMEOUT_MS, bindFieldsScript, args);
  if (!res.ok) {
    const extra = res.warnings.length ? ` (${res.warnings.join(' ')})` : '';
    throw new Error((res.error ?? `No se pudieron vincular campos a ${args.componentId}.`) + extra);
  }
  return res;
}
