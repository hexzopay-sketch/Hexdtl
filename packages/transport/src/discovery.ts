import { spawn, type ChildProcess } from "node:child_process";
import http from "node:http";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const preloadPath = resolve(__dirname, "network-preload.cjs");

export interface DebugTarget {
  wsUrl: string;
  httpPort: number;
  child?: ChildProcess;
  pid: number;
}

const LISTENING_RE = /Debugger listening on (ws:\/\/[^\s]+)/;

/**
 * Spawn `node <file> [args]` with the inspector enabled on an
 * ephemeral port, and resolve once the debugger WebSocket URL is
 * known (parsed straight from the process's own stderr banner —
 * the same line `node --inspect` prints in a normal terminal).
 *
 * Also injects the network preload script via `--require` to
 * monkey-patch http.request and capture HTTP traffic for the
 * Network panel (Node.js CDP does not emit network events for
 * user-level http module requests).
 */
export function launchWithInspect(file: string, args: string[] = []): Promise<DebugTarget> {
  return new Promise((resolve, reject) => {
    const stdioMode = process.env.HEXDTL_SHOW_OUTPUT ? "inherit" : "pipe";
    const child = spawn(
      process.execPath,
      ["--inspect=0", "--require", preloadPath, file, ...args],
      {
        stdio: ["inherit", stdioMode, "pipe"],
      },
    );

    let stderrAccum = "";

    const timer = setTimeout(() => {
      reject(new Error(`Timed out waiting for inspector banner from ${file}`));
    }, 8000);

    const showOutput = Boolean(process.env.HEXDTL_SHOW_OUTPUT);

    child.stderr?.on("data", (chunk: Buffer) => {
      // stderr must always be piped (not inherited) so we can scan for the
      // inspector banner, but that means the child's own stderr writes
      // (console.error, uncaught exceptions) were previously never
      // reaching the terminal even when HEXDTL_SHOW_OUTPUT was set.
      if (showOutput) process.stderr.write(chunk);
      stderrAccum += chunk.toString();
      const match = stderrAccum.match(LISTENING_RE);
      if (match) {
        clearTimeout(timer);
        const wsUrl = match[1];
        const httpPort = Number(new URL(wsUrl).port);
        // Give inspector WS a moment to be ready
        setTimeout(() => resolve({ wsUrl, httpPort, child, pid: child.pid! }), 200);
      }
    });

    child.once("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });

    child.once("exit", (code) => {
      clearTimeout(timer);
      reject(
        new Error(
          `Process exited (code ${code}) before inspector was ready. stderr: ${stderrAccum.slice(-200)}`,
        ),
      );
    });
  });
}

/**
 * Attach to an already-running Node process by PID. This requires
 * the process to already be listening for --inspect (Node only
 * opens the inspector port when started with that flag, or when
 * sent SIGUSR1 on POSIX systems — we do the latter here).
 *
 * Note: When attaching to an existing process, the network preload
 * is NOT injected (it can only be set up at process start).
 */
export async function attachToPid(pid: number, port = 9229): Promise<DebugTarget> {
  if (process.platform !== "win32") {
    try {
      process.kill(pid, "SIGUSR1");
    } catch (err) {
      throw new Error(`Could not signal pid ${pid}: ${(err as Error).message}`);
    }
    // Give the process a moment to open its inspector port.
    await new Promise((r) => setTimeout(r, 300));
  }

  const target = await findDebuggerTarget(port);
  return { wsUrl: target.webSocketDebuggerUrl, httpPort: port, pid };
}

interface RawTarget {
  webSocketDebuggerUrl: string;
  type: string;
  title: string;
}

function findDebuggerTarget(port: number, retries = 10): Promise<RawTarget> {
  return new Promise((resolve, reject) => {
    const attempt = (remaining: number) => {
      const req = http
        .get(
          { host: "127.0.0.1", port, path: "/json", timeout: 1000 },
          (res) => {
            let body = "";
            res.on("data", (c) => (body += c));
            res.on("end", () => {
              try {
                const targets: RawTarget[] = JSON.parse(body);
                const nodeTarget = targets.find((t) => t.type === "node") ?? targets[0];
                if (nodeTarget) resolve(nodeTarget);
                else retry(remaining);
              } catch (err) {
                retry(remaining);
              }
            });
          },
        )
        .on("error", () => retry(remaining));
      // The `timeout` option alone doesn't abort the request — it just
      // emits a 'timeout' event. Without destroying it here, a stalled
      // connection never fires 'error' or 'end' and retries stop happening.
      req.on("timeout", () => req.destroy(new Error("discovery request timed out")));
    };
    const retry = (remaining: number) => {
      if (remaining <= 0) {
        reject(new Error(`No inspector target found on port ${port}`));
        return;
      }
      setTimeout(() => attempt(remaining - 1), 250);
    };
    attempt(retries);
  });
}
