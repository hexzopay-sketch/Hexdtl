import React from "react";
import { render } from "ink";
import type { EventBus } from "@hexdtl/core";
import type { RuntimeInspector } from "@hexdtl/runtime";
import type { NetworkInspector } from "@hexdtl/network";
import type { SourcesInspector } from "@hexdtl/sources";
import { App } from "./App.js";
import { BufferApp, type BufferAppOptions } from "./buffer-app.js";

export function startUI(
  bus: EventBus,
  runtime: RuntimeInspector,
  targetLabel: string,
  network?: NetworkInspector,
  sources?: SourcesInspector,
) {
  return render(
    <App bus={bus} runtime={runtime} network={network} sources={sources} targetLabel={targetLabel} />,
  );
}

/**
 * Start the htop-style buffer-based UI (no Ink/React dependency for rendering).
 * Uses raw ANSI escape sequences with diff-based byte-level updates.
 */
export function startBufferUI(opts: BufferAppOptions) {
  const app = new BufferApp(opts);
  app.start();
  return { waitUntilExit: () => app.waitUntilExit(), destroy: () => app.destroy() };
}

export { App } from "./App.js";
export { BufferApp } from "./buffer-app.js";
export type { BufferAppOptions, PanelId } from "./buffer-app.js";
