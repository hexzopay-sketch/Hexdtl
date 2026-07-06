/**
 * Network panel — table view of HTTP requests with status, timing bars, and URLs.
 * htop-style: colored method/status, waterfall timing visualization.
 */

import { ScreenBuffer, THEME, TIMING_GRADIENT } from "@hexdtl/core";
import type { NetworkItem } from "../buffer-app.js";

const METHOD_FG: Record<string, number> = {
  GET: THEME.netMethodGet,
  POST: THEME.netMethodPost,
  PUT: THEME.netMethodPut,
  DELETE: THEME.netMethodDelete,
};

function statusColor(code: number): number {
  if (code >= 200 && code < 300) return THEME.netStatusOk;
  if (code >= 300 && code < 400) return THEME.netStatusWarn;
  if (code >= 400) return THEME.netStatusErr;
  return THEME.border;
}

export function renderNetworkPanel(
  buf: ScreenBuffer,
  x: number,
  y: number,
  width: number,
  height: number,
  items: NetworkItem[],
  scrollOffset: number,
  selectedIdx = -1,
): void {
  if (items.length === 0) {
    buf.writeString(x + 1, y + Math.floor(height / 2) - 1,
      "Waiting for network requests...",
      THEME.dimText);
    return;
  }

  const METHOD_W = 7;
  const STATUS_W = 5;
  const TIME_W = 8;
  const BAR_W = 12;
  const URL_W = width - METHOD_W - STATUS_W - TIME_W - BAR_W - 4;

  // Header
  let row = y;
  buf.writeString(x + 1, row, "METHOD", THEME.netHeader, -1, true);
  buf.writeString(x + 1 + METHOD_W, row, "STAT", THEME.netHeader, -1, true);
  buf.writeString(x + 1 + METHOD_W + STATUS_W, row, "URL", THEME.netHeader, -1, true);
  if (URL_W > 0) {
    buf.writeString(x + 1 + METHOD_W + STATUS_W + URL_W, row, "TIME", THEME.netHeader, -1, true);
    buf.writeString(x + 1 + METHOD_W + STATUS_W + URL_W + TIME_W, row, "WATERFALL", THEME.netHeader, -1, true);
  }
  row++;

  // Separator
  for (let i = 0; i < width - 1; i++) {
    buf.set(x + 1 + i, row, "─", THEME.border);
  }
  row++;

  // Items
  const maxRows = height - 2; // minus header + separator
  const startIdx = Math.max(0, items.length - maxRows - scrollOffset);
  const endIdx = items.length - scrollOffset;

  for (let idx = startIdx; idx < endIdx; idx++) {
    if (row >= y + height) break;
    if (idx < 0 || idx >= items.length) continue;

    const isSelected = items.length - 1 - idx === selectedIdx;
    const bg = isSelected ? THEME.highlight.bg : -1;
    const fgOverride = isSelected ? THEME.highlight.fg : -1;
    const bold = isSelected;

    const item = items[idx];
    const req = item.event.request;
    const res = item.event.response;

    // Highlight the full line background
    if (isSelected) {
      for (let i = 0; i < width - 1; i++) {
        buf.set(x + 1 + i, row, " ", -1, bg);
      }
    }

    // Method
    const methodFg = isSelected ? fgOverride : (METHOD_FG[req.method] ?? THEME.netUrl);
    buf.writeString(x + 1, row, req.method.slice(0, METHOD_W - 1).padEnd(METHOD_W - 1), methodFg, bg, bold);

    // Status
    const code = res?.statusCode ?? 0;
    const sColor = isSelected ? fgOverride : statusColor(code);
    const statusStr = code > 0 ? String(code) : "…";
    buf.writeString(x + 1 + METHOD_W, row, statusStr.padEnd(STATUS_W - 1), sColor, bg, bold);

    // URL
    const urlDisplay = truncate(req.url, URL_W);
    buf.writeString(x + 1 + METHOD_W + STATUS_W, row, urlDisplay, isSelected ? fgOverride : THEME.netUrl, bg, bold);

    // Time
    const dur = item.event.totalDurationMs;
    const timeStr = dur != null && dur > 0 ? `${Math.round(dur)}ms` : "…";
    buf.writeString(x + 1 + METHOD_W + STATUS_W + URL_W, row, timeStr.padEnd(TIME_W - 1), isSelected ? fgOverride : THEME.netTime, bg, bold);

    // Waterfall bar
    if (URL_W > 0) {
      const barX = x + 1 + METHOD_W + STATUS_W + URL_W + TIME_W;
      const timing = res?.timing;
      if (timing && dur != null && dur > 0) {
        const phases: Array<{ start: number; end: number; color: number }> = [];
        let offset = 0;

        if (timing.dns != null && timing.dns > 0) {
          phases.push({ start: offset, end: offset + timing.dns, color: TIMING_GRADIENT[0] });
          offset += timing.dns;
        }
        if (timing.connect != null && timing.connect > 0) {
          phases.push({ start: offset, end: offset + timing.connect, color: TIMING_GRADIENT[3] });
          offset += timing.connect;
        }
        if (timing.tls != null && timing.tls > 0) {
          phases.push({ start: offset, end: offset + timing.tls, color: TIMING_GRADIENT[5] });
          offset += timing.tls;
        }
        if (timing.send != null && timing.send > 0) {
          phases.push({ start: offset, end: offset + timing.send, color: TIMING_GRADIENT[7] });
          offset += timing.send;
        }
        if (timing.wait != null && timing.wait > 0) {
          phases.push({ start: offset, end: offset + timing.wait, color: TIMING_GRADIENT[9] });
          offset += timing.wait;
        }

        drawTimingBar(buf, barX, row, BAR_W, phases, dur);
      } else {
        for (let i = 0; i < BAR_W; i++) {
          buf.set(barX + i, row, " ", -1, THEME.border);
        }
      }
    }

    row++;
  }

  // Scroll indicator
  if (scrollOffset > 0) {
    buf.set(x + width - 1, y, "▲", THEME.dimText);
  }
  if (endIdx < items.length) {
    buf.set(x + width - 1, y + height - 1, "▼", THEME.dimText);
  }
}

function truncate(str: string, max: number): string {
  if (max <= 0) return "";
  if (str.length <= max) return str;
  return str.slice(0, max - 3) + "...";
}

function drawTimingBar(
  buf: ScreenBuffer,
  x: number,
  y: number,
  width: number,
  phases: Array<{ start: number; end: number; color: number }>,
  totalMs: number,
): void {
  for (let i = 0; i < width; i++) {
    const timeAtPos = (i / width) * totalMs;
    let color = -1;
    for (const phase of phases) {
      if (timeAtPos >= phase.start && timeAtPos < phase.end) {
        color = phase.color;
        break;
      }
    }
    if (color >= 0) {
      buf.set(x + i, y, " ", color, color);
    } else {
      buf.set(x + i, y, " ", -1, 8); // BRIGHT_BLACK
    }
  }
}
