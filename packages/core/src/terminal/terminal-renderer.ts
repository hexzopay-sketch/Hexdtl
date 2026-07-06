/**
 * High-level terminal renderer built on ScreenBuffer.
 * Provides ANSI escape utilities, cursor management, and htop-style drawing helpers.
 */

import { ScreenBuffer, type Cell, DEFAULT_CELL } from "./screen-buffer.js";
import { THEME } from "./colors.js";

export class TerminalRenderer {
  buffer: ScreenBuffer;
  private output: NodeJS.WriteStream;

  constructor(output: NodeJS.WriteStream = process.stdout) {
    this.output = output;
    const { columns = 80, rows = 24 } = output;
    this.buffer = new ScreenBuffer(columns, rows);
  }

  /** Get current terminal dimensions. */
  getSize(): { cols: number; rows: number } {
    return { cols: this.output.columns, rows: this.output.rows };
  }

  /** Check if terminal was resized. */
  checkResize(): boolean {
    const { columns = 80, rows = 24 } = this.output;
    if (columns !== this.buffer.cols || rows !== this.buffer.rows) {
      this.buffer.resize(columns, rows);
      return true;
    }
    return false;
  }

  /** Enter alternate screen buffer, hide cursor, disable mouse tracking. */
  enterAltScreen(): void {
    this.output.write("\x1b[?1049h");     // alt screen
    this.output.write("\x1b[?25l");       // hide cursor
    this.output.write("\x1b[?1000l");     // disable x10 mouse
    this.output.write("\x1b[?1002l");     // disable cell motion mouse
    this.output.write("\x1b[?1003l");     // disable all motion mouse
    this.output.write("\x1b[?1006l");     // disable SGR mouse mode
  }

  /** Leave alternate screen buffer, re-enable mouse. */
  leaveAltScreen(): void {
    this.output.write("\x1b[?25l");
    this.output.write("\x1b[?1006h");     // re-enable SGR mouse
    this.output.write("\x1b[?1049l");     // leave alt screen
    this.output.write("\x1b[?25h");       // show cursor
  }

  /** Show/hide cursor. */
  showCursor(show: boolean): void {
    this.output.write(show ? "\x1b[?25h" : "\x1b[?25l");
  }

  /** Move cursor to position. */
  moveTo(x: number, y: number): void {
    this.output.write(`\x1b[${y + 1};${x + 1}H`);
  }

  /** Clear screen. */
  clear(): void {
    this.output.write("\x1b[2J");
  }

  /** Flush diff to terminal. */
  flush(): void {
    const diff = this.buffer.diff();
    if (diff.length > 0) {
      this.output.write(diff);
    }
    this.buffer.finalize();
  }

  /** Full re-render (used on first paint or resize). */
  fullFlush(): void {
    this.output.write("\x1b[2J\x1b[H");
    const full = this.buffer.fullRender();
    if (full.length > 0) {
      this.output.write(full);
    }
  }

  // ── Drawing helpers ──────────────────────────────────────────

  /** Draw a horizontal line. */
  drawHLine(x: number, y: number, width: number, char = "─", fg = THEME.border): void {
    for (let i = 0; i < width; i++) {
      this.buffer.set(x + i, y, char, fg);
    }
  }

  /** Draw a vertical line. */
  drawVLine(x: number, y: number, height: number, char = "│", fg = THEME.border): void {
    for (let i = 0; i < height; i++) {
      this.buffer.set(x, y + i, char, fg);
    }
  }

  /** Draw a box with optional fill. */
  drawBox(x: number, y: number, w: number, h: number, fg = THEME.border, fillBg = -1): void {
    if (fillBg >= 0) {
      this.buffer.fillRect(x + 1, y + 1, w - 2, h - 2, " ", -1, fillBg);
    }
    this.buffer.drawBox(x, y, w, h, fg);
  }

  /** Draw a tab bar (htop-style), auto-trimming to fit terminal width. */
  drawTabBar(
    x: number,
    y: number,
    tabs: Array<{ label: string; key: string }>,
    activeKey: string,
  ): number {
    let cx = x;
    const maxX = this.buffer.cols - 2;
    for (const tab of tabs) {
      const label = ` ${tab.label} `;
      const remaining = maxX - cx;
      if (remaining <= 0) break;
      if (remaining < label.length) {
        // Show "…" for partially visible tab
        this.buffer.set(cx, y, "…", THEME.dimText);
        cx++;
        break;
      }
      const isActive = tab.key === activeKey;
      const style = isActive ? THEME.tabActive : THEME.tabInactive;
      for (let i = 0; i < label.length; i++) {
        this.buffer.set(cx + i, y, label[i], style.fg, style.bg, (style as { bold?: boolean }).bold ?? false);
      }
      cx += label.length + 1;
    }
    return cx - x;
  }

  /** Draw a status bar at the bottom of the screen. */
  drawStatusBar(y: number, left: string, right?: string): void {
    const { cols } = this.buffer;
    for (let x = 0; x < cols; x++) {
      this.buffer.set(x, y, " ", THEME.statusBarFg, THEME.statusBarBg);
    }
    this.buffer.writeString(0, y, left, THEME.statusBarFg, THEME.statusBarBg, true);
    if (right) {
      this.buffer.writeString(cols - right.length, y, right, THEME.statusBarKeyFg, THEME.statusBarBg);
    }
  }

  /** Draw a progress bar (htop-style). */
  drawProgressBar(x: number, y: number, width: number, fraction: number, fg: number, bg = BRIGHT_BLACK): void {
    const filled = Math.round(fraction * width);
    for (let i = 0; i < width; i++) {
      if (i < filled) {
        this.buffer.set(x + i, y, " ", fg, fg);
      } else {
        this.buffer.set(x + i, y, " ", -1, bg);
      }
    }
  }

  /** Draw a timing waterfall bar (like network timing). */
  drawTimingBar(x: number, y: number, width: number, phases: Array<{ start: number; end: number; color: number }>, totalMs: number): void {
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
        this.buffer.set(x + i, y, " ", color, color);
      } else {
        this.buffer.set(x + i, y, " ", -1, BRIGHT_BLACK);
      }
    }
  }

  /** Truncate string to fit width, adding "..." if needed. */
  truncate(str: string, maxWidth: number): string {
    if (str.length <= maxWidth) return str;
    if (maxWidth <= 3) return str.slice(0, maxWidth);
    return str.slice(0, maxWidth - 3) + "...";
  }

  /** Pad string to exact width. */
  padRight(str: string, width: number): string {
    return str.length >= width ? str.slice(0, width) : str + " ".repeat(width - str.length);
  }

  padLeft(str: string, width: number): string {
    return str.length >= width ? str.slice(0, width) : " ".repeat(width - str.length) + str;
  }
}

const BRIGHT_BLACK = 8;
