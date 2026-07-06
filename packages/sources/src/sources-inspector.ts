import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import type { CDPClient } from "@hexdtl/transport";
import type { EventBus, SourceScript } from "@hexdtl/core";

interface ScriptParsedParams {
  scriptId: string;
  url: string;
  startLine: number;
  startColumn: number;
  endLine: number;
  endColumn: number;
  hash: string;
  isModule?: boolean;
  hasSourceURL?: boolean;
  sourceMapURL?: string;
}

/**
 * Watches for scripts parsed by the VM and fetches their source code
 * via `Debugger.getScriptSource`. This is how you inspect "decrypted"
 * or dynamically-generated code at runtime — even if the original file
 * on disk is encrypted, the V8 inspector sees the decrypted, JIT-ready
 * source.
 */
export class SourcesInspector {
  private unsubscribers: Array<() => void> = [];
  private enabled = false;
  private scriptCache = new Map<string, SourceScript>();

  constructor(
    private readonly client: CDPClient,
    private readonly bus: EventBus,
  ) {}

  async enable(): Promise<void> {
    if (this.enabled) return;

    // Debugger must be enabled to receive scriptParsed events
    await this.client.send("Debugger.enable");

    this.unsubscribers.push(
      this.client.on("Debugger.scriptParsed", (raw) =>
        this.handleScriptParsed(raw as ScriptParsedParams),
      ),
    );

    this.enabled = true;
  }

  private async handleScriptParsed(params: ScriptParsedParams): Promise<void> {
    const { scriptId, url } = params;

    // Skip internal scripts
    if (!url || url.startsWith("node:")) return;

    // Fetch the full source code via CDP
    try {
      const result = await this.client.send<{ scriptSource: string }>(
        "Debugger.getScriptSource",
        { scriptId },
      );

      const script: SourceScript = {
        scriptId,
        url,
        source: result.scriptSource,
        wasDecrypted: await this.differsFromDisk(url, result.scriptSource),
      };

      this.scriptCache.set(scriptId, script);
      this.bus.emit("source:scriptParsed", script);
    } catch {
      // Script source not available (e.g. was garbage collected)
    }
  }

  /**
   * Was the runtime source materially different from what's on disk?
   * This is the whole point of the "decrypt" feature: an encrypted/
   * obfuscated file on disk should show up here as decrypted once V8
   * has it JIT-ready. Only applies to file:// URLs; anything else
   * (node:, data:, eval, etc.) can't be compared and is left `false`.
   */
  private async differsFromDisk(url: string, runtimeSource: string): Promise<boolean> {
    if (!url.startsWith("file://")) return false;
    try {
      const onDisk = await readFile(fileURLToPath(url), "utf-8");
      return onDisk.trim() !== runtimeSource.trim();
    } catch {
      return false;
    }
  }

  /** Retrieve a previously cached script source by scriptId. */
  getScript(scriptId: string): SourceScript | undefined {
    return this.scriptCache.get(scriptId);
  }

  /** List all known scripts. */
  getAllScripts(): SourceScript[] {
    return Array.from(this.scriptCache.values());
  }

  /** Search scripts by URL pattern. */
  findScripts(urlPattern: string): SourceScript[] {
    const re = new RegExp(urlPattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\\\*/g, ".*"), "i");
    return Array.from(this.scriptCache.values()).filter((s) => re.test(s.url));
  }

  dispose(): void {
    for (const unsub of this.unsubscribers) unsub();
    this.unsubscribers = [];
    this.enabled = false;
    this.scriptCache.clear();
  }
}
