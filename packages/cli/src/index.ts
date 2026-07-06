import { Command } from "commander";
import { CDPClient, launchWithInspect, attachToPid } from "@hexdtl/transport";
import { createSession } from "@hexdtl/core";
import { RuntimeInspector } from "@hexdtl/runtime";
import { NetworkInspector } from "@hexdtl/network";
import { SourcesInspector } from "@hexdtl/sources";
import { startUI, startBufferUI } from "@hexdtl/ui";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { readFile, writeFile } from "node:fs/promises";

const program = new Command();

program.name("hexdtl").description("Chrome DevTools for the terminal").version("0.2.0");

// ── inspect command (original + buffer UI option) ─────────────

program
  .command("inspect <file>")
  .description("Launch a Node.js file with the inspector attached and open the HexDTL UI")
  .option("--no-network", "skip enabling the Network domain")
  .option("--no-sources", "skip script source collection")
  .option("--ink", "use Ink/React UI instead of htop-style buffer (default: buffer)")
  .allowUnknownOption(true)
  .action(async (file: string, opts: { network?: boolean; sources?: boolean; ink?: boolean }, command) => {
    const extraArgs = command.args.slice(1);
    try {
      const target = await launchWithInspect(file, extraArgs);
      if (opts.ink) {
        await runInspectorUI(target.wsUrl, `${file} (pid ${target.pid})`, opts);
      } else {
        await runBufferUI(target.wsUrl, `${file} (pid ${target.pid})`, opts, target.child?.stdout);
      }
    } catch (err) {
      console.error(`hexdtl: failed to launch ${file}:`, (err as Error).message);
      process.exit(1);
    }
  });

// ── attach command ────────────────────────────────────────────

program
  .command("attach <pid>")
  .description("Attach to a running Node.js process by PID")
  .option("-p, --port <port>", "inspector port", "9229")
  .option("--no-network", "skip enabling the Network domain")
  .option("--no-sources", "skip script source collection")
  .option("--ink", "use Ink/React UI instead of htop-style buffer")
  .action(async (pid: string, opts: { port: string; network?: boolean; sources?: boolean; ink?: boolean }) => {
    try {
      const target = await attachToPid(Number(pid), Number(opts.port));
      if (opts.ink) {
        await runInspectorUI(target.wsUrl, `pid ${pid}`, opts);
      } else {
        await runBufferUI(target.wsUrl, `pid ${pid}`, opts);
      }
    } catch (err) {
      console.error(`hexdtl: failed to attach to pid ${pid}:`, (err as Error).message);
      process.exit(1);
    }
  });

// ── run command (execute a script with inspector) ─────────────

program
  .command("run <file>")
  .description("Execute a Node.js file with full inspector and network monitoring")
  .option("--no-network", "skip enabling the Network domain")
  .option("--no-sources", "skip script source collection")
  .allowUnknownOption(true)
  .action(async (file: string, opts: { network?: boolean; sources?: boolean }, command) => {
    const extraArgs = command.args.slice(1);
    try {
      const target = await launchWithInspect(file, extraArgs);
      await runBufferUI(target.wsUrl, `${file} (pid ${target.pid})`, opts, target.child?.stdout);
    } catch (err) {
      console.error(`hexdtl: failed to run ${file}:`, (err as Error).message);
      process.exit(1);
    }
  });

// ── decrypt command ───────────────────────────────────────────

program
  .command("decrypt <file>")
  .description("Decrypt an encrypted/obfuscated JS file by spawning it with debugger and capturing source")
  .option("-o, --output <path>", "output path for the decrypted file")
  .option("--beautify", "also beautify the output", true)
  .option("--max-wait <ms>", "max time to wait for scripts to finish parsing", "8000")
  .action(async (file: string, opts: { output?: string; beautify?: boolean; maxWait?: string }) => {
    let target: Awaited<ReturnType<typeof launchWithInspect>> | undefined;
    let client: CDPClient | undefined;
    // Node's process.exit() can terminate before a wrapping try/finally
    // gets a chance to run, so cleanup is called explicitly at every exit
    // point below rather than relied on via `finally`.
    const cleanup = () => {
      client?.close();
      target?.child?.kill();
    };

    try {
      console.log(`hexdtl: launching ${file} with inspector...`);
      target = await launchWithInspect(file);

      const session = createSession(target.wsUrl);
      client = new CDPClient(target.wsUrl);
      await client.connect();

      const runtime = new RuntimeInspector(client, session.bus);
      await runtime.enable();

      const sources = new SourcesInspector(client, session.bus);
      await sources.enable();

      // Wait until no new scripts have parsed for a bit, instead of an
      // arbitrary fixed delay — that either wastes time on scripts that
      // finish fast, or cuts off scripts that are genuinely slow to load
      // (e.g. behind heavy require chains or lazy decryption routines).
      await waitForScriptsToSettle(sources, Number(opts.maxWait) || 8000);

      const allScripts = sources.getAllScripts();
      if (allScripts.length === 0) {
        console.error("hexdtl: no scripts were parsed from the file");
        cleanup();
        process.exit(1);
      }

      const mainScript = findMainScript(allScripts, file) ?? allScripts[0];

      const { decryptScript, beautify, deobfuscate } = await import("@hexdtl/beautifier");

      let sourceToWrite = mainScript.source;
      let beautifiedChars: number | undefined;
      if (opts.beautify) {
        const deob = deobfuscate(mainScript.source);
        sourceToWrite = beautify(deob.source);
        beautifiedChars = sourceToWrite.length;
      }

      // Reuse the shared decryptScript() writer instead of duplicating its
      // path-resolution logic here — this is the same function @hexdtl/beautifier
      // exports and tests, so `-o` behaves identically to calling it directly.
      const result = opts.output
        ? await decryptScript(file, sourceToWrite, opts.output, { exactOutputPath: true })
        : await decryptScript(file, sourceToWrite);

      if (!result.success) {
        console.error(`hexdtl: failed to write decrypted output: ${result.error}`);
        cleanup();
        process.exit(1);
      }

      if (opts.beautify) {
        console.log(`hexdtl: decrypted + beautified → ${result.outputPath}`);
        console.log(`  original: ${allScripts.length} script(s) parsed`);
        console.log(`  output: ${mainScript.source.length} chars → ${beautifiedChars} chars`);
      } else {
        console.log(`hexdtl: decrypted → ${result.outputPath}`);
      }

      if (allScripts.length > 1) {
        console.log(`\n  All parsed scripts:`);
        for (const s of allScripts) {
          const lines = s.source.split("\n").length;
          console.log(`    ${s.url} (${lines} lines)`);
        }
      }

      cleanup();
      process.exit(0);
    } catch (err) {
      console.error(`hexdtl: failed to decrypt ${file}:`, (err as Error).message);
      cleanup();
      process.exit(1);
    }
  });

/**
 * Poll until the set of parsed scripts stops growing (checked twice in a
 * row) or maxWaitMs elapses, whichever comes first. Always waits at least
 * one poll interval so fast scripts still get one chance to be observed.
 */
async function waitForScriptsToSettle(sources: SourcesInspector, maxWaitMs: number): Promise<void> {
  const pollMs = 150;
  const start = Date.now();
  let lastCount = -1;
  let stableRounds = 0;

  while (Date.now() - start < maxWaitMs) {
    await new Promise((r) => setTimeout(r, pollMs));
    const count = sources.getAllScripts().length;
    if (count === lastCount) {
      stableRounds++;
      if (stableRounds >= 2) return;
    } else {
      stableRounds = 0;
      lastCount = count;
    }
  }
}

/**
 * Match the parsed script that corresponds to the file we launched.
 * Previously this compared `resolve(file).slice(-30)` against script URLs —
 * an arbitrary 30-character substring match that could pick the wrong
 * script for long nested paths where the differentiating directory name
 * falls outside that window. Compare full resolved filesystem paths instead.
 */
function findMainScript(
  scripts: ReturnType<SourcesInspector["getAllScripts"]>,
  file: string,
): (typeof scripts)[number] | undefined {
  const target = resolve(file);
  return scripts.find((s) => {
    if (!s.url.startsWith("file://")) return false;
    try {
      return fileURLToPath(s.url) === target;
    } catch {
      return false;
    }
  });
}

// ── beautify command ──────────────────────────────────────────

program
  .command("beautify <file>")
  .description("Beautify/format a JavaScript file in-place or to output")
  .option("-o, --output <path>", "output path (defaults to overwriting the file)")
  .option("--no-deobfuscate", "skip deobfuscation transforms")
  .action(async (file: string, opts: { output?: string; deobfuscate?: boolean }) => {
    try {
      const { beautify } = await import("@hexdtl/beautifier");
      const source = await readFile(resolve(file), "utf-8");
      let code = source;
      if (opts.deobfuscate !== false) {
        const { deobfuscate } = await import("@hexdtl/beautifier");
        code = deobfuscate(code).source;
      }
      const result = beautify(code);
      const outputPath = opts.output ? resolve(opts.output) : resolve(file);
      await writeFile(outputPath, result, "utf-8");
      console.log(`hexdtl: beautified → ${outputPath}`);
      console.log(`  ${source.length} → ${result.length} chars`);
    } catch (err) {
      console.error(`hexdtl: failed to beautify ${file}:`, (err as Error).message);
      process.exit(1);
    }
  });

// ── run with buffer UI (htop-style) ──────────────────────────

async function runBufferUI(
  wsUrl: string,
  label: string,
  flags?: { network?: boolean; sources?: boolean },
  childStdout?: NodeJS.ReadableStream | null,
): Promise<void> {
  const session = createSession(wsUrl);
  const client = new CDPClient(wsUrl);
  await client.connect();
  session.bus.emit("connection:open", { targetUrl: wsUrl });

  const enableNetwork = flags?.network ?? true;
  const enableSources = flags?.sources ?? true;

  // Enable Debugger/Sources BEFORE Runtime so scriptParsed events are captured
  const sources = enableSources ? new SourcesInspector(client, session.bus) : undefined;
  if (sources) await sources.enable();

  const network = enableNetwork ? new NetworkInspector(client, session.bus) : undefined;
  if (network) await network.enable();

  const runtime = new RuntimeInspector(client, session.bus);
  await runtime.enable();

  const { waitUntilExit } = startBufferUI({
    bus: session.bus,
    runtime,
    network,
    sources,
    targetLabel: label,
    childStdout,
  });

  const cleanup = () => {
    runtime.dispose();
    network?.dispose();
    sources?.dispose();
    client.close();
  };
  process.once("SIGINT", () => {
    cleanup();
    process.exit(0);
  });

  await waitUntilExit();
  cleanup();
}

// ── run with Ink UI (original) ───────────────────────────────

async function runInspectorUI(
  wsUrl: string,
  label: string,
  flags?: { network?: boolean; sources?: boolean },
): Promise<void> {
  const session = createSession(wsUrl);
  const client = new CDPClient(wsUrl);
  await client.connect();
  session.bus.emit("connection:open", { targetUrl: wsUrl });

  const enableNetwork = flags?.network ?? true;
  const enableSources = flags?.sources ?? true;

  // Enable Debugger/Sources BEFORE Runtime so scriptParsed events are captured
  const sources = enableSources ? new SourcesInspector(client, session.bus) : undefined;
  if (sources) await sources.enable();

  const network = enableNetwork ? new NetworkInspector(client, session.bus) : undefined;
  if (network) await network.enable();

  const runtime = new RuntimeInspector(client, session.bus);
  await runtime.enable();

  const { waitUntilExit } = startUI(session.bus, runtime, label, network, sources);

  const cleanup = () => {
    runtime.dispose();
    network?.dispose();
    sources?.dispose();
    client.close();
  };
  process.once("SIGINT", () => {
    cleanup();
    process.exit(0);
  });

  await waitUntilExit();
  cleanup();
}

program.parseAsync(process.argv);
