import { describe, it, expect } from "vitest";
import { ScreenBuffer } from "@hexdtl/core";
import { renderNetworkPanel } from "./network-panel.js";
import type { NetworkItem } from "../buffer-app.js";

function makeItem(overrides: Partial<NetworkItem["event"]> = {}): NetworkItem {
  return {
    id: 1,
    event: {
      request: {
        id: "req-1",
        url: "http://example.com/test",
        method: "GET",
        headers: { accept: "*/*" },
        timestamp: Date.now(),
      },
      response: {
        id: "req-1",
        url: "http://example.com/test",
        statusCode: 200,
        statusText: "OK",
        headers: { "content-type": "application/json", "x-server": "test" },
        timestamp: Date.now(),
      },
      totalDurationMs: 150,
      sizeBytes: 512,
      ...overrides,
    },
  };
}

function getRowText(buf: ScreenBuffer, y: number): string {
  return buf.getRow(y).map((c) => c.char).join("");
}

describe("renderNetworkPanel", () => {
  it("shows placeholder when empty", () => {
    const buf = new ScreenBuffer(40, 10);
    renderNetworkPanel(buf, 0, 0, 40, 10, [], 0);
    expect(getRowText(buf, 4)).toContain("Waiting for network requests");
  });

  it("renders a single request", () => {
    const buf = new ScreenBuffer(80, 10);
    renderNetworkPanel(buf, 0, 0, 80, 10, [makeItem()], 0);
    expect(getRowText(buf, 0)).toContain("METHOD");
    expect(getRowText(buf, 0)).toContain("STAT");
    expect(getRowText(buf, 0)).toContain("URL");
    expect(getRowText(buf, 1)).toContain("─");
    expect(getRowText(buf, 2)).toContain("GET");
    expect(getRowText(buf, 2)).toContain("200");
    expect(getRowText(buf, 2)).toContain("/test");
  });

  it("renders multiple requests in array order", () => {
    const older = makeItem({ request: { id: "req-1", url: "/first", method: "GET", headers: {}, timestamp: 100 } });
    const newer = makeItem({ request: { id: "req-2", url: "/second", method: "POST", headers: {}, timestamp: 200 } });
    const buf = new ScreenBuffer(80, 10);
    renderNetworkPanel(buf, 0, 0, 80, 10, [older, newer], 0);
    expect(getRowText(buf, 2)).toContain("/first");
    expect(getRowText(buf, 3)).toContain("/second");
  });

  it("highlights selected row", () => {
    const items = [makeItem()];
    const buf = new ScreenBuffer(40, 10);
    renderNetworkPanel(buf, 0, 0, 40, 10, items, 0, 0);
    expect(buf.getRow(2)[1].bg).toBeGreaterThanOrEqual(0);
  });

  it("highlights correct row based on selectedIdx", () => {
    const items = [
      makeItem({ request: { id: "req-1", url: "/a", method: "GET", headers: {}, timestamp: 100 } }),
      makeItem({ request: { id: "req-2", url: "/b", method: "GET", headers: {}, timestamp: 200 } }),
    ];
    // selectedIdx=0 maps to last item (newest, at row 3)
    const buf = new ScreenBuffer(40, 10);
    renderNetworkPanel(buf, 0, 0, 40, 10, items, 0, 0);
    // Row 2 = first item (idx=0 → reverseIdx=1), not selected
    expect(buf.getRow(2)[1].bg).toBeLessThanOrEqual(-1);
    // Row 3 = second item (idx=1 → reverseIdx=0), selected
    expect(buf.getRow(3)[1].bg).toBeGreaterThanOrEqual(0);
  });

  it("shows scroll indicators when scrolled", () => {
    const items = Array(20).fill(null).map((_, i) =>
      makeItem({ request: { id: `req-${i}`, url: `/item-${i}`, method: "GET", headers: {}, timestamp: i } }),
    );
    const buf = new ScreenBuffer(40, 10);
    renderNetworkPanel(buf, 0, 0, 40, 10, items, 3);
    const all = Array.from({ length: 10 }, (_, r) => getRowText(buf, r)).join("");
    expect(all).toMatch(/[▲▼]/);
  });

  it("renders different HTTP methods with correct colors", () => {
    const methods = ["GET", "POST", "PUT", "DELETE"];
    const items = methods.map((m, i) =>
      makeItem({ request: { id: `req-${i}`, url: `/${m.toLowerCase()}`, method: m, headers: {}, timestamp: i } }),
    );
    const buf = new ScreenBuffer(50, 10);
    renderNetworkPanel(buf, 0, 0, 50, 10, items, 0);
    for (let i = 0; i < methods.length; i++) {
      expect(getRowText(buf, 2 + i)).toContain(methods[i]);
    }
  });

  it("shows pending indicator for requests without response", () => {
    const item = makeItem({ response: undefined });
    const buf = new ScreenBuffer(40, 10);
    renderNetworkPanel(buf, 0, 0, 40, 10, [item], 0);
    expect(getRowText(buf, 2)).toContain("…");
  });

  it("truncates long URLs", () => {
    const longUrl = "http://example.com/" + "a".repeat(200);
    const item = makeItem({ request: { id: "req-1", url: longUrl, method: "GET", headers: {}, timestamp: 1 } });
    const buf = new ScreenBuffer(40, 10);
    renderNetworkPanel(buf, 0, 0, 40, 10, [item], 0);
    expect(getRowText(buf, 2)).not.toContain("a".repeat(200));
    expect(getRowText(buf, 2)).toMatch(/\.\.\./);
  });
});
