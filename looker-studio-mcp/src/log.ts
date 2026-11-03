/** Logging goes to stderr ONLY: stdout is reserved for the MCP STDIO transport. */
export function log(...args: unknown[]): void {
  process.stderr.write(
    `[looker-studio-mcp] ${args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a))).join(' ')}\n`,
  );
}
