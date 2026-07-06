/**
 * JavaScript/TypeScript beautifier — formats minified/uglified code
 * into readable, properly indented source. No external dependencies.
 */

export interface BeautifyOptions {
  indent?: string;
  maxLineLength?: number;
  preserveComments?: boolean;
}

const DEFAULT_OPTS: Required<BeautifyOptions> = {
  indent: "  ",
  maxLineLength: 80,
  preserveComments: true,
};

/**
 * Beautify JavaScript/TypeScript source code.
 * Handles minified code, encoded strings, single-line functions, etc.
 */
export function beautify(source: string, opts: BeautifyOptions = {}): string {
  const o = { ...DEFAULT_OPTS, ...opts };
  let code = source;

  // Phase 1: Normalize line endings
  code = code.replace(/\r\n?/g, "\n");

  // Phase 2: Decode encoded strings
  code = decodeEncodedStrings(code);

  // Phase 3: Insert newlines after statements
  code = insertNewlines(code);

  // Phase 4: Apply indentation
  code = applyIndentation(code, o.indent);

  // Phase 5: Clean up
  code = code.replace(/[ \t]+$/gm, ""); // trailing whitespace
  code = code.replace(/\n{3,}/g, "\n\n"); // max 2 blank lines

  return code.trimEnd() + "\n";
}

/**
 * Quick format — adds basic spacing without deep restructuring.
 */
export function quickFormat(source: string): string {
  let code = source;
  code = code.replace(/\r\n?/g, "\n");
  code = code.replace(/;(\S)/g, "; $1");
  code = code.replace(/\{(\S)/g, "{ $1");
  code = code.replace(/(\S)\}/g, "$1 }");
  code = code.replace(/\((\S)/g, "($1");
  code = code.replace(/(\S)\)/g, "$1)");
  return code.trimEnd() + "\n";
}

/**
 * Detect if code is likely minified.
 */
export function isMinified(source: string): boolean {
  const lines = source.split("\n");
  if (lines.length <= 2 && source.length > 200) return true;
  const avgLineLen = source.length / Math.max(lines.length, 1);
  if (avgLineLen > 200) return true;
  const noSpaceAfterSemicolon = /;[a-zA-Z$_{]/.test(source);
  const noSpaceBeforeBrace = /\){/.test(source);
  return noSpaceAfterSemicolon && noSpaceBeforeBrace;
}

function decodeEncodedStrings(code: string): string {
  // Decode \xNN hex escapes in strings
  code = code.replace(/\\x([0-9a-fA-F]{2})/g, (_, hex: string) =>
    String.fromCharCode(parseInt(hex, 16))
  );
  // Decode \uNNNN unicode escapes
  code = code.replace(/\\u([0-9a-fA-F]{4})/g, (_, hex: string) => {
    const cp = parseInt(hex, 16);
    try { return String.fromCodePoint(cp); } catch { return `\\u${hex}`; }
  });
  return code;
}

function insertNewlines(code: string): string {
  let result = "";
  let i = 0;
  let inString = false;
  let stringChar = "";
  let inTemplate = false;
  let inComment = false;
  let inBlockComment = false;
  let braceDepth = 0;

  while (i < code.length) {
    const ch = code[i];
    const next = i + 1 < code.length ? code[i + 1] : "";
    const prev = i > 0 ? code[i - 1] : "";

    // Handle comments
    if (!inString && !inTemplate && ch === "/" && next === "/") {
      inComment = true; result += ch; i++; continue;
    }
    if (!inString && !inTemplate && ch === "/" && next === "*") {
      inBlockComment = true; result += ch; i++; continue;
    }
    if (inComment) { result += ch; if (ch === "\n") inComment = false; i++; continue; }
    if (inBlockComment) {
      result += ch;
      if (ch === "*" && next === "/") { result += "/"; inBlockComment = false; i += 2; continue; }
      i++; continue;
    }

    // Handle template literals
    if (!inString && ch === "`") { inTemplate = !inTemplate; result += ch; i++; continue; }

    // Handle strings
    if ((ch === '"' || ch === "'") && !inTemplate) {
      if (inString && ch === stringChar && prev !== "\\") { inString = false; }
      else if (!inString) { inString = true; stringChar = ch; }
      result += ch; i++; continue;
    }

    if (inString || inTemplate) {
      result += ch;
      if (ch === "\\" && next) { result += next; i += 2; continue; }
      i++; continue;
    }

    // Track braces
    if (ch === "{") braceDepth++;
    if (ch === "}") braceDepth--;

    // Insert newline after semicolons
    if (ch === ";") {
      result += ";";
      if (!isForLoopSemicolon(code, i)) {
        result += "\n";
      }
      i++; continue;
    }

    // Insert newline after closing brace when followed by identifier/keyword
    if (ch === "}" && next && /[a-zA-Z$_]/.test(next) && braceDepth <= 0) {
      result += "}\n"; i++; continue;
    }

    result += ch; i++;
  }
  return result;
}

function isForLoopSemicolon(code: string, pos: number): boolean {
  let depth = 0;
  for (let i = pos - 1; i >= 0; i--) {
    if (code[i] === ")") depth++;
    if (code[i] === "(") {
      if (depth === 0) return code.slice(Math.max(0, i - 3), i).trim().endsWith("for");
      depth--;
    }
  }
  return false;
}

function applyIndentation(code: string, indent: string): string {
  const lines = code.split("\n");
  let depth = 0;
  const result: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) { result.push(""); continue; }

    if (trimmed.startsWith("}") || trimmed.startsWith(")") || trimmed.startsWith("]")) {
      depth = Math.max(0, depth - 1);
    }

    result.push(indent.repeat(depth) + trimmed);

    const opens = (trimmed.match(/{/g) || []).length;
    const closes = (trimmed.match(/}/g) || []).length;
    depth = Math.max(0, depth + opens - closes);
  }

  return result.join("\n");
}
