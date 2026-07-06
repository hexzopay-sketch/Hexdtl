import { EventEmitter } from "node:events";
import type { InspectorEventMap, InspectorEventName } from "./types.js";

export * from "./types.js";
export * from "./terminal/index.js";

/**
 * A strongly-typed wrapper around Node's EventEmitter.
 * Every HexDTL module (runtime, network, database, ...) publishes
 * normalized events onto a shared bus of this type, and the UI /
 * plugin layer subscribes to it without knowing where events
 * originated from.
 */
export class EventBus {
  private emitter = new EventEmitter();

  constructor() {
    // Live inspection can be noisy (console spam, high-frequency
    // execution events) — raise the default cap so Node doesn't warn.
    this.emitter.setMaxListeners(100);
  }

  emit<K extends InspectorEventName>(event: K, payload: InspectorEventMap[K]): void {
    this.emitter.emit(event, payload);
  }

  on<K extends InspectorEventName>(
    event: K,
    listener: (payload: InspectorEventMap[K]) => void
  ): () => void {
    this.emitter.on(event, listener);
    return () => this.emitter.off(event, listener);
  }

  once<K extends InspectorEventName>(
    event: K,
    listener: (payload: InspectorEventMap[K]) => void
  ): void {
    this.emitter.once(event, listener);
  }

  off<K extends InspectorEventName>(
    event: K,
    listener: (payload: InspectorEventMap[K]) => void
  ): void {
    this.emitter.off(event, listener);
  }
}

/** Root state container shared by the UI: an EventBus plus a rolling log. */
export interface InspectorSession {
  bus: EventBus;
  targetUrl: string;
  pid?: number;
  startedAt: number;
}

export function createSession(targetUrl: string, pid?: number): InspectorSession {
  return {
    bus: new EventBus(),
    targetUrl,
    pid,
    startedAt: Date.now(),
  };
}
