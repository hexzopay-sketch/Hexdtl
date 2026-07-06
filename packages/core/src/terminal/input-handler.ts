/**
 * Raw terminal input handler. Reads keypresses and dispatches to callbacks.
 * Supports: arrows, tab, escape, ctrl+key, printable characters.
 */

export interface KeyInfo {
  name: string;      // key name: "return", "escape", "tab", "space", "up", "down", "left", "right", etc.
  ctrl: boolean;
  meta: boolean;
  shift: boolean;
  sequence: string;  // raw byte sequence
  char?: string;     // printable character if applicable
}

type KeyCallback = (key: KeyInfo) => void;

const ESC = "\x1b";
const CSI = "\x1b[";

export class InputHandler {
  private stdin: NodeJS.ReadStream;
  private callbacks: KeyCallback[] = [];
  private running = false;
  private wasRaw = false;

  constructor(stdin: NodeJS.ReadStream = process.stdin) {
    this.stdin = stdin;
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.wasRaw = this.stdin.isRaw ?? false;
    this.stdin.setRawMode(true);
    this.stdin.resume();
    this.stdin.setEncoding("utf-8");
    this.stdin.on("data", this.onData);
  }

  stop(): void {
    if (!this.running) return;
    this.running = false;
    this.stdin.removeListener("data", this.onData);
    this.stdin.setRawMode(this.wasRaw);
    this.stdin.pause();
  }

  onKey(callback: KeyCallback): () => void {
    this.callbacks.push(callback);
    return () => {
      const idx = this.callbacks.indexOf(callback);
      if (idx >= 0) this.callbacks.splice(idx, 1);
    };
  }

  /** Feed raw input data for testing (bypasses stdin piping). */
  feed(data: string): void {
    const keys = this.parseInput(data);
    for (const key of keys) {
      if (key.name === "__ignore__") continue;
      for (const cb of this.callbacks) {
        cb(key);
      }
    }
  }

  private onData = (data: string): void => {
    this.feed(data);
  };

  parseInput(data: string): KeyInfo[] {
    const keys: KeyInfo[] = [];
    let i = 0;

    while (i < data.length) {
      if (data[i] === ESC) {
        // Escape sequence
        if (i + 1 < data.length && data[i + 1] === "[") {
          // CSI sequence
          const { key, consumed } = this.parseCSI(data, i);
          keys.push(key);
          i += consumed;
        } else if (i + 1 < data.length && data[i + 1] === "O") {
          // SS3 sequence (F1-F4, etc.)
          const { key, consumed } = this.parseSS3(data, i);
          keys.push(key);
          i += consumed;
        } else {
          // Bare escape
          keys.push({ name: "escape", ctrl: false, meta: false, shift: false, sequence: ESC });
          i++;
        }
      } else if (data[i] === "\r" || data[i] === "\n") {
        keys.push({ name: "return", ctrl: false, meta: false, shift: false, sequence: data[i] });
        i++;
      } else if (data[i] === "\t") {
        keys.push({ name: "tab", ctrl: false, meta: false, shift: false, sequence: "\t" });
        i++;
      } else if (data[i] === "\x7f") {
        keys.push({ name: "backspace", ctrl: false, meta: false, shift: false, sequence: "\x7f" });
        i++;
      } else if (data[i] === "\x00") {
        // Ctrl+Space / NUL
        keys.push({ name: "space", ctrl: true, meta: false, shift: false, sequence: "\x00", char: " " });
        i++;
      } else if (data[i] < "\x20") {
        // Control character
        const code = data.charCodeAt(i);
        const ctrlChar = String.fromCharCode(code + 96);
        keys.push({
          name: ctrlChar,
          ctrl: true,
          meta: false,
          shift: false,
          sequence: data[i],
          char: ctrlChar,
        });
        i++;
      } else {
        // Printable character
        keys.push({
          name: data[i],
          ctrl: false,
          meta: false,
          shift: false,
          sequence: data[i],
          char: data[i],
        });
        i++;
      }
    }

    return keys;
  }

  private parseCSI(data: string, start: number): { key: KeyInfo; consumed: number } {
    let i = start + 2; // skip \x1b[
    let params = "";

    // Parse parameter bytes
    while (i < data.length && data[i] >= "\x30" && data[i] <= "\x3f") {
      params += data[i];
      i++;
    }

    // Parse intermediate byte
    let intermediate = "";
    if (i < data.length && data[i] >= "\x20" && data[i] <= "\x2f") {
      intermediate = data[i];
      i++;
    }

    // Final byte
    const final = i < data.length ? data[i] : "";
    i++;

    const consumed = i - start;
    const seq = data.slice(start, i);

    // Map CSI sequences to key names
    const csiMap: Record<string, string | null> = {
      "A": "up",
      "B": "down",
      "C": "right",
      "D": "left",
      "H": "home",
      "F": "end",
      "Z": "backtab",
      "P": "delete",
      "M": null,  // mouse event — ignore
      "m": null,  // SGR mouse mode response — ignore
    };

    // SGR mouse events like \x1b[<64;47;24M — ignore
    if (params.startsWith("<")) {
      return {
        key: { name: "__ignore__", ctrl: false, meta: false, shift: false, sequence: data.slice(start, i) },
        consumed: i - start,
      };
    }

    const name = csiMap[final];
    if (name === null) {
      return {
        key: { name: "__ignore__", ctrl: false, meta: false, shift: false, sequence: data.slice(start, i) },
        consumed: i - start,
      };
    }
    if (name !== undefined) {
      return {
        key: {
          name,
          ctrl: false,
          meta: false,
          shift: false,
          sequence: seq,
        },
        consumed,
      };
    }

    // Handle ~ sequences (pageup, pagedown, delete, f5-f8, etc.)
    if (final === "~") {
      const tildeMap: Record<string, string> = {
        "5": "pageup",
        "6": "pagedown",
        "2": "insert",
        "3": "delete",
        "15": "f5",
        "17": "f6",
        "18": "f7",
        "19": "f8",
        "20": "f9",
        "21": "f10",
        "23": "f11",
        "24": "f12",
      };
      const tildeName = tildeMap[params];
      if (tildeName) {
        return {
          key: { name: tildeName, ctrl: false, meta: false, shift: false, sequence: seq },
          consumed,
        };
      }
    }

    // Unknown CSI sequence — ignore silently
    return {
      key: { name: "__ignore__", ctrl: false, meta: false, shift: false, sequence: seq },
      consumed,
    };
  }

  private parseSS3(data: string, start: number): { key: KeyInfo; consumed: number } {
    let i = start + 2; // skip \x1bO
    const final = i < data.length ? data[i] : "";
    i++;

    const ss3Map: Record<string, string> = {
      "P": "f1", "Q": "f2", "R": "f3", "S": "f4",
    };

    const name = ss3Map[final] ?? `ss3:${final}`;
    return {
      key: {
        name,
        ctrl: false,
        meta: false,
        shift: false,
        sequence: data.slice(start, i),
      },
      consumed: i - start,
    };
  }
}
