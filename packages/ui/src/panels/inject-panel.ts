import { ScreenBuffer, THEME } from "@hexdtl/core";
import type { InjectResult } from "@hexdtl/core";

export function renderInjectPanel(
  buf: ScreenBuffer,
  x: number,
  y: number,
  width: number,
  height: number,
  history: InjectResult[],
  inputBuffer: string,
  inputCursor: number,
  scrollOffset: number,
): void {
  const headerY = y;
  buf.writeString(x + 1, headerY, " Code Injector — type JS and press Ctrl+Enter to run", THEME.feedTable);
  buf.set(x + width - 1, headerY, "", THEME.border);
  const sepY = headerY + 1;
  for (let i = 0; i < width - 1; i++) {
    buf.set(x + 1 + i, sepY, "─", THEME.border);
  }

  if (history.length === 0) {
    buf.writeString(x + 1, sepY + 2,
      "Examples: :inject console.log('hello')  or  type here and Ctrl+Enter",
      THEME.dimText);
  }

  const contentStart = sepY + 1;
  const contentEnd = y + height - 2;
  const contentHeight = contentEnd - contentStart;
  const visibleCount = Math.min(history.length, contentHeight);
  const startIdx = Math.max(0, history.length - visibleCount - scrollOffset);
  const endIdx = history.length - scrollOffset;

  let row = contentStart;
  for (let i = startIdx; i < endIdx; i++) {
    if (row >= contentEnd) break;
    if (i < 0 || i >= history.length) continue;
    const item = history[i];
    const fg = item.result.ok ? THEME.feedLog : THEME.feedError;
    const marker = item.result.ok ? "✓" : "✗";
    buf.set(x + 1, row, marker, fg, -1, true);
    buf.writeString(x + 3, row, truncStr(item.expression, width - 6), THEME.inputFg);
    row++;
    if (row >= contentEnd) break;
    buf.writeString(x + 3, row, truncStr(item.result.display, width - 5), fg);
    row++;
  }

  if (scrollOffset > 0) buf.set(x + width - 1, contentStart, "▲", THEME.dimText);
  if (endIdx < history.length) buf.set(x + width - 1, contentEnd - 1, "▼", THEME.dimText);

  const inputY = y + height - 1;
  for (let i = 0; i < width; i++) {
    buf.set(x + i, inputY, " ", THEME.inputFg, -1);
  }
  const prompt = " ⚡ ";
  buf.writeString(x, inputY, prompt, THEME.promptFg, -1, true);
  const avail = width - prompt.length - 1;
  const display = truncStr(inputBuffer, avail);
  buf.writeString(x + prompt.length, inputY, display, THEME.inputFg);
  const cx = x + prompt.length + Math.min(inputCursor, avail);
  const cc = inputBuffer[inputCursor] || " ";
  buf.set(cx, inputY, cc, THEME.inputFg, -1, false, false, false, true);
}

function truncStr(s: string, max: number): string {
  if (max <= 0) return "";
  if (s.length <= max) return s;
  return s.slice(0, max - 3) + "...";
}
