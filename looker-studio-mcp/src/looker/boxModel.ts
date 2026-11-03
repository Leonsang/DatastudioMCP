import { evaluateOn } from '../browser.js';
import { requireEditMode } from './report.js';
import { applyBoxModelScript } from './scripts.js';
import type { BoxModelResult, Padding } from './types.js';

const EVAL_TIMEOUT_MS = Number(process.env.LS_EVAL_TIMEOUT_MS ?? 15_000);

export interface SetBoxModelInput {
  componentId: string;
  padding?: number | Padding;
  dimensions?: { width: number; height: number };
  position?: { x: number; y: number };
}

export function normalizePadding(p: number | Padding | undefined): Padding | undefined {
  if (p === undefined) return undefined;
  if (typeof p === 'number') return { top: p, right: p, bottom: p, left: p };
  return p;
}

export async function setComponentBoxModel(input: SetBoxModelInput): Promise<BoxModelResult> {
  const { page } = await requireEditMode();
  const args = {
    componentId: input.componentId,
    ...(input.padding !== undefined ? { padding: normalizePadding(input.padding)! } : {}),
    ...(input.dimensions ? { dimensions: input.dimensions } : {}),
    ...(input.position ? { position: input.position } : {}),
  };
  const res = await evaluateOn(page, EVAL_TIMEOUT_MS, applyBoxModelScript, args);
  if (!res.ok) throw new Error(res.error ?? `No se pudo aplicar el box model a ${input.componentId}.`);
  return res;
}
