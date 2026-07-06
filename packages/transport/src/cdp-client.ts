import WebSocket from "ws";

type CDPMessage =
  | { id: number; method: string; params?: Record<string, unknown> }
  | { id: number; result?: unknown; error?: { code: number; message: string } }
  | { method: string; params?: unknown };

type PendingCall = {
  resolve: (value: unknown) => void;
  reject: (err: Error) => void;
};

/**
 * Minimal JSON-RPC client for the Chrome DevTools Protocol (CDP).
 * Node exposes this over a WebSocket when started with --inspect.
 * This class only knows the wire protocol (request id matching,
 * event dispatch) — it has no opinion about which CDP domains
 * (Runtime, Debugger, Console, ...) are enabled. Higher-level
 * packages like @hexdtl/runtime build on top of this.
 */
export class CDPClient {
  private ws: WebSocket | null = null;
  private nextId = 1;
  private pending = new Map<number, PendingCall>();
  private eventListeners = new Map<string, Set<(params: unknown) => void>>();

  constructor(private readonly url: string) {}

  connect(timeoutMs = 5000): Promise<void> {
    return new Promise((resolve, reject) => {
      const socket = new WebSocket(this.url, { maxPayload: 256 * 1024 * 1024 });
      const timer = setTimeout(() => {
        socket.terminate();
        reject(new Error(`CDP connection to ${this.url} timed out after ${timeoutMs}ms`));
      }, timeoutMs);

      socket.once("open", () => {
        clearTimeout(timer);
        this.ws = socket;
        resolve();

        // Once connected, keep listening so later errors/closes don't
        // crash the process (an 'error' event with no listener throws)
        // and so in-flight calls are rejected instead of hanging forever.
        socket.on("error", (err) => this.handleSocketDown(err));
        socket.on("close", () => this.handleSocketDown(new Error("CDP connection closed")));
      });

      socket.once("error", (err) => {
        clearTimeout(timer);
        reject(err);
      });

      socket.on("message", (raw) => this.handleMessage(raw.toString()));
    });
  }

  private handleSocketDown(err: Error): void {
    if (this.ws === null) return; // already closed via close()
    this.ws = null;
    for (const [id, call] of this.pending) {
      call.reject(err);
    }
    this.pending.clear();
  }

  private handleMessage(raw: string): void {
    let msg: CDPMessage;
    try {
      msg = JSON.parse(raw);
    } catch {
      return;
    }

    if ("id" in msg && this.pending.has(msg.id)) {
      const call = this.pending.get(msg.id)!;
      this.pending.delete(msg.id);
      if ("error" in msg && msg.error) {
        call.reject(new Error(msg.error.message));
      } else {
        call.resolve("result" in msg ? msg.result : undefined);
      }
      return;
    }

    if ("method" in msg) {
      const listeners = this.eventListeners.get(msg.method);
      if (listeners) {
        for (const listener of listeners) listener(msg.params);
      }
    }
  }

  /** Send a CDP command, e.g. send("Runtime.enable") or send("Runtime.evaluate", { expression }). */
  send<T = unknown>(method: string, params: Record<string, unknown> = {}): Promise<T> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return Promise.reject(new Error("CDP client is not connected"));
    }
    const id = this.nextId++;
    const payload = JSON.stringify({ id, method, params });
    return new Promise<T>((resolve, reject) => {
      this.pending.set(id, { resolve: resolve as (v: unknown) => void, reject });
      this.ws!.send(payload, (err) => {
        if (err) {
          this.pending.delete(id);
          reject(err);
        }
      });
    });
  }

  /** Subscribe to a raw CDP event, e.g. "Runtime.consoleAPICalled". */
  on(method: string, listener: (params: unknown) => void): () => void {
    if (!this.eventListeners.has(method)) this.eventListeners.set(method, new Set());
    this.eventListeners.get(method)!.add(listener);
    return () => this.eventListeners.get(method)?.delete(listener);
  }

  close(): void {
    // Reject all pending calls so callers don't hang forever
    const err = new Error("CDP client closed");
    for (const [id, call] of this.pending) {
      call.reject(err);
    }
    this.pending.clear();
    this.ws?.close();
    this.ws = null;
  }
}
