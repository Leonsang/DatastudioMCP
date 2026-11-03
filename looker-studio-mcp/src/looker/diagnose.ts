import { evaluate } from '../browser.js';
import { diagnoseReportScript, readComponentConfigScript } from './scripts.js';
import type { DiagnoseResult } from './types.js';

export async function diagnoseReport(): Promise<DiagnoseResult> {
  return evaluate(diagnoseReportScript);
}

export async function getComponentConfig(componentId: string): Promise<unknown> {
  const res = await evaluate(readComponentConfigScript, componentId);
  if (!res.ok) throw new Error(res.error ?? `No se pudo leer ${componentId}.`);
  return res.config;
}
