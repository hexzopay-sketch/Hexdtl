import { ScreenBuffer, THEME } from "@hexdtl/core";
import type { HexEditFile, SourceScript } from "@hexdtl/core";

export function renderHexEditPanel(
  buf: ScreenBuffer,
  x: number,
  y: number,
  width: number,
  height: number,
  scripts: SourceScript[],
  selectedScriptIdx: number,
  editor: HexEditFile | null,
  scrollOffset: number,
): void {
  const headerY = y;
  const cols = width - 2;

  if (!editor) {
    buf.writeString(x + 1, headerY, " HexEdit — nano-style source viewer/editor", THEME.feedTable);
    const sepY = headerY + 1;
    for (let i = 0; i < cols; i++) buf.set(x + 1 + i, sepY, "─", THEME.border);

    if (scripts.length === 0) {
      buf.writeString(x + 1, sepY + 2, "No scripts loaded. Use :open <script> to view a file.", THEME.dimText);
      return;
    }

    let row = sepY + 1;
    buf.writeString(x + 1, row, ` ${scripts.length} scripts available. Use :open <index|url>`, THEME.netHeader, -1, true);
    row++;

    for (let i = 0; i < Math.min(scripts.length, height - 3); i++) {
      if (row >= y + height) break;
      const s = scripts[i];
      const isSel = i === selectedScriptIdx;
      const marker = isSel ? "▸" : " ";
      const name = truncStr(s.url, cols - 10);
      const lines = s.source.split("\n").length;
      const fg = isSel ? THEME.srcSelected.fg : THEME.srcFile;
      const bg = isSel ? THEME.srcSelected.bg : -1;
      buf.set(x + 1, row, marker, fg, bg, isSel);
      buf.writeString(x + 3, row, `${name}  (${lines}L)`, fg, bg, isSel);
      row++;
    }

    if (scripts.length > height - 3) {
      buf.set(x + width - 1, y + height - 1, "▼", THEME.dimText);
    }
    return;
  }

  const mode = editor.modified ? " MODIFIED " : " VIEW ";
  const title = ` HexEdit${mode}${truncStr(editor.url, cols - 20)} `;
  buf.writeString(x + 1, headerY, title, THEME.feedError, -1, true);
  const sepY = headerY + 1;
  for (let i = 0; i < cols; i++) buf.set(x + 1 + i, sepY, "─", THEME.border);

  const lines = editor.source.split("\n");
  const contentY = sepY + 1;
  const contentH = height - 4;
  const lineNumW = String(lines.length).length + 1;
  const codeW = cols - lineNumW - 2;

  const startLine = Math.max(0, Math.min(
    lines.length - contentH,
    Math.max(0, lines.length - contentH - editor.scrollTop)
  ));
  const visibleLines = Math.min(contentH, lines.length - startLine);

  for (let i = 0; i < visibleLines; i++) {
    if (contentY + i >= y + height) break;
    const lineIdx = startLine + i;
    const line = lines[lineIdx] || "";
    const lineNum = String(lineIdx + 1).padStart(lineNumW - 1);
    const isCursorLine = lineIdx === editor.cursorRow;

    buf.writeString(x + 1, contentY + i, lineNum, THEME.srcLines);
    buf.set(x + 1 + lineNumW - 1, contentY + i, "│", THEME.border);

    const fg = isCursorLine ? THEME.feedLog : THEME.inputFg;
    const bg = isCursorLine ? 17 : -1;
    const displayLine = truncStr(line, codeW);
    if (isCursorLine && editor.cursorCol < displayLine.length) {
      buf.writeString(x + 1 + lineNumW, contentY + i, displayLine.slice(0, editor.cursorCol), fg, bg);
      const cursorChar = displayLine[editor.cursorCol] || " ";
      buf.set(x + 1 + lineNumW + editor.cursorCol, contentY + i, cursorChar, THEME.inputFg, 33, false, false, false, true);
      buf.writeString(x + 1 + lineNumW + editor.cursorCol + 1, contentY + i, displayLine.slice(editor.cursorCol + 1), fg, bg);
    } else {
      buf.writeString(x + 1 + lineNumW, contentY + i, displayLine, fg, bg);
    }
  }

  const statusY = y + height - 1;
  for (let i = 0; i < width; i++) buf.set(x + i, statusY, " ", THEME.statusBarFg, THEME.statusBarBg);
  const statusLeft = ` Ln ${editor.cursorRow + 1}, Col ${editor.cursorCol + 1} | ${lines.length} lines `;
  buf.writeString(x, statusY, statusLeft, THEME.statusBarFg, THEME.statusBarBg);
  const statusRight = editor.modified ? " [modified] Ctrl+S to save " : " [read-only] ";
  buf.writeString(x + width - statusRight.length, statusY, statusRight, THEME.feedWarn, THEME.statusBarBg);
}

function truncStr(s: string, max: number): string {
  if (max <= 0) return "";
  if (s.length <= max) return s;
  return s.slice(0, max - 3) + "...";
}
