/**
 * Shared types used across every HexDTL package.
 * These are the "normalized" event shapes that transport-specific
 * inspectors (runtime, network, database, ...) translate raw
 * Chrome DevTools Protocol (CDP) messages into. UI and plugin code
 * should only ever depend on these, never on raw CDP payloads.
 */

export interface SourceLocation {
  file: string;
  line: number;
  column?: number;
  functionName?: string;
}

export type ExecutionKind =
  | "call"
  | "await"
  | "return"
  | "exception";

export interface ExecutionEvent {
  kind: ExecutionKind;
  location: SourceLocation;
  timestampMs: number;
  durationMs?: number;
  memoryMb?: number;
}

export type ConsoleLevel = "log" | "info" | "warn" | "error" | "debug" | "trace" | "table";

export interface ConsoleEvent {
  level: ConsoleLevel;
  args: unknown[];
  text: string;
  timestampMs: number;
  stackTrace?: SourceLocation[];
}

export interface ExceptionEvent {
  message: string;
  stackTrace: SourceLocation[];
  timestampMs: number;
  raw?: unknown;
}

export interface EvaluationResult {
  ok: boolean;
  value?: unknown;
  display: string;
  error?: string;
}

// ── Network types ──────────────────────────────────────────────

export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE" | "HEAD" | "OPTIONS" | string;

export interface NetworkRequest {
  id: string;
  url: string;
  method: HttpMethod;
  headers: Record<string, string>;
  postData?: string;
  timestamp: number;
  initiator?: { type: string; url?: string };
}

export interface NetworkResponse {
  id: string;
  url: string;
  statusCode: number;
  statusText: string;
  headers: Record<string, string>;
  mimeType?: string;
  remoteAddress?: string;
  timing?: {
    dns?: number;
    connect?: number;
    tls?: number;
    send?: number;
    wait?: number;
    receive?: number;
  };
  timestamp: number;
}

export interface NetworkEvent {
  request: NetworkRequest;
  response?: NetworkResponse;
  decodedBody?: string;
  totalDurationMs?: number;
  sizeBytes?: number;
}

// ── Source / Debug types ───────────────────────────────────────

export interface SourceScript {
  scriptId: string;
  url: string;
  source: string;
  wasDecrypted?: boolean;
}

// ── XOM (Ximbiot Origin Manufacture) types ─────────────────────

export interface XOMNode {
  id: number;
  name: string;
  type: "object" | "array" | "string" | "number" | "boolean" | "null" | "undefined" | "function" | "symbol" | "bigint" | "class" | "error" | "promise" | "map" | "set" | "weakmap" | "weakset" | "proxy" | "generator" | "date" | "regexp" | "typedarray" | "arraybuffer" | "dataview" | "node" | "element" | "window" | "unknown";
  value?: string;
  preview?: string;
  children?: XOMNode[];
  expanded: boolean;
  depth: number;
  proto?: boolean;
  enumerable?: boolean;
  writable?: boolean;
  configurable?: boolean;
  getter?: boolean;
  setter?: boolean;
}

export interface XOMInspection {
  expression: string;
  root: XOMNode;
  timestampMs: number;
}

// ── Injector types ────────────────────────────────────────────

export interface InjectResult {
  expression: string;
  result: EvaluationResult;
  timestampMs: number;
}

// ── HexEdit types ─────────────────────────────────────────────

export interface HexEditFile {
  scriptId: string;
  url: string;
  source: string;
  modified: boolean;
  cursorRow: number;
  cursorCol: number;
  scrollTop: number;
}

// ── Debugger types ────────────────────────────────────────────

export interface DebuggerState {
  paused: boolean;
  callFrames: DebuggerCallFrame[];
  breakpoints: Breakpoint[];
  scopeChain: DebuggerScope[];
  selectedFrame: number;
}

export interface DebuggerCallFrame {
  callFrameId: string;
  functionName: string;
  url: string;
  lineNumber: number;
  columnNumber: number;
  scopeChain: DebuggerScope[];
  this?: unknown;
}

export interface DebuggerScope {
  type: "global" | "local" | "closure" | "catch" | "block" | "eval" | "module";
  variables: DebuggerVariable[];
}

export interface DebuggerVariable {
  name: string;
  value: string;
  type: string;
}

export interface Breakpoint {
  id: string;
  url: string;
  lineNumber: number;
  columnNumber?: number;
  condition?: string;
  enabled: boolean;
}

// ── Inspector Watch types ─────────────────────────────────────

export interface WatchExpression {
  id: number;
  expression: string;
  value: string;
  error?: string;
}

/** Map of every event a HexDTL inspector module can emit. */
export interface InspectorEventMap {
  "runtime:execution": ExecutionEvent;
  "runtime:console": ConsoleEvent;
  "runtime:exception": ExceptionEvent;
  "runtime:paused": DebuggerState;
  "runtime:resumed": void;
  "network:request": NetworkEvent;
  "network:response": NetworkEvent;
  "network:completed": NetworkEvent;
  "source:scriptParsed": SourceScript;
  "source:sourceChanged": { scriptId: string; source: string };
  "connection:open": { targetUrl: string };
  "connection:close": { reason: string };
  "connection:error": { message: string };
  "xom:inspect": XOMInspection;
  "xom:expand": { nodeId: number; children: XOMNode[] };
}

export type InspectorEventName = keyof InspectorEventMap;
