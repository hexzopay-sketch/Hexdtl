/**
 * Sources panel — shows parsed scripts with syntax-highlighted preview.
 * Supports: script listing, source preview, search.
 */

import { ScreenBuffer, THEME } from "@hexdtl/core";
import type { SourceScript } from "@hexdtl/core";

export function renderSourcesPanel(
  buf: ScreenBuffer,
  x: number,
  y: number,
  width: number,
  height: number,
  scripts: SourceScript[],
  scrollOffset: number,
): void {
  if (scripts.length === 0) {
    buf.writeString(x + 1, y + Math.floor(height / 2) - 1,
      "No scripts loaded yet", THEME.dimText);
    return;
  }

  // Header
  let row = y;
  const decrypted = scripts.filter((s) => s.wasDecrypted).length;
  const headerText = ` ${scripts.length} scripts loaded `;
  buf.writeString(x + 1, row, headerText, THEME.netHeader, -1, true);
  if (decrypted > 0) {
    const decText = `(${decrypted} decrypted)`;
    buf.writeString(x + 1 + headerText.length, row, decText, THEME.srcDecrypted, -1, true);
  }
  row++;

  // Separator
  for (let i = 0; i < width - 1; i++) {
    buf.set(x + 1 + i, row, "─", THEME.border);
  }
  row++;

  // Script list
  const maxRows = height - 2;
  const startIdx = Math.max(0, Math.floor(scrollOffset / 3));
  const endIdx = Math.min(scripts.length, startIdx + Math.floor(maxRows / 3));

  for (let i = startIdx; i < endIdx; i++) {
    if (row >= y + height) break;
    const script = scripts[i];

    // Indicator
    const indicator = script.wasDecrypted ? "◆" : "▸";
    const indicatorFg = script.wasDecrypted ? THEME.srcDecrypted : THEME.srcFile;
    buf.set(x + 1, row, indicator, indicatorFg);

    // URL
    const displayUrl = truncateUrl(script.url, width - 12);
    buf.writeString(x + 3, row, displayUrl, indicatorFg);

    // Line count
    const lineCount = script.source.split("\n").length;
    const lineStr = `(${lineCount}L)`;
    buf.writeString(x + 3 + displayUrl.length + 1, row, lineStr, THEME.srcLines);
    row++;

    // Source preview
    if (row < y + height) {
      const preview = script.source.split("\n").slice(0, 2);
      for (const line of preview) {
        if (row >= y + height) break;
        const trimmed = line.slice(0, width - 5);
        highlightLine(buf, x + 5, row, trimmed);
        row++;
      }
    }
  }

  // Scroll indicators
  if (scrollOffset > 0) {
    buf.set(x + width - 1, y + 1, "▲", THEME.dimText);
  }
  if (endIdx < scripts.length) {
    buf.set(x + width - 1, y + height - 1, "▼", THEME.dimText);
  }
}

function truncateUrl(url: string, max: number): string {
  if (max <= 0) return "";
  if (url.length <= max) return url;
  return "..." + url.slice(-(max - 3));
}

function highlightLine(buf: ScreenBuffer, x: number, y: number, line: string): void {
  let col = 0;
  let i = 0;

  while (i < line.length && col < 200) {
    const ch = line[i];

    // Comments
    if (ch === "/" && line[i + 1] === "/") {
      buf.writeString(x + col, y, line.slice(i), THEME.srcComment);
      return;
    }

    // Strings
    if (ch === '"' || ch === "'" || ch === "`") {
      const quote = ch;
      let end = i + 1;
      while (end < line.length && line[end] !== quote) {
        if (line[end] === "\\") end++;
        end++;
      }
      end = Math.min(end + 1, line.length);
      buf.writeString(x + col, y, line.slice(i, end), THEME.srcString);
      col += end - i;
      i = end;
      continue;
    }

    // Keywords
    const kwMatch = line.slice(i).match(
      /^(const|let|var|function|return|if|else|for|while|do|switch|case|break|continue|class|extends|new|this|import|export|from|default|try|catch|finally|throw|async|await|yield|typeof|instanceof|in|of|null|undefined|true|false)\b/
    );
    if (kwMatch) {
      buf.writeString(x + col, y, kwMatch[0], THEME.srcKeyword, -1, true);
      col += kwMatch[0].length;
      i += kwMatch[0].length;
      continue;
    }

    // Numbers
    if (/[0-9]/.test(ch)) {
      let numEnd = i;
      while (numEnd < line.length && /[0-9.xXeEn]/.test(line[numEnd])) numEnd++;
      buf.writeString(x + col, y, line.slice(i, numEnd), THEME.srcNumber);
      col += numEnd - i;
      i = numEnd;
      continue;
    }

    // Function calls
    if (/[a-zA-Z_$]/.test(ch)) {
      let identEnd = i;
      while (identEnd < line.length && /[a-zA-Z0-9_$]/.test(line[identEnd])) identEnd++;
      const ident = line.slice(i, identEnd);
      const isFunc = identEnd < line.length && line[identEnd] === "(";
      buf.writeString(x + col, y, ident, isFunc ? THEME.srcFunction : THEME.srcKeyword);
      col += ident.length;
      i = identEnd;
      continue;
    }

    // Default
    buf.set(x + col, y, ch, THEME.srcComment);
    col++;
    i++;
  }
}
