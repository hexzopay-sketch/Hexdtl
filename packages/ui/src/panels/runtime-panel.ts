/**
 * Runtime feed panel — renders console, exception, and execution events.
 * htop-style: colored timestamps, level indicators, scrolling.
 */

import { ScreenBuffer, THEME } from "@hexdtl/core";
import type { FeedItem } from "../buffer-app.js";

const LEVEL_FG: Record<string, number> = {
  log: THEME.feedLog,
  info: THEME.feedInfo,
  warn: THEME.feedWarn,
  error: THEME.feedError,
  debug: THEME.feedDebug,
  trace: THEME.feedTrace,
  table: THEME.feedTable,
};

function timeStr(ts: number): string {
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}:${String(d.getSeconds()).padStart(2, "0")}`;
}

export function renderRuntimePanel(
  buf: ScreenBuffer,
  x: number,
  y: number,
  width: number,
  height: number,
  items: FeedItem[],
  scrollOffset: number,
): void {
  if (items.length === 0) {
    buf.writeString(x + 1, y + Math.floor(height / 2) - 1, "waiting for activity...", THEME.dimText);
    return;
  }

  // Render from bottom up (newest at bottom, like htop)
  const visibleCount = Math.min(items.length, height);
  const startIdx = items.length - visibleCount - scrollOffset;
  const endIdx = items.length - scrollOffset;

  for (let i = startIdx; i < endIdx; i++) {
    if (i < 0 || i >= items.length) continue;
    const row = y + (i - startIdx);
    if (row < y || row >= y + height) continue;

    const item = items[i];
    const ts = timeStr(item.event.timestampMs);
    const tsLen = ts.length;

    // Timestamp
    buf.writeString(x + 1, row, ts, THEME.feedTimestamp);

    // Level/type indicator
    const indicatorX = x + 1 + tsLen + 1;

    if (item.kind === "console") {
      const level = item.event.level;
      const fg = LEVEL_FG[level] ?? THEME.feedLog;
      const label = level.toUpperCase().padEnd(5);
      buf.writeString(indicatorX, row, label, fg, -1, level === "error" || level === "warn");
      buf.writeString(indicatorX + 6, row, truncate(item.event.text, width - indicatorX + x - 6 - 2), fg);
    } else if (item.kind === "exception") {
      buf.writeString(indicatorX, row, "✖ ERR", THEME.feedException, -1, true);
      buf.writeString(indicatorX + 6, row, truncate(item.event.message, width - indicatorX + x - 6 - 2), THEME.feedException);
    } else {
      buf.writeString(indicatorX, row, "▸", THEME.feedExec);
      const loc = `${item.event.location.file}:${item.event.location.line}`;
      buf.writeString(indicatorX + 2, row, truncate(loc, width - indicatorX + x - 2 - 2), THEME.feedExec);
    }

    // Scroll indicator
    if (scrollOffset > 0 && i === startIdx) {
      const arrowY = y;
      buf.set(x + width - 1, arrowY, "▲", THEME.dimText);
    }
  }

  // Scroll indicator at bottom
  if (scrollOffset > 0) {
    buf.set(x + width - 1, y + height - 1, "▼", THEME.dimText);
  }
}

function truncate(str: string, max: number): string {
  if (max <= 0) return "";
  if (str.length <= max) return str;
  return str.slice(0, max - 3) + "...";
}
