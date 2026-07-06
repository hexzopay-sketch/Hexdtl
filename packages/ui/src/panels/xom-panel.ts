import { ScreenBuffer, THEME } from "@hexdtl/core";
import type { XOMNode } from "@hexdtl/core";

const TYPE_COLORS: Record<string, number> = {
  object: 39,
  array: 33,
  string: THEME.srcString,
  number: THEME.srcNumber,
  boolean: 33,
  "null": 8,
  undefined: 8,
  function: THEME.srcFunction,
  class: THEME.srcFunction,
  error: THEME.feedError,
  promise: 33,
  date: THEME.srcNumber,
  regexp: THEME.feedDebug,
  window: THEME.feedInfo,
  element: THEME.feedInfo,
  node: THEME.feedInfo,
  unknown: 8,
};

export function renderXOMPanel(
  buf: ScreenBuffer,
  x: number,
  y: number,
  width: number,
  height: number,
  root: XOMNode | null,
  scrollOffset: number,
): void {
  if (!root) {
    buf.writeString(x + 1, y + Math.floor(height / 2) - 1,
      "XOM: inspect an object with :inspect <expr> or :xom <expr>",
      THEME.dimText);
    buf.writeString(x + 1, y + Math.floor(height / 2) + 1,
      "Ximbiot Origin Manufacture — JavaScript object inspector",
      THEME.feedTable);
    return;
  }

  const lines: string[] = [];
  flattenNode(root, lines, 0, new Set());
  const visibleCount = Math.min(lines.length, height);
  const startIdx = Math.max(0, lines.length - visibleCount - scrollOffset);
  const endIdx = Math.min(lines.length, startIdx + visibleCount);

  let row = y;
  for (let i = startIdx; i < endIdx; i++) {
    if (row >= y + height) break;
    const line = lines[i];
    if (row < y) { row++; continue; }

    const indent = line.search(/\S/);
    const parts = line.split(" ");
    const name = parts[0]?.trim() || "";
    const rest = line.slice(name.length).trim();
    const isProto = name.startsWith("__proto__");
    const isGetter = rest.includes("[getter]");
    const color = isGetter ? THEME.feedWarn : isProto ? THEME.dimText : THEME.feedLog;

    buf.writeString(x + 1, row, line.slice(0, width - 2), color);
    row++;
  }

  if (scrollOffset > 0) {
    buf.set(x + width - 1, y, "▲", THEME.dimText);
  }
  if (endIdx < lines.length) {
    buf.set(x + width - 1, y + height - 1, "▼", THEME.dimText);
  }
}

function flattenNode(
  node: XOMNode,
  lines: string[],
  depth: number,
  visited: Set<number>,
): void {
  if (visited.has(node.id)) {
    lines.push("  ".repeat(depth) + "[circular]");
    return;
  }
  visited.add(node.id);

  const indent = "  ".repeat(depth);
  const prefix = node.expanded ? (node.children?.length ? "▼" : "▸") : "▸";
  const typeTag = node.type;
  const typeColor = TYPE_COLORS[typeTag] || 8;
  const val = node.value ? ` = ${truncStr(node.value, 40)}` : "";
  const preview = node.preview ? ` // ${truncStr(node.preview, 30)}` : "";

  if (node.getter) {
    lines.push(`${indent}${prefix} ${node.name} [getter/setter]`);
  } else {
    lines.push(`${indent}${prefix} ${node.name}${val}${preview}`);
  }

  if (node.expanded && node.children) {
    for (const child of node.children) {
      flattenNode(child, lines, depth + 1, visited);
    }
  }
}

function truncStr(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max - 3) + "...";
}
