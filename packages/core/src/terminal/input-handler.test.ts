import { describe, it, expect } from "vitest";
import { InputHandler } from "./input-handler.js";

describe("InputHandler", () => {
  it("parses regular characters", () => {
    const h = new InputHandler();
    const keys: any[] = [];
    h.onKey((k) => keys.push(k));
    h.feed("hello");
    expect(keys.map((k) => k.name)).toEqual(["h", "e", "l", "l", "o"]);
    expect(keys.every((k) => !k.ctrl)).toBe(true);
  });

  it("parses Enter", () => {
    const h = new InputHandler();
    const keys: any[] = [];
    h.onKey((k) => keys.push(k));
    h.feed("\r");
    expect(keys[0].name).toBe("return");
  });

  it("parses Tab", () => {
    const h = new InputHandler();
    const keys: any[] = [];
    h.onKey((k) => keys.push(k));
    h.feed("\t");
    expect(keys[0].name).toBe("tab");
  });

  it("parses Escape", () => {
    const h = new InputHandler();
    const keys: any[] = [];
    h.onKey((k) => keys.push(k));
    h.feed("\x1b");
    expect(keys[0].name).toBe("escape");
  });

  it("parses Ctrl+A through Ctrl+Z", () => {
    const h = new InputHandler();
    const keys: any[] = [];
    h.onKey((k) => keys.push(k));
    // Ctrl+A = \x01, Ctrl+Z = \x1a
    h.feed("\x01\x1a");
    expect(keys[0]).toMatchObject({ name: "a", ctrl: true });
    expect(keys[1]).toMatchObject({ name: "z", ctrl: true });
  });

  it("parses Ctrl+Space as {name:'space', ctrl:true}", () => {
    const h = new InputHandler();
    const keys: any[] = [];
    h.onKey((k) => keys.push(k));
    h.feed("\x00");
    expect(keys[0]).toMatchObject({ name: "space", ctrl: true, char: " " });
  });

  it("parses Backspace", () => {
    const h = new InputHandler();
    const keys: any[] = [];
    h.onKey((k) => keys.push(k));
    h.feed("\x7f");
    expect(keys[0].name).toBe("backspace");
  });

  it("parses arrow keys", () => {
    const h = new InputHandler();
    const keys: any[] = [];
    h.onKey((k) => keys.push(k));
    h.feed("\x1b[A\x1b[B\x1b[D\x1b[C");
    expect(keys.map((k) => k.name)).toEqual(["up", "down", "left", "right"]);
  });

  it("parses Home/End/PgUp/PgDn", () => {
    const h = new InputHandler();
    const keys: any[] = [];
    h.onKey((k) => keys.push(k));
    h.feed("\x1b[H\x1b[F\x1b[5~\x1b[6~");
    expect(keys.map((k) => k.name)).toEqual(["home", "end", "pageup", "pagedown"]);
  });

  it("parses Delete", () => {
    const h = new InputHandler();
    const keys: any[] = [];
    h.onKey((k) => keys.push(k));
    h.feed("\x1b[3~");
    expect(keys[0].name).toBe("delete");
  });

  it("parses F1-F4", () => {
    const h = new InputHandler();
    const keys: any[] = [];
    h.onKey((k) => keys.push(k));
    h.feed("\x1bOP\x1bOQ\x1bOR\x1bOS");
    expect(keys.map((k) => k.name)).toEqual(["f1", "f2", "f3", "f4"]);
  });

  it("parses F5-F8", () => {
    const h = new InputHandler();
    const keys: any[] = [];
    h.onKey((k) => keys.push(k));
    h.feed("\x1b[15~\x1b[17~\x1b[18~\x1b[19~");
    expect(keys.map((k) => k.name)).toEqual(["f5", "f6", "f7", "f8"]);
  });

  it("ignores unrecognized CSI sequences", () => {
    const h = new InputHandler();
    const keys: any[] = [];
    h.onKey((k) => keys.push(k));
    h.feed("\x1b[?1034h\x1b[?1000l");
    expect(keys.length).toBe(0);
  });

  it("ignores SGR mouse events", () => {
    const h = new InputHandler();
    const keys: any[] = [];
    h.onKey((k) => keys.push(k));
    h.feed("\x1b[<0;10;5M\x1b[<32;20;10m");
    expect(keys.length).toBe(0);
  });

  it("unsubscribe returns a working cleanup function", () => {
    const h = new InputHandler();
    const keys: any[] = [];
    const unsub = h.onKey((k) => keys.push(k));
    h.feed("a");
    expect(keys.length).toBe(1);
    unsub();
    h.feed("b");
    expect(keys.length).toBe(1);
  });
});
