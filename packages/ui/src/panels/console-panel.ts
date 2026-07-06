/**
 * Console panel — REPL-style interface for evaluating expressions.
 * Shows expression history and current input line.
 */

import { ScreenBuffer, THEME } from "@hexdtl/core";
import type { ConsoleEntry } from "@hexdtl/console";

export function renderConsolePanel(
  buf: ScreenBuffer,
  x: number,
  y: number,
  width: number,
  height: number,
  history: ConsoleEntry[],
  scrollOffset: number,
): void {
  if (history.length === 0) {
    buf.writeString(x + 1, y + Math.floor(height / 2) - 1,
      "Type an expression and press Enter — runs inside the process",
      THEME.dimText);
    return;
  }

  // Each entry takes 2 lines: prompt + expression, then result
  const lineCount = history.length * 2;
  const visibleLines = height;
  const startEntry = Math.max(0, Math.floor((lineCount - visibleLines - scrollOffset) / 2));
  const entries = history.slice(startEntry);

  let row = y;
  for (const entry of entries) {
    if (row >= y + height) break;

    // Prompt line: "> expression"
    buf.set(x + 1, row, ">", THEME.promptFg);
    buf.set(x + 2, row, " ", THEME.promptFg);
    const maxExpr = width - 4;
    buf.writeString(x + 3, row, truncate(entry.expression || "(empty)", maxExpr), THEME.inputFg);
    row++;

    if (row >= y + height) break;

    // Result line
    const fg = entry.result.ok ? THEME.resultOk : THEME.resultErr;
    const maxResult = width - 3;
    buf.writeString(x + 2, row, truncate(entry.result.display, maxResult), fg);
    row++;
  }

  // Scroll indicator
  if (scrollOffset > 0) {
    buf.set(x + width - 1, y, "▲", THEME.dimText);
  }
}

function truncate(str: string, max: number): string {
  if (max <= 0) return "";
  if (str.length <= max) return str;
  return str.slice(0, max - 3) + "...";
}
