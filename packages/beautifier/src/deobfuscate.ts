/**
 * Deobfuscation transforms for JavaScript code.
 * Reverses common obfuscation patterns without external dependencies.
 */

export interface DeobfuscationResult {
  source: string;
  transforms: string[];
}

/**
 * Apply deobfuscation transforms to JS source code.
 */
export function deobfuscate(source: string): DeobfuscationResult {
  let code = source;
  const transforms: string[] = [];

  // Transform 1: Decode hex unicode escapes
  const hexDecoded = code.replace(/\\x([0-9a-fA-F]{2})/g, (_, hex: string) => {
    const cp = parseInt(hex, 16);
    try { return String.fromCharCode(cp); } catch { return `\\x${hex}`; }
  });
  if (hexDecoded !== code) { transforms.push("decoded hex escapes"); code = hexDecoded; }

  // Transform 2: Decode unicode escapes
  const unicodeDecoded = code.replace(/\\u([0-9a-fA-F]{4})/g, (_, hex: string) => {
    const cp = parseInt(hex, 16);
    try { return String.fromCodePoint(cp); } catch { return `\\u${hex}`; }
  });
  if (unicodeDecoded !== code) { transforms.push("decoded unicode escapes"); code = unicodeDecoded; }

  // Transform 3: Replace hex number literals with decimal
  const hexToDec = code.replace(/\b0x([0-9a-fA-F]+)\b/g, (match, hex: string) => {
    const num = parseInt(hex, 16);
    if (num > 1000000) return match;
    return String(num);
  });
  if (hexToDec !== code) { transforms.push("converted hex literals"); code = hexToDec; }

  // Transform 4: Simplify boolean expressions
  const boolSimp = code.replace(/!0\b/g, "true").replace(/!1\b/g, "false");
  if (boolSimp !== code) { transforms.push("simplified booleans"); code = boolSimp; }

  // Transform 5: Replace void 0 with undefined
  const voidFix = code.replace(/\bvoid\s+0\b/g, "undefined");
  if (voidFix !== code) { transforms.push("replaced void 0"); code = voidFix; }

  // Transform 6: Decode base64 strings
  const b64Decoded = code.replace(/"([A-Za-z0-9+/]{40,}={0,2})"/g, (match, b64: string) => {
    try {
      const decoded = Buffer.from(b64, "base64").toString("utf-8");
      if (/^[\x20-\x7E\n\r\t]+$/.test(decoded)) {
        return JSON.stringify(decoded);
      }
      return match;
    } catch {
      return match;
    }
  });
  if (b64Decoded !== code) { transforms.push("decoded base64 strings"); code = b64Decoded; }

  // Transform 7: Remove empty statements
  const noEmpty = code.replace(/^;+$/gm, "");
  if (noEmpty !== code) { transforms.push("removed empty statements"); code = noEmpty; }

  return { source: code, transforms };
}
