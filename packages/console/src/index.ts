import type { RuntimeInspector } from "@hexdtl/runtime";
import type { EvaluationResult } from "@hexdtl/core";

export interface ConsoleEntry {
  id: number;
  expression: string;
  result: EvaluationResult;
  timestampMs: number;
}

/**
 * The "Chrome DevTools Console" experience: keeps a scrollback of
 * every expression the user typed and what it evaluated to, so the
 * UI can render it as a REPL transcript and support up-arrow history.
 */
export class InteractiveConsole {
  private history: ConsoleEntry[] = [];
  private nextId = 1;

  constructor(private readonly runtime: RuntimeInspector) {}

  async run(expression: string): Promise<ConsoleEntry> {
    const trimmed = expression.trim();
    const result = trimmed
      ? await this.runtime.evaluate(trimmed)
      : ({ ok: true, display: "" } as EvaluationResult);

    const entry: ConsoleEntry = {
      id: this.nextId++,
      expression: trimmed,
      result,
      timestampMs: Date.now(),
    };
    this.history.push(entry);
    return entry;
  }

  getHistory(): readonly ConsoleEntry[] {
    return this.history;
  }

  /** Previous expressions only, most recent first — for up-arrow recall. */
  getExpressionHistory(): string[] {
    return [...this.history].reverse().map((e) => e.expression).filter(Boolean);
  }

  clear(): void {
    this.history = [];
  }
}
