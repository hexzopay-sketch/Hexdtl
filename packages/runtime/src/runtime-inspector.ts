import type { CDPClient } from "@hexdtl/transport";
import type { EventBus, ConsoleLevel, EvaluationResult } from "@hexdtl/core";
import { formatRemoteObject, formatCallFrame } from "./format.js";

interface ConsoleAPICalledParams {
  type: ConsoleLevel;
  args: Array<{ type: string; value?: unknown; description?: string }>;
  timestamp: number;
  stackTrace?: { callFrames: Array<{ functionName: string; url: string; lineNumber: number; columnNumber: number }> };
}

interface ExceptionThrownParams {
  timestamp: number;
  exceptionDetails: {
    text: string;
    exception?: { description?: string };
    stackTrace?: { callFrames: Array<{ functionName: string; url: string; lineNumber: number; columnNumber: number }> };
  };
}

interface ScriptParsedParams {
  url: string;
  scriptId: string;
}

/**
 * Wraps a connected CDPClient, enables the Runtime/Debugger/Console
 * domains, and republishes everything as normalized events
 * (`runtime:console`, `runtime:exception`, `runtime:execution`) on
 * the shared EventBus. UI code never touches CDP directly.
 */
export class RuntimeInspector {
  private unsubscribers: Array<() => void> = [];
  private enabled = false;

  constructor(private readonly client: CDPClient, private readonly bus: EventBus) {}

  async enable(): Promise<void> {
    if (this.enabled) return;
    await Promise.all([
      this.client.send("Runtime.enable"),
      this.client.send("Debugger.enable"),
      this.client.send("Runtime.runIfWaitingForDebugger"),
    ]);

    this.unsubscribers.push(
      this.client.on("Runtime.consoleAPICalled", (raw) => this.handleConsole(raw as ConsoleAPICalledParams)),
      this.client.on("Runtime.exceptionThrown", (raw) => this.handleException(raw as ExceptionThrownParams)),
      this.client.on("Debugger.scriptParsed", (raw) => this.handleScriptParsed(raw as ScriptParsedParams))
    );

    this.enabled = true;
  }

  private handleConsole(params: ConsoleAPICalledParams): void {
    const args = params.args.map((a) => formatRemoteObject(a));
    this.bus.emit("runtime:console", {
      level: params.type,
      args,
      text: args.join(" "),
      timestampMs: params.timestamp,
      stackTrace: params.stackTrace?.callFrames.map(formatCallFrame),
    });
  }

  private handleException(params: ExceptionThrownParams): void {
    const frames = params.exceptionDetails.stackTrace?.callFrames.map(formatCallFrame) ?? [];
    this.bus.emit("runtime:exception", {
      message: params.exceptionDetails.exception?.description ?? params.exceptionDetails.text,
      stackTrace: frames,
      timestampMs: params.timestamp,
    });
  }

  private handleScriptParsed(params: ScriptParsedParams): void {
    if (!params.url || params.url.startsWith("node:")) return; // skip internals
    this.bus.emit("runtime:execution", {
      kind: "call",
      location: { file: params.url.replace(/^file:\/\//, ""), line: 1 },
      timestampMs: Date.now(),
    });
  }

  /** Evaluate an arbitrary JS expression inside the inspected process — the interactive console. */
  async evaluate(expression: string): Promise<EvaluationResult> {
    try {
      const result = await this.client.send<{
        result: { type: string; value?: unknown; description?: string };
        exceptionDetails?: { text: string };
      }>("Runtime.evaluate", {
        expression,
        replMode: true,
        includeCommandLineAPI: true,
        generatePreview: true,
      });

      if (result.exceptionDetails) {
        return { ok: false, display: result.exceptionDetails.text, error: result.exceptionDetails.text };
      }
      return {
        ok: true,
        value: result.result.value,
        display: formatRemoteObject(result.result),
      };
    } catch (err) {
      const message = (err as Error).message;
      return { ok: false, display: message, error: message };
    }
  }

  dispose(): void {
    for (const unsub of this.unsubscribers) unsub();
    this.unsubscribers = [];
    this.enabled = false;
  }
}
