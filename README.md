# HexDTL — Chrome DevTools for the Terminal

A real, working terminal-based Chrome DevTools Protocol inspector built
on a monorepo skeleton. Inspect, debug, and beautify Node.js processes
from the command line.

## Features

### Core Inspector
- `hexdtl inspect <file>` — launch a Node.js file with the inspector attached
- `hexdtl attach <pid>` — attach to a running process by PID (POSIX)
- Real Chrome DevTools Protocol (CDP) over WebSocket — same protocol Chrome uses

### htop-style Live UI (`--buffer`)
- Raw ANSI escape sequence rendering with diff-based byte-level updates
- No screen clearing or full redraws — only changed cells are updated
- 30fps render loop like htop
- Panels: Runtime, Console, Network, Sources
- Keyboard: Tab/F1-F4 to switch, arrows to scroll, `:` for commands

### Network Inspector
- CDP `Network` domain integration — intercepts all HTTP/HTTPS traffic
- Request/response table with method, status, URL, timing
- Waterfall timing visualization (DNS, connect, TLS, send, wait, receive)

### Source Viewer
- Captures parsed scripts via `Debugger.getScriptSource`
- Shows decrypted/dynamic code even from encrypted files
- Syntax-highlighted source preview

### Beautifier & Deobfuscation (`@hexdtl/beautifier`)
- `hexdtl beautify <file>` — format minified/uglified JS into readable code
- `hexdtl decrypt <file>` — spawn encrypted file with debugger, capture decrypted source, write `debugged.js`
- Auto-detection of minified code
- Deobfuscation transforms: hex/unicode escapes, base64 strings, boolean simplification, void 0 replacement

### NodeJS Execution
- `hexdtl run <file>` — execute a script with full inspector and network monitoring
- Console panel evaluates expressions inside the running process via `Runtime.evaluate`

## Try it

```bash
npm install
npm run dev -- inspect examples/sample-app.js

# htop-style buffer UI
npm run dev -- inspect --buffer examples/sample-app.js

# Beautify a minified file
npx hexdtl beautify minified.js -o readable.js

# Decrypt an encrypted file
npx hexdtl decrypt encrypted.js
```

## Architecture

```
packages/
  core/       ✅ EventBus, normalized event types, terminal primitives
              └ terminal/  ScreenBuffer, TerminalRenderer, InputHandler, ANSI theme
  transport/  ✅ CDP WebSocket client, process launch/attach
  runtime/    ✅ Runtime/Debugger domain → normalized events, evaluate()
  console/    ✅ REPL history wrapper around evaluate()
  network/    ✅ CDP Network domain → request/response/timing events
  sources/    ✅ CDP Debugger → script source capture
  beautifier/ ✅ JS beautifier, deobfuscator, decrypt support
  ui/         ✅ Ink shell + htop-style buffer renderer
  cli/        ✅ `hexdtl inspect`, `attach`, `run`, `decrypt`, `beautify`
```

## CLI Commands

| Command | Description |
|---------|-------------|
| `hexdtl inspect <file>` | Launch file with inspector, open UI |
| `hexdtl inspect --buffer <file>` | Same but with htop-style live UI |
| `hexdtl attach <pid>` | Attach to running process |
| `hexdtl run <file>` | Execute with full inspector |
| `hexdtl decrypt <file>` | Capture decrypted source → debugged.js |
| `hexdtl beautify <file>` | Format minified code |

## Keyboard Shortcuts (Buffer UI)

| Key | Action |
|-----|--------|
| Tab / F1-F4 | Switch panels |
| ↑ / ↓ | Scroll |
| PageUp / PageDown | Scroll faster |
| Home / End | Top / bottom |
| `:` | Command mode |
| `:q` | Quit |
| `:help` | Show commands |
| Ctrl+C | Quit |
