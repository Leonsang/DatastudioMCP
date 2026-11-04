/**
 * Security guards for the MCP server (agent-driven). The CLI is run by a human and only
 * uses assertReportUrl / sanitizeLearning.
 *
 *  - Writes are OFF by default in the MCP server: set LS_ALLOW_WRITE=1 to enable tools
 *    that modify the report, and additionally LS_ALLOW_DELETE=1 for destructive ones.
 *  - open_report only navigates to Data Studio / Looker Studio report URLs, so a prompt
 *    injection cannot drive the authenticated browser to an arbitrary site.
 *  - File paths given by the model must be .json files inside the workspace
 *    (LS_WORKSPACE or the current directory).
 *  - Learnings are data, never instructions: control chars stripped, length capped and
 *    anything that looks like a credential rejected.
 */
import { isAbsolute, relative, resolve } from 'node:path';

export class SecurityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SecurityError';
  }
}

export function writesAllowed(): boolean {
  return process.env.LS_ALLOW_WRITE === '1';
}

export function assertWrite(tool: string, destructive = false): void {
  if (!writesAllowed())
    throw new SecurityError(
      `${tool} modifica el informe y el servidor esta en modo solo lectura. ` +
        'Para habilitar escrituras arranca el MCP con LS_ALLOW_WRITE=1 (trabaja sobre una copia del informe).',
    );
  if (destructive && process.env.LS_ALLOW_DELETE !== '1')
    throw new SecurityError(`${tool} es destructiva: requiere ademas LS_ALLOW_DELETE=1 y confirmacion del usuario.`);
}

const REPORT_URL = /^https:\/\/(datastudio|lookerstudio)\.google\.com\/(u\/\d+\/)?reporting\/[A-Za-z0-9_-]+(\/[A-Za-z0-9_/-]*)?(\?[^#\s]*)?$/;

export function assertReportUrl(url: string): void {
  if (!REPORT_URL.test(url))
    throw new SecurityError('Solo se permiten URLs de informes: https://datastudio.google.com/reporting/<id>/... (o lookerstudio.google.com).');
}

export function workspaceDir(): string {
  return resolve(process.env.LS_WORKSPACE ?? process.cwd());
}

/** A .json path inside the workspace; returns the resolved absolute path. */
export function assertJsonPath(p: string): string {
  const abs = resolve(workspaceDir(), p);
  const rel = relative(workspaceDir(), abs);
  if (rel.startsWith('..') || isAbsolute(rel)) throw new SecurityError(`Ruta fuera del directorio de trabajo (${workspaceDir()}): ${p}`);
  if (!/\.json$/i.test(abs)) throw new SecurityError(`Solo se permiten archivos .json: ${p}`);
  return abs;
}

const SECRET = /(ya29\.[\w-]{10,}|AIza[\w-]{30,}|Bearer\s+[\w.-]{20,}|xsrf[\w-]*\s*[:=]|-----BEGIN|sessionid|SAPISID|__Secure-)/i;

export function sanitizeLearning(text: string): string {
  const clean = text.replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, ' ').trim().slice(0, 500);
  if (SECRET.test(clean)) throw new SecurityError('El texto parece contener una credencial; no se guarda.');
  return clean;
}
