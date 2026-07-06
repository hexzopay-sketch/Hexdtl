import { ScreenBuffer, THEME } from "@hexdtl/core";
import type { DebuggerState } from "@hexdtl/core";

export function renderDebuggerPanel(
  buf: ScreenBuffer,
  x: number,
  y: number,
  width: number,
  height: number,
  dbg: DebuggerState | null,
  scrollOffset: number,
): void {
  const cols = width - 2;
  const headerY = y;
  const sepY = headerY + 1;

  if (!dbg) {
    buf.writeString(x + 1, headerY, " Debugger — no debug session active", THEME.feedTable);
    for (let i = 0; i < cols; i++) buf.set(x + 1 + i, sepY, "─", THEME.border);
    buf.writeString(x + 1, sepY + 2, "Commands: :break <file:line>  :continue  :step  :next  :watch <expr>", THEME.dimText);
    return;
  }

  const status = dbg.paused ? " PAUSED " : " RUNNING ";
  const statusColor = dbg.paused ? THEME.feedError : THEME.feedExec;
  buf.writeString(x + 1, headerY, status, statusColor, -1, true);

  for (let i = 0; i < cols; i++) buf.set(x + 1 + i, sepY, "─", THEME.border);
  let row = sepY + 1;

  if (dbg.paused && dbg.callFrames.length > 0) {
    buf.writeString(x + 1, row, " Call Stack:", THEME.netHeader, -1, true);
    row++;

    const startFrame = Math.max(0, dbg.selectedFrame - scrollOffset);
    const endFrame = Math.min(dbg.callFrames.length, startFrame + Math.min(height - row + y, 10));

    for (let i = startFrame; i < endFrame; i++) {
      if (row >= y + height) break;
      const frame = dbg.callFrames[i];
      const isSel = i === dbg.selectedFrame;
      const marker = isSel ? "▸" : " ";
      const name = frame.functionName || "(anonymous)";
      const loc = `${truncUrl(frame.url)}:${frame.lineNumber}`;
      const fg = isSel ? THEME.srcSelected.fg : THEME.feedLog;
      const bg = isSel ? THEME.srcSelected.bg : -1;
      buf.set(x + 1, row, marker, fg, bg, isSel);
      buf.writeString(x + 3, row, `${name} at ${loc}`, fg, bg, isSel);
      row++;
    }

    if (dbg.scopeChain.length > 0) {
      if (row < y + height) {
        row++;
        buf.writeString(x + 1, row, " Scope:", THEME.netHeader, -1, true);
        row++;
      }
      for (const scope of dbg.scopeChain.slice(0, 5)) {
        if (row >= y + height) break;
        buf.writeString(x + 3, row, `[${scope.type}]`, THEME.srcKeyword);
        const vars = scope.variables.slice(0, 3).map(v => `${v.name} = ${truncStr(v.value, 15)}`);
        if (vars.length > 0) {
          buf.writeString(x + 3 + scope.type.length + 3, row, vars.join(", "), THEME.feedLog);
        }
        row++;
      }
    }
  }

  if (dbg.breakpoints.length > 0) {
    if (row < y + height) {
      row++;
      buf.writeString(x + 1, row, ` Breakpoints (${dbg.breakpoints.length}):`, THEME.netHeader, -1, true);
      row++;
    }
    for (const bp of dbg.breakpoints.slice(0, 5)) {
      if (row >= y + height) break;
      const mark = bp.enabled ? "●" : "○";
      const fg = bp.enabled ? THEME.feedError : THEME.dimText;
      buf.set(x + 1, row, mark, fg);
      buf.writeString(x + 3, row, `${truncUrl(bp.url)}:${bp.lineNumber}`, fg);
      row++;
    }
  }

  if (scrollOffset > 0) buf.set(x + width - 1, y, "▲", THEME.dimText);
}

function truncUrl(url: string): string {
  if (url.length <= 40) return url;
  return "..." + url.slice(-37);
}

function truncStr(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max - 3) + "...";
}
