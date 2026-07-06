import { readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { homedir } from "node:os";
import { ScreenBuffer, THEME } from "@hexdtl/core";

export interface DirEntry {
  name: string;
  isDir: boolean;
  size: number;
  mode: string;
}

export interface FileManagerState {
  cwd: string;
  entries: DirEntry[];
  cursor: number;
  scroll: number;
}

export function initFileManagerState(cwd?: string): FileManagerState {
  const dir = cwd ? resolve(cwd) : process.cwd();
  return { cwd: dir, entries: [], cursor: 0, scroll: 0 };
}

export function refreshFileManagerState(state: FileManagerState): void {
  try {
    const entries = readdirSync(state.cwd, { withFileTypes: true });
    const dirs: DirEntry[] = [];
    const files: DirEntry[] = [];
    for (const e of entries) {
      if (e.name.startsWith(".") && e.name !== "..") continue;
      try {
        const s = statSync(join(state.cwd, e.name));
        const entry: DirEntry = {
          name: e.name,
          isDir: e.isDirectory(),
          size: s.size,
          mode: (s.mode & 0o777).toString(8).padStart(3, "0"),
        };
        (e.isDirectory() ? dirs : files).push(entry);
      } catch {
        // skip inaccessible
      }
    }
    dirs.sort((a, b) => a.name.localeCompare(b.name));
    files.sort((a, b) => a.name.localeCompare(b.name));
    state.entries = [...dirs, ...files];
    state.cursor = Math.min(state.cursor, Math.max(0, state.entries.length - 1));
    state.scroll = 0;
  } catch {
    state.entries = [];
    state.cursor = 0;
  }
}

export function renderFileManagerPanel(
  buf: ScreenBuffer,
  x: number,
  y: number,
  width: number,
  height: number,
  state: FileManagerState,
  scrollOffset: number,
): void {
  const headerY = y;
  const homeShr = homedir();
  const displayPath = state.cwd.startsWith(homeShr)
    ? "~" + state.cwd.slice(homeShr.length)
    : state.cwd;
  buf.writeString(x + 1, headerY, " " + displayPath, THEME.feedTable);
  for (let i = 0; i < width - 1; i++) {
    buf.set(x + 1 + i, headerY + 1, "─", THEME.border);
  }

  if (state.entries.length === 0) {
    buf.writeString(x + 2, headerY + 3, "(empty directory)", THEME.dimText);
    return;
  }

  const contentTop = headerY + 2;
  const contentHeight = height - 3;
  const startIdx = Math.max(0, state.entries.length - contentHeight - scrollOffset);
  const endIdx = state.entries.length - scrollOffset;
  const visibleCount = endIdx - startIdx;

  for (let i = 0; i < visibleCount; i++) {
    const idx = startIdx + i;
    if (idx < 0 || idx >= state.entries.length) break;
    const row = contentTop + i;
    if (row >= y + height - 1) break;

    const entry = state.entries[idx];
    const selected = idx === state.cursor;
    const fg = entry.isDir ? THEME.srcFunction : THEME.feedLog;
    const bg = selected ? THEME.tabActive.bg : -1;
    const bold = selected || entry.isDir;

    const icon = entry.isDir ? "📁" : " ";
    const marker = selected ? "▶" : " ";
    buf.writeString(x + 1, row, marker, THEME.feedWarn, bg);

    const sizeStr = entry.isDir ? "" : " " + formatSize(entry.size);
    const modeStr = " " + entry.mode;
    const nameMax = width - 16;
    const nameDisplay = entry.name.length > nameMax
      ? entry.name.slice(0, nameMax - 2) + ".."
      : entry.name;

    buf.writeString(x + 3, row, icon, fg, bg);
    buf.writeString(x + 5, row, " " + nameDisplay, fg, bg, bold);

    if (!entry.isDir) {
      buf.writeString(x + 5 + nameDisplay.length + 1, row, sizeStr, THEME.dimText, bg);
    }
    buf.writeString(x + width - 7, row, modeStr, THEME.dimText, bg);
  }

  if (scrollOffset > 0) buf.set(x + width - 1, contentTop, "▲", THEME.dimText);
  if (endIdx < state.entries.length) buf.set(x + width - 1, y + height - 2, "▼", THEME.dimText);
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
  if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + " MB";
  return (bytes / (1024 * 1024 * 1024)).toFixed(1) + " GB";
}
