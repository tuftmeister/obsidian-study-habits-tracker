/**
 * Parse simple `key: value` pairs from a code block's source string.
 * Lines that don't match the pattern are silently ignored.
 */
export function parseConfig(source: string): Record<string, string> {
  const cfg: Record<string, string> = {};
  for (const line of source.split("\n")) {
    const m = line.match(/^\s*([\w-]+)\s*:\s*(.+?)\s*$/);
    if (m) cfg[m[1].toLowerCase()] = m[2];
  }
  return cfg;
}
