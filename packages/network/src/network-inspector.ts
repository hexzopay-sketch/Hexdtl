import type { CDPClient } from "@hexdtl/transport";
import type { EventBus, NetworkEvent, NetworkRequest, NetworkResponse } from "@hexdtl/core";

interface PreloadNetworkEvent {
  id: string;
  method: string;
  url: string;
  requestHeaders: Record<string, string>;
  requestBody?: string;
  statusCode: number | null;
  responseHeaders: Record<string, string> | null;
  body: string;
  startTime: number;
  endTime: number | null;
  duration: number | null;
}

// Mirrors the target-side ring buffer cap in network-preload.cjs. Without
// a matching cap here, `seenIds` grows forever over a long session even
// though the target only ever keeps the most recent MAX_EVENTS entries.
const MAX_SEEN_IDS = 1000;

export class NetworkInspector {
  private pollInterval: ReturnType<typeof setInterval> | null = null;
  private seenIds = new Set<string>();
  private enabled = false;

  constructor(
    private readonly client: CDPClient,
    private readonly bus: EventBus,
  ) {}

  async enable(): Promise<void> {
    if (this.enabled) return;
    this.enabled = true;

    try {
      await this.client.send("Runtime.evaluate", {
        expression:
          "globalThis.__hexdtl_network_events__ = globalThis.__hexdtl_network_events__ || []",
      });
    } catch {
      // Target may not support Runtime.evaluate yet; poll will handle gracefully
    }

    this.pollInterval = setInterval(() => this.poll(), 500);
  }

  private async poll(): Promise<void> {
    try {
      const raw = await this.client.send<{
        result: { type: string; value: string };
      }>("Runtime.evaluate", {
        expression: "JSON.stringify(__hexdtl_network_events__ || [])",
      });

      if (!raw?.result?.value) return;

      const events: PreloadNetworkEvent[] = JSON.parse(raw.result.value);

      for (const event of events) {
        if (this.seenIds.has(event.id)) continue;
        this.seenIds.add(event.id);
        if (this.seenIds.size > MAX_SEEN_IDS) {
          // Sets preserve insertion order — drop the oldest entry.
          const oldest = this.seenIds.values().next().value;
          if (oldest !== undefined) this.seenIds.delete(oldest);
        }

        const request: NetworkRequest = {
          id: event.id,
          url: event.url,
          method: event.method,
          headers: event.requestHeaders,
          postData: event.requestBody,
          timestamp: event.startTime,
        };

        this.bus.emit("network:request", { request });

        if (event.statusCode !== null) {
          const response: NetworkResponse = {
            id: event.id,
            url: event.url,
            statusCode: event.statusCode,
            statusText: httpStatusText(event.statusCode),
            headers: event.responseHeaders || {},
            timestamp: event.endTime || event.startTime,
          };

          this.bus.emit("network:response", { request, response });

          this.bus.emit("network:completed", {
            request,
            response,
            decodedBody: event.body || undefined,
            totalDurationMs: event.duration ?? undefined,
          });
        } else {
          this.bus.emit("network:completed", {
            request,
            totalDurationMs: event.duration ?? undefined,
          });
        }
      }
    } catch {
      // Polling may fail if target is disconnected or evaluate throws; ignore
    }
  }

  dispose(): void {
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }
    this.seenIds.clear();
    this.enabled = false;
  }
}

function httpStatusText(code: number): string {
  const texts: Record<number, string> = {
    200: "OK",
    201: "Created",
    204: "No Content",
    301: "Moved Permanently",
    302: "Found",
    304: "Not Modified",
    400: "Bad Request",
    401: "Unauthorized",
    403: "Forbidden",
    404: "Not Found",
    405: "Method Not Allowed",
    408: "Request Timeout",
    429: "Too Many Requests",
    500: "Internal Server Error",
    502: "Bad Gateway",
    503: "Service Unavailable",
    504: "Gateway Timeout",
  };
  return texts[code] || `Status ${code}`;
}
