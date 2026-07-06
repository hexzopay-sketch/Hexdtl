/**
 * htop-style screen buffer with diff-based rendering.
 * Updates only changed cells via ANSI escape sequences — no clear-screen, no newline redraws.
 */

export interface Cell {
  char: string;
  fg: number;   // ANSI color index (0-255) or -1 for default
  bg: number;   // ANSI color index (0-255) or -1 for default
  bold: boolean;
  dim: boolean;
  underline: boolean;
  reverse: boolean;
}

export const DEFAULT_CELL: Cell = { char: " ", fg: -1, bg: -1, bold: false, dim: false, underline: false, reverse: false };

function makeCell(char: string, fg = -1, bg = -1, bold = false, dim = false, underline = false, reverse = false): Cell {
  return { char, fg, bg, bold, dim, underline, reverse };
}

function cellsEqual(a: Cell, b: Cell): boolean {
  return a.char === b.char && a.fg === b.fg && a.bg === b.bg &&
    a.bold === b.bold && a.dim === b.dim && a.underline === b.underline && a.reverse === b.reverse;
}

export class ScreenBuffer {
  cols: number;
  rows: number;
  private current: Cell[][];
  private previous: Cell[][];

  constructor(cols: number, rows: number) {
    this.cols = cols;
    this.rows = rows;
    this.current = this.makeGrid();
    this.previous = this.makeGrid();
  }

  private makeGrid(): Cell[][] {
    return Array.from({ length: this.rows }, () =>
      Array.from({ length: this.cols }, () => ({ ...DEFAULT_CELL }))
    );
  }

  clear(): void {
    for (let y = 0; y < this.rows; y++) {
      for (let x = 0; x < this.cols; x++) {
        this.current[y][x] = { ...DEFAULT_CELL };
      }
    }
  }

  resize(cols: number, rows: number): void {
    const old = this.current;
    this.cols = cols;
    this.rows = rows;
    this.current = this.makeGrid();
    this.previous = this.makeGrid();
    // Copy old content
    for (let y = 0; y < Math.min(old.length, rows); y++) {
      for (let x = 0; x < Math.min(old[y].length, cols); x++) {
        this.current[y][x] = old[y][x];
      }
    }
  }

  set(x: number, y: number, char: string, fg = -1, bg = -1, bold = false, dim = false, underline = false, reverse = false): void {
    if (y < 0 || y >= this.rows || x < 0 || x >= this.cols) return;
    this.current[y][x] = makeCell(char, fg, bg, bold, dim, underline, reverse);
  }

  writeString(x: number, y: number, str: string, fg = -1, bg = -1, bold = false, dim = false): void {
    for (let i = 0; i < str.length; i++) {
      this.set(x + i, y, str[i], fg, bg, bold, dim);
    }
  }

  fillRect(x: number, y: number, w: number, h: number, char: string, fg = -1, bg = -1, bold = false, dim = false): void {
    for (let dy = 0; dy < h; dy++) {
      for (let dx = 0; dx < w; dx++) {
        this.set(x + dx, y + dy, char, fg, bg, bold, dim);
      }
    }
  }

  drawBox(x: number, y: number, w: number, h: number, fg = -1, bg = -1, bold = false): void {
    if (w < 2 || h < 2) return;
    const tl = "┌", tr = "┐", bl = "└", br = "┘", hor = "─", ver = "│";
    this.set(x, y, tl, fg, bg, bold);
    this.set(x + w - 1, y, tr, fg, bg, bold);
    this.set(x, y + h - 1, bl, fg, bg, bold);
    this.set(x + w - 1, y + h - 1, br, fg, bg, bold);
    for (let i = 1; i < w - 1; i++) {
      this.set(x + i, y, hor, fg, bg, bold);
      this.set(x + i, y + h - 1, hor, fg, bg, bold);
    }
    for (let i = 1; i < h - 1; i++) {
      this.set(x, y + i, ver, fg, bg, bold);
      this.set(x + w - 1, y + i, ver, fg, bg, bold);
    }
  }

  getCell(x: number, y: number): Cell {
    if (y < 0 || y >= this.rows || x < 0 || x >= this.cols) return { ...DEFAULT_CELL };
    return this.current[y][x];
  }

  /** Get all cells in a row (for testing). */
  getRow(y: number): Cell[] {
    if (y < 0 || y >= this.rows) return [];
    return [...this.current[y]];
  }

  /**
   * Diff current vs previous buffer and return ANSI escape sequence string
   * that transforms the terminal from previous state to current state.
   * Only emits sequences for cells that actually changed — true byte-level updates.
   */
  diff(): string {
    let out = "";
    let lastFg = -2, lastBg = -2;
    let lastBold = false, lastDim = false, lastUnderline = false, lastReverse = false;
    // Tracks the cell we last wrote to, so we only reposition the cursor
    // when the next changed cell isn't the terminal's natural next
    // position (i.e. immediately to the right, same row). Without this,
    // every single changed cell re-emits a cursor-move escape even when
    // consecutive cells changed, defeating the point of a byte-level diff.
    let lastWrittenX = -1, lastWrittenY = -1;

    for (let y = 0; y < this.rows; y++) {
      for (let x = 0; x < this.cols; x++) {
        const cur = this.current[y][x];
        const prev = this.previous[y][x];

        if (cellsEqual(cur, prev)) continue;

        const isContiguous = y === lastWrittenY && x === lastWrittenX + 1;
        if (!isContiguous) {
          out += `\x1b[${y + 1};${x + 1}H`;
        }

        // Reset style if attributes changed
        const styleChanged = cur.fg !== lastFg || cur.bg !== lastBg ||
          cur.bold !== lastBold || cur.dim !== lastDim ||
          cur.underline !== lastUnderline || cur.reverse !== lastReverse;

        if (styleChanged) {
          out += "\x1b[0m";
          lastFg = -2; lastBg = -2;
          lastBold = false; lastDim = false; lastUnderline = false; lastReverse = false;

          const attrs: string[] = [];
          if (cur.bold) attrs.push("1");
          if (cur.dim) attrs.push("2");
          if (cur.underline) attrs.push("4");
          if (cur.reverse) attrs.push("7");

          if (cur.fg >= 0) {
            if (cur.fg < 8) attrs.push(String(30 + cur.fg));
            else if (cur.fg < 16) attrs.push(String(90 + cur.fg - 8));
            else attrs.push(`38;5;${cur.fg}`);
          }
          if (cur.bg >= 0) {
            if (cur.bg < 8) attrs.push(String(40 + cur.bg));
            else if (cur.bg < 16) attrs.push(String(100 + cur.bg - 8));
            else attrs.push(`48;5;${cur.bg}`);
          }

          if (attrs.length > 0) out += `\x1b[${attrs.join(";")}m`;

          lastFg = cur.fg; lastBg = cur.bg;
          lastBold = cur.bold; lastDim = cur.dim;
          lastUnderline = cur.underline; lastReverse = cur.reverse;
        }

        out += cur.char;
        lastWrittenX = x;
        lastWrittenY = y;
      }
    }

    out += "\x1b[0m";
    return out;
  }

  /**
   * Finalize: copy current buffer to previous so next diff only shows changes.
   */
  finalize(): void {
    for (let y = 0; y < this.rows; y++) {
      for (let x = 0; x < this.cols; x++) {
        this.previous[y][x] = { ...this.current[y][x] };
      }
    }
  }

  /**
   * First render: the entire buffer is "changed" from empty.
   */
  fullRender(): string {
    // Clear previous so diff sees everything as new
    this.previous = this.makeGrid();
    const out = this.diff();
    this.finalize();
    return out;
  }
}

export { makeCell, cellsEqual };
