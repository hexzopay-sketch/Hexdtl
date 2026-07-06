import { readFileSync, statSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { TerminalRenderer, InputHandler, THEME, ScreenBuffer, type KeyInfo } from "@hexdtl/core";
import type { EventBus, ConsoleEvent, ExceptionEvent, ExecutionEvent, NetworkEvent, SourceScript } from "@hexdtl/core";
import type {
  XOMNode, XOMInspection, InjectResult, HexEditFile,
  DebuggerState, DebuggerCallFrame, DebuggerScope, Breakpoint, DebuggerVariable, WatchExpression,
} from "@hexdtl/core";
import type { RuntimeInspector } from "@hexdtl/runtime";
import type { NetworkInspector } from "@hexdtl/network";
import type { SourcesInspector } from "@hexdtl/sources";
import { InteractiveConsole, type ConsoleEntry } from "@hexdtl/console";
import { renderRuntimePanel } from "./panels/runtime-panel.js";
import { renderConsolePanel } from "./panels/console-panel.js";
import { renderNetworkPanel } from "./panels/network-panel.js";
import { renderSourcesPanel } from "./panels/sources-panel.js";
import { renderXOMPanel } from "./panels/xom-panel.js";
import { renderInjectPanel } from "./panels/inject-panel.js";
import { renderHexEditPanel } from "./panels/hexedit-panel.js";
import { renderDebuggerPanel } from "./panels/debugger-panel.js";
import { renderFileManagerPanel, initFileManagerState, refreshFileManagerState, type FileManagerState } from "./panels/file-manager-panel.js";

export type PanelId = "runtime" | "console" | "network" | "sources" | "xom" | "inject" | "hexedit" | "debugger" | "filemgr";

interface AppState {
  panel: PanelId;
  feed: FeedItem[];
  networkItems: NetworkItem[];
  scripts: SourceScript[];
  history: ConsoleEntry[];
  inputBuffer: string;
  inputCursor: number;
  cursorVisible: boolean;
  cmdMode: boolean;
  cmdBuffer: string;
  statusMsg: string;
  statusMsgTimer: number;
  scrollTop: Record<string, number>;
  selectedIdx: number;
  busy: boolean;
  networkEnabled: boolean;
  sourcesEnabled: boolean;
  xomRoot: XOMNode | null;
  xomExpression: string;
  injectHistory: InjectResult[];
  injectBuffer: string;
  injectCursor: number;
  editor: HexEditFile | null;
  selectedScriptIdx: number;
  debugger: DebuggerState | null;
  watchExpressions: WatchExpression[];
  filterText: string;
  showHelp: boolean;
  helpScroll: number;
  splitMode: boolean;
  splitPanel: PanelId | null;
      networkSelectedIdx: number;
      networkDetailIdx: number;
      networkDetailExpanded: boolean;
      networkDetailScroll: number;
      networkDetailScrollX: number;
  fileMgr: FileManagerState;
}

export type FeedItem =
  | { kind: "console"; id: number; event: ConsoleEvent }
  | { kind: "exception"; id: number; event: ExceptionEvent }
  | { kind: "execution"; id: number; event: ExecutionEvent };

export type NetworkItem = {
  id: number;
  event: NetworkEvent;
};

export interface BufferAppOptions {
  bus: EventBus;
  runtime: RuntimeInspector;
  network?: NetworkInspector;
  sources?: SourcesInspector;
  targetLabel: string;
  childStdout?: NodeJS.ReadableStream | null;
}

const PANELS: Array<{ id: PanelId; label: string; key: string }> = [
  { id: "runtime", label: "Dev", key: "F1" },
  { id: "console", label: "Console", key: "F2" },
  { id: "network", label: "Network", key: "F3" },
  { id: "sources", label: "Sources", key: "F4" },
  { id: "xom", label: "XOM", key: "F5" },
  { id: "inject", label: "Inject", key: "F6" },
  { id: "hexedit", label: "HexEdit", key: "F7" },
  { id: "debugger", label: "Debug", key: "F8" },
  { id: "filemgr", label: "Files", key: "F9" },
];

const PANEL_ORDER: PanelId[] = ["runtime", "console", "network", "sources", "xom", "inject", "hexedit", "debugger", "filemgr"];

const MAX_FEED = 2000;
const MAX_NETWORK = 500;

const COMMANDS: Record<string, string> = {
  q: "quit",
  quit: "quit the inspector",
  h: "show this help",
  help: "show this help",
  clear: "clear current panel data",
  run: "switch to Runtime panel",
  runtime: "switch to Runtime panel",
  con: "switch to Console panel",
  console: "switch to Console panel",
  net: "switch to Network panel",
  network: "switch to Network panel",
  src: "switch to Sources panel",
  sources: "switch to Sources panel",
  xom: "inspect an object or switch to XOM panel (:xom <expr>)",
  inspect: "inspect an object (:inspect <expr>)",
  inj: "switch to Inject panel",
  inject: "inject JS code into the runtime (:inject <code>)",
  edit: "switch to HexEdit panel",
  hexedit: "switch to HexEdit panel",
  open: "open a script in HexEdit (:open <url|index>)",
  save: "save edited script to disk",
  dbg: "switch to Debugger panel",
  debugger: "switch to Debugger panel",
  break: "set a breakpoint (:break <file:line>)",
  step: "step over (debugger)",
  next: "step over",
  into: "step into",
  out: "step out",
  continue: "continue execution",
  watch: "watch an expression (:watch <expr>)",
  eval: "evaluate an expression (:eval <expr>)",
  filter: "filter panel content (:filter <text>)",
  find: "search for text (:find <text>)",
  top: "scroll to top",
  bottom: "scroll to bottom",
  scroll: "scroll to position (:scroll <n>)",
  export: "export panel data to file (:export <file>)",
  theme: "change theme (:theme <name>)",
  beautify: "beautify selected source",
  decrypt: "decrypt/rewrite encrypted code",
  split: "toggle split-screen mode",
  files: "switch to File Manager panel",
  filemgr: "switch to File Manager panel",
};

export class BufferApp {
  private renderer: TerminalRenderer;
  private input: InputHandler;
  private bus: EventBus;
  private runtime: RuntimeInspector;
  private network?: NetworkInspector;
  private sources?: SourcesInspector;
  private console: InteractiveConsole;
  private targetLabel: string;
  private childStdout?: NodeJS.ReadableStream | null;
  private capturedStdout: string[] = [];
  private capturingForConsole = false;
  private state: AppState;
  private idSeq = 0;
  private netIdSeq = 0;
  private framePending = false;
  private dirty = true;
  private running = false;
  private unsubs: Array<() => void> = [];
  private renderTimer: ReturnType<typeof setInterval> | null = null;
  private resolveExit?: () => void;

  constructor(opts: BufferAppOptions) {
    this.bus = opts.bus;
    this.runtime = opts.runtime;
    this.network = opts.network;
    this.sources = opts.sources;
    this.targetLabel = opts.targetLabel;
    this.console = new InteractiveConsole(opts.runtime);
    this.childStdout = opts.childStdout;

    this.renderer = new TerminalRenderer();
    this.input = new InputHandler();

    this.state = {
      panel: "runtime",
      feed: [],
      networkItems: [],
      scripts: [],
      history: [],
      inputBuffer: "",
      inputCursor: 0,
      cursorVisible: false,
      cmdMode: false,
      cmdBuffer: "",
      statusMsg: "",
      statusMsgTimer: 0,
      scrollTop: {},
      selectedIdx: 0,
      busy: false,
      networkEnabled: !!opts.network,
      sourcesEnabled: !!opts.sources,
      xomRoot: null,
      xomExpression: "",
      injectHistory: [],
      injectBuffer: "",
      injectCursor: 0,
      editor: null,
      selectedScriptIdx: 0,
      debugger: null,
      watchExpressions: [],
      filterText: "",
      showHelp: false,
      helpScroll: 0,
      splitMode: false,
      splitPanel: null,
      networkSelectedIdx: -1,
      networkDetailIdx: -1,
      networkDetailExpanded: false,
      networkDetailScroll: 0,
      networkDetailScrollX: 0,
      fileMgr: initFileManagerState(),
    };

    PANEL_ORDER.forEach(p => { this.state.scrollTop[p] = 0; });
    refreshFileManagerState(this.state.fileMgr);
  }

  async start(): Promise<void> {
    this.running = true;

    this.unsubs.push(
      this.bus.on("runtime:console", (e) => this.onConsoleEvent(e)),
      this.bus.on("runtime:exception", (e) => this.onExceptionEvent(e)),
      this.bus.on("runtime:execution", (e) => this.onExecEvent(e)),
      this.bus.on("runtime:paused", (e) => this.onPaused(e)),
      this.bus.on("runtime:resumed", () => this.onResumed()),
    );

    if (this.state.networkEnabled) {
      this.unsubs.push(
        this.bus.on("network:request", (e) => this.onNetRequest(e)),
        this.bus.on("network:response", (e) => this.onNetResponse(e)),
        this.bus.on("network:completed", (e) => this.onNetCompleted(e)),
      );
    }

    if (this.state.sourcesEnabled) {
      this.unsubs.push(
        this.bus.on("source:scriptParsed", (e) => this.onScriptParsed(e)),
      );
    }

    this.input.onKey((key) => this.handleKey(key));
    this.input.start();

    this.renderer.enterAltScreen();

    process.on("resize", () => {
      this.renderer.checkResize();
      this.dirty = true;
    });

    // Full initial paint
    this.renderer.fullFlush();

    // Pipe child stdout into the Dev feed so console.log output is visible
    // Also capture for console panel inline results
    if (this.childStdout) {
      this.childStdout.on("data", (chunk: Buffer) => {
        const text = chunk.toString().trimEnd();
        if (!text) return;
        // Capture for pending console evaluation
        if (this.capturingForConsole) {
          this.capturedStdout.push(text);
        }
        const lines = text.split("\n");
        for (const line of lines) {
          const trimmed = line.trimEnd();
          if (!trimmed) continue;
          this.idSeq++;
          this.state.feed.push({
            kind: "console",
            id: this.idSeq,
            event: {
              level: "log",
              args: [trimmed],
              text: trimmed,
              timestampMs: Date.now(),
            },
          });
          if (this.state.feed.length > MAX_FEED) this.state.feed.shift();
          this.dirty = true;
        }
      });
    }

    this.renderTimer = setInterval(() => {
      if (this.dirty) {
        this.render();
        this.dirty = false;
      }
    }, 33);
  }

  waitUntilExit(): Promise<void> {
    return new Promise<void>((resolve) => {
      this.resolveExit = resolve;
    });
  }

  destroy(): void {
    if (this.renderTimer) clearInterval(this.renderTimer);
    this.input.stop();
    for (const unsub of this.unsubs) unsub();
    this.renderer.leaveAltScreen();
    this.running = false;
    this.resolveExit?.();
  }

  // ── Event handlers ──────────────────────────────────────────

  private onConsoleEvent(event: ConsoleEvent): void {
    this.idSeq++;
    this.state.feed.push({ kind: "console", id: this.idSeq, event });
    if (this.state.feed.length > MAX_FEED) this.state.feed.shift();
    this.dirty = true;
  }

  private onExceptionEvent(event: ExceptionEvent): void {
    this.idSeq++;
    this.state.feed.push({ kind: "exception", id: this.idSeq, event });
    if (this.state.feed.length > MAX_FEED) this.state.feed.shift();
    this.dirty = true;
  }

  private onExecEvent(event: ExecutionEvent): void {
    this.idSeq++;
    this.state.feed.push({ kind: "execution", id: this.idSeq, event });
    if (this.state.feed.length > MAX_FEED) this.state.feed.shift();
    this.dirty = true;
  }

  private onNetRequest(event: NetworkEvent): void {
    this.netIdSeq++;
    this.state.networkItems.push({ id: this.netIdSeq, event });
    if (this.state.networkItems.length > MAX_NETWORK) this.state.networkItems.shift();
    this.dirty = true;
  }

  private onNetResponse(event: NetworkEvent): void {
    const item = this.state.networkItems.find((i) => i.event.request.id === event.request.id);
    if (item) item.event = event;
    this.dirty = true;
  }

  private onNetCompleted(event: NetworkEvent): void {
    const item = this.state.networkItems.find((i) => i.event.request.id === event.request.id);
    if (item) item.event = event;
    this.dirty = true;
  }

  private onScriptParsed(script: SourceScript): void {
    const exists = this.state.scripts.some((s) => s.scriptId === script.scriptId);
    if (!exists) this.state.scripts.push(script);
    this.dirty = true;
  }

  private onPaused(state: DebuggerState): void {
    this.state.debugger = state;
    this.setStatus("PAUSED at " + (state.callFrames[0]?.functionName || "entry"));
    this.dirty = true;
  }

  private onResumed(): void {
    if (this.state.debugger) {
      this.state.debugger.paused = false;
    }
    this.setStatus("resumed");
    this.dirty = true;
  }

  // ── Input handling ──────────────────────────────────────────

  private handleKey(key: KeyInfo): void {
    try {
      this._handleKeyImpl(key);
    } catch (err) {
      this.setStatus(`key error: ${(err as Error).message}`);
      this.dirty = true;
    }
  }

  private _handleKeyImpl(key: KeyInfo): void {
    if (key.name === "__ignore__") return;
    if (key.ctrl && key.char === "c") {
      this.destroy();
      return;
    }

    if (this.state.showHelp) {
      // Up/down/page/home/end scroll the help content
      if (key.name === "up" || key.name === "down" || key.name === "pageup" || key.name === "pagedown" || key.name === "home" || key.name === "end") {
        const totalLines = 42;
        const { rows } = this.renderer.getSize();
        const visible = rows - 4;
        const maxScroll = Math.max(0, totalLines - visible);
        if (key.name === "up") this.state.helpScroll = Math.min(this.state.helpScroll + 1, maxScroll);
        else if (key.name === "down") this.state.helpScroll = Math.max(this.state.helpScroll - 1, 0);
        else if (key.name === "pageup") this.state.helpScroll = Math.min(this.state.helpScroll + visible, maxScroll);
        else if (key.name === "pagedown") this.state.helpScroll = Math.max(this.state.helpScroll - visible, 0);
        else if (key.name === "home") this.state.helpScroll = maxScroll;
        else if (key.name === "end") this.state.helpScroll = 0;
        this.dirty = true;
        return;
      }
      // Left/right: dismiss help + cycle panel
      if (key.name === "left" || key.name === "right") {
        this.state.showHelp = false;
        const idx = PANEL_ORDER.indexOf(this.state.panel);
        const delta = key.name === "right" ? 1 : -1;
        this.state.panel = PANEL_ORDER[(idx + delta + PANEL_ORDER.length) % PANEL_ORDER.length];
        this.setStatus(this.state.panel);
        this.dirty = true;
        return;
      }
      // Tab / F-keys: dismiss help (press again to use)
      // Any other key: dismiss help
      this.state.showHelp = false;
      this.dirty = true;
      return;
    }

    if (this.state.cmdMode) {
      this.handleCmdInput(key);
      return;
    }

    // Enter command mode with ; or :
    if (key.name === ";" || key.name === ":") {
      this.state.cmdMode = true;
      this.state.cmdBuffer = "";
      this.dirty = true;
      this.setStatus("cmd");
      return;
    }

    if (key.name === "escape") {
      // Network detail overlay takes priority
      if (this.state.networkDetailIdx >= 0) {
        this.state.networkDetailIdx = -1;
        this.state.networkDetailExpanded = false;
        this.state.networkDetailScroll = 0;
        this.state.networkDetailScrollX = 0;
        this.dirty = true;
        this.setStatus("");
        return;
      }
      if (this.state.panel === "console") {
        this.state.inputBuffer = "";
        this.state.inputCursor = 0;
      } else if (this.state.panel === "inject") {
        this.state.injectBuffer = "";
        this.state.injectCursor = 0;
      }
      this.dirty = true;
      return;
    }

    // Ctrl+L — toggle split screen
    if (key.ctrl && key.char === "l") {
      this.state.splitMode = !this.state.splitMode;
      this.setStatus(`split ${this.state.splitMode ? "on" : "off"}`);
      this.dirty = true;
      return;
    }

    // Ctrl+R — jump to console
    if (key.ctrl && key.char === "r") {
      this.state.panel = "console";
      this.state.inputBuffer = "";
      this.state.inputCursor = 0;
      this.dirty = true;
      return;
    }

    // Tab — cycle panels
    if (key.name === "tab") {
      const idx = PANEL_ORDER.indexOf(this.state.panel);
      this.state.panel = PANEL_ORDER[(idx + 1) % PANEL_ORDER.length];
      this.setStatus(this.state.panel);
      this.dirty = true;
      return;
    }

    // F1-F8 — direct panel switch
    const fnMap: Record<string, PanelId> = {
      f1: "runtime", f2: "console", f3: "network", f4: "sources",
      f5: "xom", f6: "inject", f7: "hexedit", f8: "debugger", f9: "filemgr",
    };
    if (key.name in fnMap) {
      const target = fnMap[key.name];
      if (target === "network" && !this.state.networkEnabled) {
        this.setStatus("network not enabled");
      } else if (target === "sources" && !this.state.sourcesEnabled) {
        this.setStatus("sources not enabled");
      } else {
        this.state.panel = target;
        this.setStatus(target);
      }
      this.dirty = true;
      return;
    }

    // Arrow / scroll keys
    if (key.name === "up" || (key.ctrl && key.char === "p")) {
      if (this.state.networkDetailIdx >= 0) {
        this.state.networkDetailScroll = Math.max(0, this.state.networkDetailScroll - 1);
        this.dirty = true;
        return;
      }
      if (this.state.panel === "network" && this.state.networkItems.length > 0) {
        const max = this.state.networkItems.length - 1;
        this.state.networkSelectedIdx = Math.max(
          this.state.networkSelectedIdx < 0 ? max - 1 : this.state.networkSelectedIdx - 1,
          Math.min(this.state.networkItems.length - 1, 0)
        );
        this.ensureNetworkSelectionVisible();
      } else {
        this.scrollUp();
      }
      return;
    }
    if (key.name === "down" || (key.ctrl && key.char === "n")) {
      if (this.state.networkDetailIdx >= 0) {
        this.state.networkDetailScroll = this.state.networkDetailScroll + 1;
        this.dirty = true;
        return;
      }
      if (this.state.panel === "network" && this.state.networkItems.length > 0) {
        const max = this.state.networkItems.length - 1;
        this.state.networkSelectedIdx = Math.min(
          this.state.networkSelectedIdx < 0 ? 0 : this.state.networkSelectedIdx + 1,
          max
        );
        this.ensureNetworkSelectionVisible();
      } else {
        this.scrollDown();
      }
      return;
    }

    // Left/right scroll in network detail overlay
    if (key.name === "left" && this.state.networkDetailIdx >= 0) {
      this.state.networkDetailScrollX = Math.max(0, this.state.networkDetailScrollX - 8);
      this.dirty = true;
      return;
    }
    if (key.name === "right" && this.state.networkDetailIdx >= 0) {
      this.state.networkDetailScrollX = this.state.networkDetailScrollX + 8;
      this.dirty = true;
      return;
    }

    // Left/right cycle panels (except hexedit where they move cursor)
    if (key.name === "left" && !(this.state.panel === "hexedit" && this.state.editor)) {
      const idx = PANEL_ORDER.indexOf(this.state.panel);
      this.state.panel = PANEL_ORDER[(idx - 1 + PANEL_ORDER.length) % PANEL_ORDER.length];
      this.setStatus(this.state.panel);
      this.dirty = true;
      return;
    }
    if (key.name === "right" && !(this.state.panel === "hexedit" && this.state.editor)) {
      const idx = PANEL_ORDER.indexOf(this.state.panel);
      this.state.panel = PANEL_ORDER[(idx + 1) % PANEL_ORDER.length];
      this.setStatus(this.state.panel);
      this.dirty = true;
      return;
    }

    if (key.name === "return" || key.name === "enter") {
      if (this.state.networkDetailIdx >= 0) {
        this.state.networkDetailExpanded = !this.state.networkDetailExpanded;
        this.state.networkDetailScroll = 0;
        this.state.networkDetailScrollX = 0;
        this.dirty = true;
        return;
      }
    }
    // Ctrl+Space — inspect selected network request
    if (key.ctrl && key.name === "space") {
      if (this.state.panel === "network" && this.state.networkSelectedIdx >= 0) {
        this.state.networkDetailIdx = this.state.networkSelectedIdx;
        this.state.networkDetailExpanded = false;
        this.state.networkDetailScroll = 0;
        this.state.networkDetailScrollX = 0;
        this.dirty = true;
        this.setStatus(`inspecting #${this.state.networkSelectedIdx}`);
        return;
      }
    }
    if (key.name === "escape") {
      if (this.state.networkDetailIdx >= 0) {
        this.state.networkDetailIdx = -1;
        this.state.networkDetailExpanded = false;
        this.state.networkDetailScroll = 0;
        this.state.networkDetailScrollX = 0;
        this.dirty = true;
        return;
      }
    }
    if (key.name === "home") { this.scrollTop(); return; }
    if (key.name === "end") { this.scrollBottom(); return; }
    if (key.name === "pageup") { this.scrollPageUp(); return; }
    if (key.name === "pagedown") { this.scrollPageDown(); return; }

    // Panel-specific input handlers
    if (this.state.panel === "console") {
      this.handleConsoleInput(key);
    } else if (this.state.panel === "inject") {
      this.handleInjectInput(key);
    } else if (this.state.panel === "hexedit" && this.state.editor) {
      this.handleHexEditInput(key);
    } else if (this.state.panel === "xom") {
      this.handleXOMInput(key);
    } else if (this.state.panel === "debugger") {
      this.handleDebuggerInput(key);
    } else if (this.state.panel === "filemgr") {
      this.handleFileMgrInput(key);
    } else if (key.char && !key.ctrl && !key.meta && key.char >= " " && key.name !== "tab") {
      if (this.state.panel === "runtime" || this.state.panel === "network" || this.state.panel === "sources") {
        this.state.cmdMode = true;
        this.state.cmdBuffer = key.char;
        this.dirty = true;
      }
    }
  }

  private handleConsoleInput(key: KeyInfo): void {
    if (key.name === "return") {
      const expr = this.state.inputBuffer.trim();
      if (expr && !this.state.busy) {
        this.executeExpression(expr);
      }
      this.state.inputBuffer = "";
      this.state.inputCursor = 0;
      this.dirty = true;
      return;
    }
    if (key.ctrl && key.char === "d") {
      this.state.inputBuffer = "";
      this.state.inputCursor = 0;
      this.dirty = true;
      return;
    }
    if (key.name === "backspace") {
      if (this.state.inputCursor > 0) {
        this.state.inputBuffer =
          this.state.inputBuffer.slice(0, this.state.inputCursor - 1) +
          this.state.inputBuffer.slice(this.state.inputCursor);
        this.state.inputCursor--;
      }
      this.dirty = true;
      return;
    }
    if (key.name === "delete") {
      if (this.state.inputCursor < this.state.inputBuffer.length) {
        this.state.inputBuffer =
          this.state.inputBuffer.slice(0, this.state.inputCursor) +
          this.state.inputBuffer.slice(this.state.inputCursor + 1);
      }
      this.dirty = true;
      return;
    }
    if (key.ctrl && key.char === "u") {
      this.state.inputBuffer = "";
      this.state.inputCursor = 0;
      this.dirty = true;
      return;
    }
    if (key.ctrl && key.char === "a") {
      this.state.inputCursor = 0;
      this.dirty = true;
      return;
    }
    if (key.ctrl && key.char === "e") {
      this.state.inputCursor = this.state.inputBuffer.length;
      this.dirty = true;
      return;
    }
    if (key.ctrl && key.char === "p") {
      const hist = this.console.getExpressionHistory();
      if (hist.length > 0) {
        this.state.inputBuffer = hist[0];
        this.state.inputCursor = this.state.inputBuffer.length;
      }
      this.dirty = true;
      return;
    }
    if (key.char && !key.ctrl && !key.meta) {
      this.state.inputBuffer =
        this.state.inputBuffer.slice(0, this.state.inputCursor) +
        key.char +
        this.state.inputBuffer.slice(this.state.inputCursor);
      this.state.inputCursor++;
      this.dirty = true;
    }
  }

  private handleInjectInput(key: KeyInfo): void {
    if (key.ctrl && key.char === "m") {
      const expr = this.state.injectBuffer.trim();
      if (expr) {
        this.executeInject(expr);
      }
      this.state.injectBuffer = "";
      this.state.injectCursor = 0;
      this.dirty = true;
      return;
    }
    if (key.name === "return") {
      this.state.injectBuffer += "\n";
      this.dirty = true;
      return;
    }
    if (key.name === "backspace") {
      if (this.state.injectCursor > 0) {
        this.state.injectBuffer =
          this.state.injectBuffer.slice(0, this.state.injectCursor - 1) +
          this.state.injectBuffer.slice(this.state.injectCursor);
        this.state.injectCursor--;
      }
      this.dirty = true;
      return;
    }
    if (key.name === "delete") {
      if (this.state.injectCursor < this.state.injectBuffer.length) {
        this.state.injectBuffer =
          this.state.injectBuffer.slice(0, this.state.injectCursor) +
          this.state.injectBuffer.slice(this.state.injectCursor + 1);
      }
      this.dirty = true;
      return;
    }
    if (key.name === "home") {
      this.state.injectCursor = 0;
      this.dirty = true;
      return;
    }
    if (key.name === "end") {
      this.state.injectCursor = this.state.injectBuffer.length;
      this.dirty = true;
      return;
    }
    if (key.char && !key.ctrl) {
      this.state.injectBuffer =
        this.state.injectBuffer.slice(0, this.state.injectCursor) +
        key.char +
        this.state.injectBuffer.slice(this.state.injectCursor);
      this.state.injectCursor++;
      this.dirty = true;
    }
  }

  private handleHexEditInput(key: KeyInfo): void {
    if (!this.state.editor) return;
    if (key.name === "escape") {
      this.state.editor = null;
      this.setStatus("closed editor");
      this.dirty = true;
      return;
    }
    if (key.ctrl && key.char === "s") {
      this.setStatus("source saved (write to disk not yet implemented)");
      this.dirty = true;
      return;
    }
    if (key.name === "up") {
      if (this.state.editor.cursorRow > 0) this.state.editor.cursorRow--;
      this.dirty = true;
      return;
    }
    if (key.name === "down") {
      const lines = this.state.editor.source.split("\n");
      if (this.state.editor.cursorRow < lines.length - 1) this.state.editor.cursorRow++;
      this.dirty = true;
      return;
    }
    if (key.name === "left") {
      if (this.state.editor.cursorCol > 0) this.state.editor.cursorCol--;
      this.dirty = true;
      return;
    }
    if (key.name === "right") {
      const line = this.state.editor.source.split("\n")[this.state.editor.cursorRow] || "";
      if (this.state.editor.cursorCol < line.length) this.state.editor.cursorCol++;
      this.dirty = true;
      return;
    }
    if (key.name === "home") {
      this.state.editor.cursorCol = 0;
      this.dirty = true;
      return;
    }
    if (key.name === "end") {
      const line = this.state.editor.source.split("\n")[this.state.editor.cursorRow] || "";
      this.state.editor.cursorCol = line.length;
      this.dirty = true;
      return;
    }
    if (key.name === "pageup") {
      this.state.editor.cursorRow = Math.max(0, this.state.editor.cursorRow - 20);
      this.state.editor.scrollTop = Math.max(0, this.state.editor.scrollTop - 20);
      this.dirty = true;
      return;
    }
    if (key.name === "pagedown") {
      const lines = this.state.editor.source.split("\n");
      this.state.editor.cursorRow = Math.min(lines.length - 1, this.state.editor.cursorRow + 20);
      this.state.editor.scrollTop = Math.max(0, Math.min(lines.length, this.state.editor.scrollTop + 20));
      this.dirty = true;
      return;
    }
    if (key.char && !key.ctrl) {
      const lines = this.state.editor.source.split("\n");
      const line = lines[this.state.editor.cursorRow] || "";
      const newLine = line.slice(0, this.state.editor.cursorCol) + key.char + line.slice(this.state.editor.cursorCol);
      lines[this.state.editor.cursorRow] = newLine;
      this.state.editor.source = lines.join("\n");
      this.state.editor.cursorCol++;
      this.state.editor.modified = true;
      this.dirty = true;
      return;
    }
    if (key.name === "backspace") {
      if (this.state.editor.cursorCol > 0) {
        const lines = this.state.editor.source.split("\n");
        const line = lines[this.state.editor.cursorRow] || "";
        lines[this.state.editor.cursorRow] = line.slice(0, this.state.editor.cursorCol - 1) + line.slice(this.state.editor.cursorCol);
        this.state.editor.source = lines.join("\n");
        this.state.editor.cursorCol--;
        this.state.editor.modified = true;
        this.dirty = true;
      }
      return;
    }
    if (key.name === "delete") {
      const lines = this.state.editor.source.split("\n");
      const line = lines[this.state.editor.cursorRow] || "";
      if (this.state.editor.cursorCol < line.length) {
        lines[this.state.editor.cursorRow] = line.slice(0, this.state.editor.cursorCol) + line.slice(this.state.editor.cursorCol + 1);
        this.state.editor.source = lines.join("\n");
        this.state.editor.modified = true;
        this.dirty = true;
      }
      return;
    }
    if (key.name === "return") {
      const lines = this.state.editor.source.split("\n");
      const line = lines[this.state.editor.cursorRow] || "";
      const indent = line.match(/^\s*/)?.[0] || "";
      lines[this.state.editor.cursorRow] = line.slice(0, this.state.editor.cursorCol);
      lines.splice(this.state.editor.cursorRow + 1, 0, indent + line.slice(this.state.editor.cursorCol));
      this.state.editor.source = lines.join("\n");
      this.state.editor.cursorRow++;
      this.state.editor.cursorCol = indent.length;
      this.state.editor.modified = true;
      this.dirty = true;
      return;
    }
  }

  private handleXOMInput(key: KeyInfo): void {
    if (key.name === "return" && this.state.xomRoot) {
      if (this.state.xomRoot.expanded) {
        this.state.xomRoot.expanded = false;
      } else {
        this.state.xomRoot.expanded = true;
      }
      this.dirty = true;
      return;
    }
    if (key.name === "down") {
      this.state.selectedIdx = Math.min(
        (this.state.xomRoot?.children?.length || 0) - 1,
        this.state.selectedIdx + 1
      );
      this.dirty = true;
      return;
    }
    if (key.name === "up") {
      this.state.selectedIdx = Math.max(0, this.state.selectedIdx - 1);
      this.dirty = true;
      return;
    }
  }

  private handleDebuggerInput(key: KeyInfo): void {
    if (key.name === "f5") {
      this.resumeExecution();
      return;
    }
    if (key.name === "f10") {
      this.stepOver();
      return;
    }
    if (key.name === "f11") {
      this.stepInto();
      return;
    }
  }

  private handleFileMgrInput(key: KeyInfo): void {
    const fm = this.state.fileMgr;
    if (key.name === "return" || key.name === "enter") {
      const entry = fm.entries[fm.cursor];
      if (!entry) return;
      if (entry.isDir) {
        const target = entry.name === ".." ? fm.cwd : join(fm.cwd, entry.name);
        const resolved = resolve(target);
        try {
          statSync(resolved); // ensure accessible
          fm.cwd = resolved;
          refreshFileManagerState(fm);
          this.setStatus(fm.cwd);
        } catch {
          this.setStatus("cannot access " + resolved);
        }
      } else {
        // Open file: try to launch in editor using sources panel mechanism
        const absPath = join(fm.cwd, entry.name);
        try {
          const source = readFileSync(absPath, "utf-8");
          this.state.editor = {
            scriptId: "file:" + absPath,
            url: absPath,
            source,
            modified: false,
            cursorRow: 0,
            cursorCol: 0,
            scrollTop: 0,
          };
          this.state.panel = "hexedit";
          this.setStatus("opened " + entry.name);
        } catch {
          this.setStatus("cannot open " + entry.name);
        }
      }
      this.dirty = true;
      return;
    }
    if (key.name === "backspace") {
      const parent = dirname(fm.cwd);
      if (parent !== fm.cwd) {
        fm.cwd = parent;
        refreshFileManagerState(fm);
        this.setStatus(fm.cwd);
        this.dirty = true;
      }
      return;
    }
    if (key.name === "up") {
      if (fm.cursor > 0) fm.cursor--;
      this.ensureFileMgrVisible();
      this.dirty = true;
      return;
    }
    if (key.name === "down") {
      if (fm.cursor < fm.entries.length - 1) fm.cursor++;
      this.ensureFileMgrVisible();
      this.dirty = true;
      return;
    }
    if (key.name === "home") {
      fm.cursor = 0;
      fm.scroll = 0;
      this.dirty = true;
      return;
    }
    if (key.name === "end") {
      fm.cursor = Math.max(0, fm.entries.length - 1);
      this.ensureFileMgrVisible();
      this.dirty = true;
      return;
    }
    if (key.name === "pageup") {
      const pageSize = this.getContentHeight();
      fm.cursor = Math.max(0, fm.cursor - pageSize);
      this.ensureFileMgrVisible();
      this.dirty = true;
      return;
    }
    if (key.name === "pagedown") {
      const pageSize = this.getContentHeight();
      fm.cursor = Math.min(fm.entries.length - 1, fm.cursor + pageSize);
      this.ensureFileMgrVisible();
      this.dirty = true;
      return;
    }
  }

  private ensureFileMgrVisible(): void {
    const fm = this.state.fileMgr;
    const contentHeight = this.getContentHeight() - 1;
    if (fm.cursor < fm.scroll) {
      fm.scroll = fm.cursor;
    } else if (fm.cursor >= fm.scroll + contentHeight) {
      fm.scroll = fm.cursor - contentHeight + 1;
    }
  }

  // ── Command mode ─────────────────────────────────────────────

  private handleCmdInput(key: KeyInfo): void {
    if (key.name === "escape") {
      this.state.cmdMode = false;
      this.state.cmdBuffer = "";
      this.dirty = true;
      return;
    }
    if (key.name === "return") {
      this.executeCmd(this.state.cmdBuffer.trim());
      this.state.cmdMode = false;
      this.state.cmdBuffer = "";
      this.dirty = true;
      return;
    }
    if (key.name === "backspace") {
      this.state.cmdBuffer = this.state.cmdBuffer.slice(0, -1);
      this.dirty = true;
      return;
    }
    if (key.ctrl && key.char === "u") {
      this.state.cmdBuffer = "";
      this.dirty = true;
      return;
    }
    if (key.char && !key.ctrl) {
      this.state.cmdBuffer += key.char;
      this.dirty = true;
    }
  }

  private executeCmd(cmd: string): void {
    if (!cmd) return;

    const parts = cmd.split(/\s+/);
    const main = parts[0].toLowerCase();
    const args = parts.slice(1);

    // ── Quit ──
    if (main === "q" || main === "quit") {
      this.destroy();
      return;
    }

    // ── Help ──
    if (main === "h" || main === "help") {
      this.state.showHelp = true;
      this.state.helpScroll = 0;
      this.dirty = true;
      return;
    }

    // ── Clear ──
    if (main === "clear") {
      this.state.feed = [];
      this.state.networkItems = [];
      this.state.scripts = [];
      this.state.history = [];
      this.state.injectHistory = [];
      this.state.watchExpressions = [];
      this.state.xomRoot = null;
      this.setStatus("cleared all panels");
      return;
    }

    // ── Panel switching ──
    const panelMap: Record<string, PanelId> = {
      run: "runtime", runtime: "runtime",
      con: "console", console: "console",
      net: "network", network: "network",
      src: "sources", sources: "sources", source: "sources",
      xom: "xom",
      inj: "inject",
      inject: "inject",
      edit: "hexedit", hexedit: "hexedit",
      dbg: "debugger", debugger: "debugger",
      files: "filemgr", filemgr: "filemgr", fm: "filemgr",
    };

    if (main === "xom" && args.length > 0) {
      this.inspectObject(args.join(" "));
      this.state.panel = "xom";
      return;
    }

    if (main === "inspect" && args.length > 0) {
      this.inspectObject(args.join(" "));
      this.state.panel = "xom";
      return;
    }

    // ── Network detail expand/collapse ──
    if ((main === "exp" || main === "=exp") && this.state.networkDetailIdx >= 0) {
      this.state.networkDetailExpanded = true;
      this.state.networkDetailScroll = 0;
      this.state.networkDetailScrollX = 0;
      this.setStatus("expanded");
      return;
    }
    if ((main === "cl" || main === "=cl") && this.state.networkDetailIdx >= 0) {
      this.state.networkDetailExpanded = false;
      this.state.networkDetailScroll = 0;
      this.state.networkDetailScrollX = 0;
      this.setStatus("collapsed");
      return;
    }

    if (main in panelMap) {
      const target = panelMap[main];
      if (target === "network" && !this.state.networkEnabled) {
        this.setStatus("network not enabled");
      } else if (target === "sources" && !this.state.sourcesEnabled) {
        this.setStatus("sources not enabled");
      } else {
        this.state.panel = target;
        this.setStatus(target);
      }
      return;
    }

    // ── Inject code ──
    if (main === "inject" && args.length > 0) {
      this.executeInject(args.join(" "));
      this.state.panel = "inject";
      return;
    }

    // ── Eval ──
    if (main === "eval" && args.length > 0) {
      this.state.panel = "console";
      this.executeExpression(args.join(" "));
      return;
    }

    // ── Open script in HexEdit ──
    if (main === "open") {
      if (args.length > 0) {
        const query = args.join(" ");
        const idx = parseInt(query);
        if (!isNaN(idx) && idx >= 0 && idx < this.state.scripts.length) {
          this.openScript(idx);
        } else {
          const found = this.state.scripts.findIndex(s => s.url.includes(query));
          if (found >= 0) this.openScript(found);
          else this.setStatus(`no script matching "${query}"`);
        }
      } else {
        this.state.panel = "hexedit";
        this.setStatus("hexedit");
      }
      return;
    }

    // ── Save edited source ──
    if (main === "save") {
      if (this.state.editor) {
        this.setStatus("source saved (write to disk not yet implemented)");
      } else {
        this.setStatus("no file open in editor");
      }
      return;
    }

    // ── Breakpoint ──
    if (main === "break" && args.length >= 1) {
      const bpSpec = args[0];
      const match = bpSpec.match(/^(.+?):(\d+)(?::(\d+))?$/);
      if (match) {
        const url = match[1];
        const line = parseInt(match[2]);
        const col = match[3] ? parseInt(match[3]) : undefined;
        this.setBreakpoint(url, line, col);
      } else {
        this.setStatus(`invalid breakpoint spec: ${bpSpec} (use file:line)`);
      }
      return;
    }

    // ── Debugger controls ──
    if (main === "step" || main === "next") {
      this.stepOver();
      return;
    }
    if (main === "into") {
      this.stepInto();
      return;
    }
    if (main === "out") {
      this.stepOut();
      return;
    }
    if (main === "continue" || main === "cont") {
      this.resumeExecution();
      return;
    }

    // ── Watch expression ──
    if (main === "watch" && args.length > 0) {
      this.addWatch(args.join(" "));
      return;
    }

    // ── Filter ──
    if (main === "filter" && args.length > 0) {
      this.state.filterText = args.join(" ");
      this.setStatus(`filter: "${this.state.filterText}"`);
      return;
    }
    if (main === "filter" && args.length === 0) {
      this.state.filterText = "";
      this.setStatus("filter cleared");
      return;
    }

    // ── Find ──
    if (main === "find" && args.length > 0) {
      this.state.filterText = args.join(" ");
      this.setStatus(`search: "${this.state.filterText}"`);
      return;
    }

    // ── Scroll ──
    if (main === "scroll" && args.length > 0) {
      const n = parseInt(args[0]);
      if (!isNaN(n)) {
        this.state.scrollTop[this.state.panel] = n;
        this.dirty = true;
      }
      return;
    }

    if (main === "top" || main === "home") {
      this.scrollTop();
      return;
    }

    if (main === "bottom" || main === "end") {
      this.scrollBottom();
      return;
    }

    // ── Split screen ──
    if (main === "split") {
      this.state.splitMode = !this.state.splitMode;
      this.setStatus(`split ${this.state.splitMode ? "on" : "off"}`);
      return;
    }

    // ── Beautify selected source ──
    if (main === "beautify") {
      this.beautifySource();
      return;
    }

    // ── Decrypt/rewrite encrypted code ──
    if (main === "decrypt" || main === "rewrite") {
      this.decryptSource();
      return;
    }

    // ── Theme ──
    if (main === "theme" && args.length > 0) {
      this.setStatus(`theme "${args[0]}" set (theme switching coming soon)`);
      return;
    }

    // ── Export ──
    if (main === "export" && args.length > 0) {
      this.setStatus(`export to ${args[0]} (coming soon)`);
      return;
    }

    // ── Unknown command — try as JS expression ──
    this.setStatus(`eval: ${cmd}`);
    this.executeExpression(cmd);
  }

  // ── Actions ──────────────────────────────────────────────────

  private async executeExpression(expr: string): Promise<void> {
    this.state.busy = true;
    this.capturedStdout = [];
    this.capturingForConsole = true;
    this.dirty = true;
    const entry = await this.console.run(expr);
    // Wait a tick for any late-arriving stdout from the child
    await new Promise(r => setTimeout(r, 10));
    this.capturingForConsole = false;
    // If we got stdout output, use it as the display instead of bare "undefined"
    if (this.capturedStdout.length > 0 && entry.result.display === "undefined") {
      entry.result.display = this.capturedStdout.join("\n");
    }
    this.state.history.push(entry);
    this.state.busy = false;
    this.dirty = true;
  }

  private async executeInject(code: string): Promise<void> {
    const result = await this.runtime.evaluate(code);
    const entry: InjectResult = {
      expression: code,
      result,
      timestampMs: Date.now(),
    };
    this.state.injectHistory.push(entry);
    this.setStatus(result.ok ? "injected ✓" : "inject failed ✗");
    this.dirty = true;
  }

  private async inspectObject(expression: string): Promise<void> {
    this.state.xomExpression = expression;
    try {
      const result = await this.runtime.evaluate(expression);
      if (result.ok) {
        const value = result.value;
        const type = typeof value;
        const root: XOMNode = {
          id: 1,
          name: expression,
          type: type as XOMNode["type"],
          value: result.display,
          expanded: true,
          depth: 0,
          children: await this.buildXOMTree(value, 2, 0),
        };
        this.state.xomRoot = root;
        this.setStatus(`inspected ${expression}`);
      } else {
        this.setStatus(`inspect failed: ${result.error}`);
      }
    } catch (err) {
      this.setStatus(`inspect error: ${(err as Error).message}`);
    }
    this.dirty = true;
  }

  private async buildXOMTree(value: unknown, nextId: number, depth: number): Promise<XOMNode[]> {
    if (depth > 3 || value == null || typeof value !== "object") return [];
    const children: XOMNode[] = [];
    try {
      if (Array.isArray(value)) {
        for (let i = 0; i < Math.min(value.length, 20); i++) {
          const item = value[i];
          const itemType = typeof item;
          children.push({
            id: nextId++,
            name: String(i),
            type: itemType as XOMNode["type"],
            value: formatPreview(item),
            expanded: false,
            depth: depth + 1,
            children: [],
          });
        }
        if (value.length > 20) {
          children.push({
            id: nextId++,
            name: `... ${value.length - 20} more items`,
            type: "unknown",
            expanded: false,
            depth: depth + 1,
          });
        }
      } else {
        const keys = Object.keys(value as Record<string, unknown>).slice(0, 30);
        for (const key of keys) {
          const val = (value as Record<string, unknown>)[key];
          const valType = typeof val;
          children.push({
            id: nextId++,
            name: key,
            type: valType as XOMNode["type"],
            value: formatPreview(val),
            expanded: false,
            depth: depth + 1,
            children: [],
          });
        }
      }
    } catch {
      // cross-origin or inaccessible
    }
    return children;
  }

  private async setBreakpoint(url: string, line: number, col?: number): Promise<void> {
    const bp: Breakpoint = {
      id: `${url}:${line}`,
      url,
      lineNumber: line,
      columnNumber: col,
      enabled: true,
    };
    if (this.state.debugger) {
      const existing = this.state.debugger.breakpoints.findIndex(b => b.id === bp.id);
      if (existing >= 0) {
        this.state.debugger.breakpoints.splice(existing, 1);
        this.setStatus(`removed breakpoint ${bp.id}`);
      } else {
        this.state.debugger.breakpoints.push(bp);
        this.setStatus(`breakpoint set: ${bp.id}`);
      }
    } else {
      this.state.debugger = {
        paused: false,
        callFrames: [],
        breakpoints: [bp],
        scopeChain: [],
        selectedFrame: 0,
      };
      this.setStatus(`breakpoint set: ${bp.id}`);
    }
    this.dirty = true;
  }

  private async stepOver(): Promise<void> {
    this.setStatus("step over");
    this.dirty = true;
  }

  private async stepInto(): Promise<void> {
    this.setStatus("step into");
    this.dirty = true;
  }

  private async stepOut(): Promise<void> {
    this.setStatus("step out");
    this.dirty = true;
  }

  private async resumeExecution(): Promise<void> {
    this.setStatus("resumed");
    if (this.state.debugger) {
      this.state.debugger.paused = false;
    }
    this.dirty = true;
  }

  private addWatch(expression: string): void {
    const watch: WatchExpression = {
      id: this.state.watchExpressions.length + 1,
      expression,
      value: "evaluating...",
    };
    this.state.watchExpressions.push(watch);
    this.runtime.evaluate(expression).then(result => {
      watch.value = result.display;
      if (!result.ok) watch.error = result.error;
      this.dirty = true;
    });
    this.setStatus(`watching: ${expression}`);
    this.dirty = true;
  }

  private openScript(idx: number): void {
    if (idx < 0 || idx >= this.state.scripts.length) return;
    const script = this.state.scripts[idx];
    this.state.editor = {
      scriptId: script.scriptId,
      url: script.url,
      source: script.source,
      modified: false,
      cursorRow: 0,
      cursorCol: 0,
      scrollTop: 0,
    };
    this.state.selectedScriptIdx = idx;
    this.state.panel = "hexedit";
    this.setStatus(`opened ${script.url}`);
    this.dirty = true;
  }

  private async beautifySource(): Promise<void> {
    try {
      const { beautify } = await import("@hexdtl/beautifier");
      if (this.state.editor) {
        const result = beautify(this.state.editor.source);
        this.state.editor.source = result;
        this.state.editor.modified = true;
        this.setStatus("beautified ✓");
      } else if (this.state.scripts.length > 0) {
        const s = this.state.scripts[this.state.selectedScriptIdx];
        const result = beautify(s.source);
        this.state.editor = {
          scriptId: s.scriptId,
          url: s.url,
          source: result,
          modified: true,
          cursorRow: 0,
          cursorCol: 0,
          scrollTop: 0,
        };
        this.state.panel = "hexedit";
        this.setStatus("beautified ✓");
      } else {
        this.setStatus("no source to beautify");
      }
    } catch (err) {
      this.setStatus(`beautify error: ${(err as Error).message}`);
    }
    this.dirty = true;
  }

  private async decryptSource(): Promise<void> {
    try {
      const { beautify, deobfuscate } = await import("@hexdtl/beautifier");
      if (this.state.editor) {
        const deob = deobfuscate(this.state.editor.source);
        const result = beautify(deob.source);
        this.state.editor.source = result;
        this.state.editor.modified = true;
        const summary = deob.transforms.length > 0 ? deob.transforms.join(", ") : "✓";
        this.setStatus(`decrypted: ${summary}`);
      } else if (this.state.scripts.length > 0) {
        const s = this.state.scripts[this.state.selectedScriptIdx];
        const deob = deobfuscate(s.source);
        const result = beautify(deob.source);
        this.state.editor = {
          scriptId: s.scriptId,
          url: s.url,
          source: result,
          modified: true,
          cursorRow: 0,
          cursorCol: 0,
          scrollTop: 0,
        };
        this.state.panel = "hexedit";
        const summary = deob.transforms.length > 0 ? deob.transforms.join(", ") : "✓";
        this.setStatus(`decrypted: ${summary}`);
      } else {
        this.setStatus("no source to decrypt");
      }
    } catch (err) {
      this.setStatus(`decrypt error: ${(err as Error).message}`);
    }
    this.dirty = true;
  }

  // ── Helpers ──────────────────────────────────────────────────

  private setStatus(msg: string): void {
    this.state.statusMsg = msg;
    this.state.statusMsgTimer = Date.now();
    this.dirty = true;
  }

  // ── Scrolling ────────────────────────────────────────────────

  private getContentHeight(): number {
    const { rows } = this.renderer.getSize();
    return rows - 4;
  }

  private getMaxScroll(): number {
    const { panel, feed, networkItems, scripts, history, injectHistory, xomRoot, editor } = this.state;
    const contentHeight = this.getContentHeight();
    switch (panel) {
      case "runtime": return Math.max(0, feed.length - contentHeight);
      case "console": return Math.max(0, history.length - contentHeight);
      case "network": return Math.max(0, networkItems.length - contentHeight);
      case "sources": return Math.max(0, scripts.length - contentHeight);
      case "inject": return Math.max(0, injectHistory.length - contentHeight);
      case "xom": return xomRoot ? Math.max(0, 30 - contentHeight) : 0;
      case "hexedit": return editor ? Math.max(0, editor.source.split("\n").length - contentHeight) : 0;
      case "debugger": return this.state.debugger ? Math.max(0, 20 - contentHeight) : 0;
      case "filemgr": return Math.max(0, this.state.fileMgr.entries.length - contentHeight);
      default: return 0;
    }
  }

  private scrollUp(): void {
    const max = this.getMaxScroll();
    const key = this.state.panel;
    this.state.scrollTop[key] = Math.min((this.state.scrollTop[key] || 0) + 1, max);
    this.dirty = true;
  }

  private scrollDown(): void {
    const key = this.state.panel;
    this.state.scrollTop[key] = Math.max((this.state.scrollTop[key] || 0) - 1, 0);
    this.dirty = true;
  }

  private scrollTop(): void {
    this.state.scrollTop[this.state.panel] = this.getMaxScroll();
    this.dirty = true;
  }

  private scrollBottom(): void {
    this.state.scrollTop[this.state.panel] = 0;
    this.dirty = true;
  }

  private scrollPageUp(): void {
    const contentHeight = this.getContentHeight();
    const max = this.getMaxScroll();
    const key = this.state.panel;
    this.state.scrollTop[key] = Math.min((this.state.scrollTop[key] || 0) + contentHeight, max);
    this.dirty = true;
  }

  private scrollPageDown(): void {
    const contentHeight = this.getContentHeight();
    const key = this.state.panel;
    this.state.scrollTop[key] = Math.max((this.state.scrollTop[key] || 0) - contentHeight, 0);
    this.dirty = true;
  }

  private ensureNetworkSelectionVisible(): void {
    const idx = this.state.networkSelectedIdx;
    if (idx < 0) return;
    const contentHeight = this.getContentHeight() - 2;
    const items = this.state.networkItems.length;
    const scroll = this.state.scrollTop.network || 0;
    // Items are rendered from end: idx maps to visRow = (items - 1 - idx) - scroll
    const visRow = (items - 1 - idx) - scroll;
    if (visRow < 0) {
      this.state.scrollTop.network = (items - 1 - idx);
    } else if (visRow >= contentHeight) {
      this.state.scrollTop.network = (items - 1 - idx) - contentHeight + 1;
    }
    this.dirty = true;
  }

  // ── Rendering ────────────────────────────────────────────────

  private render(): void {
    this.renderer.checkResize();
    const { cols, rows } = this.renderer.getSize();
    const buf = this.renderer.buffer;

    buf.clear();

    // ── Header bar (row 0) ──
    for (let x = 0; x < cols; x++) {
      buf.set(x, 0, " ", THEME.headerFg, THEME.headerBg, THEME.headerBold);
    }
    const headerText = ` ⌘ HexDTL `;
    buf.writeString(0, 0, headerText, THEME.headerFg, THEME.headerBg, true);
    const attachText = ` ${this.targetLabel} `;
    buf.writeString(headerText.length, 0, attachText, THEME.headerFg, THEME.headerBg);

    const statusAge = Date.now() - this.state.statusMsgTimer;
    if (this.state.statusMsg && statusAge < 5000) {
      const statusText = ` │ ${this.state.statusMsg}`;
      const maxStatus = cols - headerText.length - attachText.length - 2;
      const display = statusText.length > maxStatus ? statusText.slice(0, maxStatus) : statusText;
      const flashFg = statusAge < 1000 ? THEME.feedWarn : THEME.headerFg;
      buf.writeString(cols - display.length - 1, 0, display, flashFg, THEME.headerBg);
    }

    // ── Tab bar (row 1) ──
    for (let x = 0; x < cols; x++) {
      buf.set(x, 1, " ", THEME.statusBarFg, THEME.statusBarBg);
    }
    this.renderer.drawTabBar(1, 1, PANELS.map(p => ({
      label: p.label,
      key: p.id,
    })), this.state.panel);

    // ── Help overlay ──
    if (this.state.showHelp) {
      this.renderHelpOverlay(buf, cols, rows);
      this.renderer.flush();
      return;
    }

    // ── Content area ──
    const contentTop = 2;
    const contentBottom = this.state.splitMode ? rows - 4 : rows - 2;
    const contentHeight = contentBottom - contentTop;

    if (this.state.splitMode) {
      const halfW = Math.floor((cols - 1) / 2);
      this.renderPanel(buf, 0, contentTop, halfW, contentHeight, this.state.panel);
      buf.set(halfW, contentTop, "│", THEME.border);
      for (let i = contentTop + 1; i < contentBottom; i++) {
        buf.set(halfW, i, "│", THEME.border);
      }
      const splitTarget = this.state.splitPanel || (
        this.state.panel === "runtime" ? "console" : "runtime"
      );
      this.renderPanel(buf, halfW + 1, contentTop, cols - halfW - 1, contentHeight, splitTarget);
    } else {
      this.renderPanel(buf, 0, contentTop, cols, contentHeight, this.state.panel);
    }

    // ── Network detail overlay ──
    if (this.state.networkDetailIdx >= 0) {
      this.renderNetworkDetailOverlay(buf, cols, rows);
    }

    // ── Bottom bars ──
    if (!this.state.splitMode) {
      this.renderInputBar(rows, cols);
      this.renderStatusBar(rows, cols);
    } else {
      this.renderSplitInputBar(rows, cols);
      this.renderSplitStatusBar(rows, cols);
    }

    // ── Flush to terminal ──
    this.renderer.flush();
  }

  private renderPanel(
    buf: ScreenBuffer, x: number, y: number, w: number, h: number, panel: PanelId
  ): void {
    const scroll = this.state.scrollTop[panel] || 0;

    switch (panel) {
      case "runtime":
        renderRuntimePanel(buf, x, y, w, h, this.state.feed, scroll);
        break;
      case "console":
        renderConsolePanel(buf, x, y, w, h, this.state.history, scroll);
        break;
      case "network":
        renderNetworkPanel(buf, x, y, w, h, this.state.networkItems, scroll, this.state.networkSelectedIdx);
        break;
      case "sources":
        renderSourcesPanel(buf, x, y, w, h, this.state.scripts, scroll);
        break;
      case "xom":
        renderXOMPanel(buf, x, y, w, h, this.state.xomRoot, scroll);
        break;
      case "inject":
        renderInjectPanel(buf, x, y, w, h, this.state.injectHistory, this.state.injectBuffer, this.state.injectCursor, scroll);
        break;
      case "hexedit":
        renderHexEditPanel(buf, x, y, w, h, this.state.scripts, this.state.selectedScriptIdx, this.state.editor, scroll);
        break;
      case "debugger":
        renderDebuggerPanel(buf, x, y, w, h, this.state.debugger, scroll);
        break;
      case "filemgr":
        renderFileManagerPanel(buf, x, y, w, h, this.state.fileMgr, scroll);
        break;
    }
  }

  private renderNetworkDetailOverlay(buf: ScreenBuffer, cols: number, rows: number): void {
    const item = this.state.networkItems[this.state.networkDetailIdx];
    if (!item) return;
    const { request, response, totalDurationMs, decodedBody } = item.event;
    const expanded = this.state.networkDetailExpanded;
    const scroll = this.state.networkDetailScroll;
    const scrollX = this.state.networkDetailScrollX;

    const boxW = Math.min(90, cols - 4);
    const boxH = Math.min(28, rows - 4);
    const bx = Math.floor((cols - boxW) / 2);
    const by = Math.floor((rows - boxH) / 2);

    buf.fillRect(bx, by, boxW, boxH, " ", -1, 0);
    for (let i = 0; i < boxW; i++) {
      buf.set(bx + i, by, "─", THEME.border);
      buf.set(bx + i, by + boxH - 1, "─", THEME.border);
    }
    for (let i = 0; i < boxH; i++) {
      buf.set(bx, by + i, "│", THEME.border);
      buf.set(bx + boxW - 1, by + i, "│", THEME.border);
    }
    buf.set(bx, by, "┌", THEME.border);
    buf.set(bx + boxW - 1, by, "┐", THEME.border);
    buf.set(bx, by + boxH - 1, "└", THEME.border);
    buf.set(bx + boxW - 1, by + boxH - 1, "┘", THEME.border);

    const contentLines: Array<{ text: string; fg: number; bold: boolean }> = [];
    const w = boxW - 2;
    function add(text: string, fg = THEME.feedLog as number, bold = false) {
      contentLines.push({ text, fg, bold });
    }

    add(` ${request.method}  ${request.url}`, THEME.netMethodGet, true);

    if (response) {
      const code = response.statusCode;
      const codeColor = code >= 200 && code < 300 ? THEME.netStatusOk
        : code >= 400 ? THEME.netStatusErr
        : THEME.netStatusWarn;
      add(` Status: ${code} ${response.statusText}`, codeColor);
    }
    add(` Duration: ${totalDurationMs != null ? Math.round(totalDurationMs) + "ms" : "…"}  Size: ${item.event.sizeBytes ?? "?"} bytes`);

    // Overview always visible; details expandable
    const hasResHeaders = response?.headers && Object.keys(response.headers).length > 0;
    const hasResBody = !!decodedBody;

    if (expanded) {
      // ── Always show payload side ──
      add("");
      add(` ── Payload ──`, THEME.netHeader, true);
      add(`   ${request.method}  ${request.url}`);
      const reqHdrCount = request.headers ? Object.keys(request.headers).length : 0;
      if (reqHdrCount > 0) {
        for (const [k, v] of Object.entries(request.headers)) {
          add(`   ${k}: ${v}`);
        }
      } else {
        add(`   (no request headers)`);
      }
      if (request.postData) {
        const reqLines = request.postData.split("\n");
        for (const l of reqLines) {
          add(`   ${l}`);
        }
      } else {
        add(`   (no request body)`);
      }

      // ── Response side ──
      if (hasResHeaders) {
        add("");
        add(` ── Response Headers ──`, THEME.netHeader, true);
        for (const [k, v] of Object.entries(response!.headers)) {
          add(`   ${k}: ${v}`);
        }
      }
      if (hasResBody) {
        add("");
        add(` ── Response Body ──`, THEME.netHeader, true);
        const resLines = decodedBody!.split("\n");
        for (const l of resLines) {
          add(`   ${l}`);
        }
      }
    } else {
      add("");
      add(` [:exp to show full payload & body]`, THEME.dimText);
    }

    add("");
    const hint = expanded
      ? ` [Enter=collapse  ↑↓/←→=scroll  Esc=close]`
      : ` [Enter=expand  ↑↓/←→=scroll  Esc=close]`;
    add(hint, THEME.dimText);

    const innerH = boxH - 2;
    const maxScrollY = Math.max(0, contentLines.length - innerH);
    const clampedScrollY = Math.min(scroll, maxScrollY);
    const maxLineLen = contentLines.reduce((m, l) => Math.max(m, l.text.length), 0);
    const maxScrollX = Math.max(0, maxLineLen - w);
    const clampedScrollX = Math.min(scrollX, maxScrollX);

    for (let i = 0; i < innerH; i++) {
      const idx = clampedScrollY + i;
      if (idx < contentLines.length) {
        const { text, fg, bold } = contentLines[idx];
        buf.writeString(bx + 1, by + 1 + i, text.slice(clampedScrollX, clampedScrollX + w), fg, -1, bold);
      }
    }

    // Scroll indicators — vertical on right edge, horizontal on bottom border
    if (maxScrollY > 0) {
      if (clampedScrollY > 0) buf.set(bx + boxW - 2, by + 1, "▲", THEME.dimText);
      if (clampedScrollY < maxScrollY) buf.set(bx + boxW - 2, by + boxH - 2, "▼", THEME.dimText);
    }
    if (maxScrollX > 0) {
      if (clampedScrollX > 0) buf.set(bx + 2, by + boxH - 1, "◀", THEME.border);
      if (clampedScrollX < maxScrollX) buf.set(bx + boxW - 3, by + boxH - 1, "▶", THEME.border);
    }
  }

  private renderHelpOverlay(buf: ScreenBuffer, cols: number, rows: number): void {
    buf.fillRect(0, 2, cols, rows - 2, " ", -1, 0);

    const lines = [
      "╔══════════════════════════════════════════════════════════╗",
      "║              HexDTL Command Reference                   ║",
      "╠══════════════════════════════════════════════════════════╣",
      "║                                                        ║",
      "║  :q / :quit         — Quit the inspector               ║",
      "║  :h / :help         — Show this help                   ║",
      "║  :clear             — Clear all panel data             ║",
      "║                                                        ║",
      "║  NAVIGATION:                                           ║",
      "║  ← → arrows         — Cycle panels                     ║",
      "║  ↑ ↓ arrows         — Scroll this help                 ║",
      "║  Tab                — Cycle panels                     ║",
      "║  F1-F8              — Direct panel switch              ║",
      "║  Ctrl+L             — Toggle split-screen mode         ║",
      "║                                                        ║",
      "║  XOM (object inspector):                               ║",
      "║  :xom <expr>        — Inspect a JS object              ║",
      "║  :inspect <expr>    — Same as :xom                     ║",
      "║                                                        ║",
      "║  CODE INJECTION:                                       ║",
      "║  :inject <code>     — Inject & run JS code             ║",
      "║  :eval <expr>       — Evaluate expression              ║",
      "║                                                        ║",
      "║  HEXEDIT (source editor):                              ║",
      "║  :open <url|index>  — Open script for viewing/editing  ║",
      "║  :beautify          — Beautify current source          ║",
      "║  :decrypt / :rewrite— Deobfuscate encrypted code       ║",
      "║  :save              — Save edited source               ║",
      "║                                                        ║",
      "║  DEBUGGER:                                             ║",
      "║  :break file:line   — Set/remove breakpoint            ║",
      "║  :step / :next      — Step over                        ║",
      "║  :into              — Step into                        ║",
      "║  :out               — Step out                         ║",
      "║  :continue / :cont  — Continue execution               ║",
      "║  :watch <expr>      — Watch an expression              ║",
      "║                                                        ║",
      "║  OTHER:                                                ║",
      "║  :filter <text>     — Filter panel content             ║",
      "║  :scroll <n>        — Scroll to position N             ║",
      "║  :top / :bottom     — Scroll to top/bottom             ║",
      "║  :split             — Toggle split-screen              ║",
      "║  :export <file>     — Export panel data to file        ║",
      "║                                                        ║",
      "║  ↑↓ scroll  ←→ panels  any key close                  ║",
      "╚══════════════════════════════════════════════════════════╝",
    ];

    const contentTop = 2;
    const contentHeight = rows - 2;
    const startX = Math.max(0, Math.floor((cols - 58) / 2));

    // Show scrollable window of lines
    const startLine = Math.max(0, lines.length - contentHeight - this.state.helpScroll);
    const endLine = Math.min(lines.length, startLine + contentHeight);

    for (let i = startLine; i < endLine; i++) {
      const screenY = contentTop + (i - startLine);
      if (screenY < rows) {
        buf.writeString(startX, screenY, lines[i], THEME.feedLog, 0);
      }
    }

    // Scroll indicators
    if (startLine > 0) buf.set(startX + 57, contentTop, "▲", THEME.dimText);
    if (endLine < lines.length) buf.set(startX + 57, rows - 1, "▼", THEME.dimText);
  }

  private renderInputBar(rows: number, cols: number): void {
    const buf = this.renderer.buffer;
    const inputY = rows - 2;
    for (let x = 0; x < cols; x++) {
      buf.set(x, inputY, " ", THEME.inputFg, -1);
    }

    if (this.state.panel === "console") {
      const prompt = this.state.busy ? " ⏳ " : " > ";
      buf.writeString(0, inputY, prompt, THEME.promptFg, -1, true);
      const inputX = prompt.length;
      const maxInput = cols - inputX - 1;
      const displayInput = this.renderer.truncate(this.state.inputBuffer, maxInput);
      buf.writeString(inputX, inputY, displayInput, THEME.inputFg);
      const cursorX = inputX + Math.min(this.state.inputCursor, maxInput);
      const cursorChar = this.state.inputBuffer[this.state.inputCursor] ?? " ";
      buf.set(cursorX, inputY, cursorChar, THEME.inputFg, -1, false, false, false, true);
    } else if (this.state.panel === "inject") {
      const prompt = " ⚡ ";
      buf.writeString(0, inputY, prompt, THEME.feedWarn, -1, true);
      const avail = cols - prompt.length - 1;
      const display = this.renderer.truncate(this.state.injectBuffer, avail);
      buf.writeString(prompt.length, inputY, display, THEME.inputFg);
    } else if (this.state.cmdMode) {
      const prompt = " :";
      buf.writeString(0, inputY, prompt, THEME.feedWarn, -1, true);
      const maxCmd = cols - 3;
      const displayCmd = this.renderer.truncate(this.state.cmdBuffer, maxCmd);
      buf.writeString(prompt.length, inputY, displayCmd, THEME.inputFg);
      buf.set(prompt.length + displayCmd.length, inputY, " ", THEME.inputFg, -1, false, false, false, true);
    } else {
      const hints: Record<PanelId, string> = {
        runtime: " :cmd  ↑↓:scroll  Tab:switch  F1-F8:panels  :h help",
        console: " type expression  ↑↓:history  :cmd",
        network: " :cmd  ↑↓:scroll  Tab:switch",
        sources: " :cmd  ↑↓:scroll  :open <idx>  :beautify",
        xom: " :xom <expr> to inspect  ↑↓:navigate",
        inject: " type code  Ctrl+M to run  :cmd",
        hexedit: " ↑↓:nav  Esc:close  :beautify  :decrypt",
        debugger: " F5:continue  F10:step  F11:into  :break file:line",
        filemgr: " ↑↓:nav  Enter:open  Bksp:parent  :cmd",
      };
      const hint = hints[this.state.panel] || " :cmd  Tab:switch";
      buf.writeString(0, inputY, this.renderer.truncate(hint, cols), THEME.dimText);
    }
  }

  private renderStatusBar(rows: number, cols: number): void {
    const statusY = rows - 1;
    const itemCount = this.getItemCount();
    const left = ` ${this.state.panel.toUpperCase()} ${itemCount}`;
    const right = `${cols}×${rows} `;
    this.renderer.drawStatusBar(statusY, left, right);
  }

  private renderSplitInputBar(rows: number, cols: number): void {
    const buf = this.renderer.buffer;
    const inputY = rows - 3;
    for (let x = 0; x < cols; x++) {
      buf.set(x, inputY, " ", THEME.inputFg, -1);
    }
    if (this.state.cmdMode) {
      const prompt = " :";
      buf.writeString(0, inputY, prompt, THEME.feedWarn, -1, true);
      const maxCmd = cols - 3;
      buf.writeString(prompt.length, inputY, this.renderer.truncate(this.state.cmdBuffer, maxCmd), THEME.inputFg);
    } else {
      buf.writeString(0, inputY, " Ctrl+L:toggle split  Tab:switch  :cmd", THEME.dimText);
    }
  }

  private renderSplitStatusBar(rows: number, cols: number): void {
    const buf = this.renderer.buffer;
    const statusY = rows - 2;
    const itemCount = this.getItemCount();
    const left = ` ${this.state.panel.toUpperCase()} ${itemCount} | split mode`;
    const right = `${cols}×${rows} `;
    this.renderer.drawStatusBar(statusY, left, right);

    const sepY = rows - 1;
    for (let x = 0; x < cols; x++) {
      buf.set(x, sepY, " ", THEME.dimText, -1);
    }
  }

  private getItemCount(): string {
    const { panel, feed, networkItems, scripts, history, injectHistory, watchExpressions } = this.state;
    switch (panel) {
      case "runtime": return `${feed.length} events`;
      case "console": return `${history.length} entries`;
      case "network": return `${networkItems.length} requests`;
      case "sources": return `${scripts.length} scripts`;
      case "xom": return this.state.xomRoot ? "object" : "idle";
      case "inject": return `${injectHistory.length} injections`;
      case "hexedit": return this.state.editor ? `${this.state.editor.source.split("\n").length}L` : "idle";
      case "debugger": return this.state.debugger ? `${this.state.debugger.breakpoints.length} BPs` : "idle";
      case "filemgr": return `${this.state.fileMgr.entries.length} entries`;
      default: return "";
    }
  }
}

function formatPreview(val: unknown): string {
  if (val === null) return "null";
  if (val === undefined) return "undefined";
  if (typeof val === "string") {
    if (val.length > 40) return `"${val.slice(0, 37)}..."`;
    return `"${val}"`;
  }
  if (typeof val === "function") return "ƒ()";
  if (Array.isArray(val)) return `Array(${val.length})`;
  if (typeof val === "object") {
    try {
      const keys = Object.keys(val as Record<string, unknown>);
      return `{${keys.slice(0, 3).join(", ")}${keys.length > 3 ? ", ..." : ""}}`;
    } catch {
      return "{}";
    }
  }
  return String(val);
}
