#!/usr/bin/env node
// Development entry point: registers tsx's ESM loader so the CLI can
// run its TypeScript sources directly without a separate build step.
// A production build should instead ship compiled JS from `dist/`
// and drop this loader registration.
import { register } from "tsx/esm/api";

register();
await import("../src/index.ts");
