import React, { useEffect, useState, useCallback, useRef } from "react";
import { Box, Text, useApp, useInput } from "ink";
import TextInput from "ink-text-input";
import type { EventBus } from "@hexdtl/core";
import type { RuntimeInspector } from "@hexdtl/runtime";
import type { NetworkInspector } from "@hexdtl/network";
import type { SourcesInspector, SourceScript } from "@hexdtl/sources";
import { InteractiveConsole, type ConsoleEntry } from "@hexdtl/console";
import { ExecutionFeed, type FeedItem } from "./components/ExecutionFeed.js";
import { ConsolePanel } from "./components/ConsolePanel.js";
import { NetworkFeed, type NetworkFeedItem } from "./components/NetworkFeed.js";
import { SourcesPanel } from "./components/SourcesPanel.js";

type PanelId = "runtime" | "console" | "network" | "sources";

const PANEL_LABELS: Record<PanelId, string> = {
  runtime: "Runtime",
  console: "Console",
  network: "Network",
  sources: "Sources",
};

const PANEL_ORDER: PanelId[] = ["runtime", "console", "network", "sources"];

const CMD_HELP = [
  { cmd: "run", desc: "runtime tab" },
  { cmd: "con", desc: "console tab" },
  { cmd: "net", desc: "network tab" },
  { cmd: "src", desc: "sources tab" },
  { cmd: "q", desc: "quit" },
  { cmd: "clear", desc: "clear output" },
  { cmd: "help", desc: "this help" },
];

interface Props {
  bus: EventBus;
  runtime: RuntimeInspector;
  network?: NetworkInspector;
  sources?: SourcesInspector;
  targetLabel: string;
}

export function App({ bus, runtime, network, sources, targetLabel }: Props) {
  const { exit } = useApp();
  const [panel, setPanel] = useState<PanelId>("runtime");
  const [feed, setFeed] = useState<FeedItem[]>([]);
  const [networkItems, setNetworkItems] = useState<NetworkFeedItem[]>([]);
  const [scripts, setScripts] = useState<SourceScript[]>([]);
  const [history, setHistory] = useState<ConsoleEntry[]>([]);
  const [busy, setBusy] = useState(false);
  const [cmdValue, setCmdValue] = useState("");
  const [cmdMode, setCmdMode] = useState(false);
  const [statusMsg, setStatusMsg] = useState("");
  const idRef = useRef(0);
  const netIdRef = useRef(0);
  const consoleRef = useRef<InteractiveConsole>(null!);
  if (!consoleRef.current) consoleRef.current = new InteractiveConsole(runtime);

  useEffect(() => {
    const offConsole = bus.on("runtime:console", (event) => {
      idRef.current += 1;
      setFeed((prev) => [...prev, { kind: "console", id: idRef.current, event }]);
    });
    const offExec = bus.on("runtime:execution", (event) => {
      idRef.current += 1;
      setFeed((prev) => [...prev, { kind: "execution", id: idRef.current, event }]);
    });
    const offException = bus.on("runtime:exception", (event) => {
      idRef.current += 1;
      setFeed((prev) => [...prev, { kind: "exception", id: idRef.current, event }]);
    });
    const offNetReq = bus.on("network:request", (event) => {
      netIdRef.current += 1;
      setNetworkItems((prev) => [...prev, { id: netIdRef.current, event }]);
    });
    const offNetResp = bus.on("network:response", (event) => {
      setNetworkItems((prev) =>
        prev.map((item) =>
          item.event.request.id === event.request.id ? { ...item, event } : item,
        ),
      );
    });
    const offNetDone = bus.on("network:completed", (event) => {
      setNetworkItems((prev) =>
        prev.map((item) =>
          item.event.request.id === event.request.id ? { ...item, event } : item,
        ),
      );
    });
    const offScript = bus.on("source:scriptParsed", (script) => {
      setScripts((prev) => {
        const exists = prev.some((s) => s.scriptId === script.scriptId);
        return exists ? prev : [...prev, script];
      });
    });
    return () => {
      offConsole(); offExec(); offException();
      offNetReq(); offNetResp(); offNetDone(); offScript();
    };
  }, [bus]);

  const executeCmd = useCallback((input: string) => {
    const trimmed = input.trim().toLowerCase();
    setCmdValue("");

    if (!trimmed) { setCmdMode(false); return; }

    if (trimmed === "q") { exit(); return; }

    if (trimmed === "clear") {
      setFeed([]);
      setNetworkItems([]);
      setScripts([]);
      setHistory([]);
      setStatusMsg("cleared");
      setCmdMode(false);
      return;
    }

    if (trimmed === "help") {
      setStatusMsg("run con net src q clear");
      setCmdMode(false);
      return;
    }

    const cmdMap: Record<string, PanelId> = {
      run: "runtime",
      runtime: "runtime",
      con: "console",
      console: "console",
      net: "network",
      network: "network",
      src: "sources",
      sources: "sources",
    };

    if (trimmed in cmdMap) {
      const target = cmdMap[trimmed];
      if (target === "network" && !network) {
        setStatusMsg("network not enabled (use --no-network to skip)");
      } else if (target === "sources" && !sources) {
        setStatusMsg("sources not enabled (use --no-sources to skip)");
      } else {
        setPanel(target);
        setStatusMsg(target);
      }
      setCmdMode(false);
      return;
    }

    // Unknown command — run as JS expression in console panel
    setPanel("console");
    setStatusMsg("eval");
    handleEvaluate(trimmed);
    setCmdMode(false);
  }, [exit, network, sources]);

  useInput((input, key) => {
    if (key.escape) { setCmdMode(false); setCmdValue(""); return; }
    if (input === ":" || input === ";") { setCmdMode(true); return; }
    if (key.tab) {
      const idx = PANEL_ORDER.indexOf(panel);
      const next = PANEL_ORDER[(idx + 1) % PANEL_ORDER.length];
      setPanel(next);
      setStatusMsg(next);
      return;
    }
    if (input === "q") { exit(); return; }
  });

  const handleEvaluate = useCallback(async (expression: string) => {
    setBusy(true);
    const entry = await consoleRef.current!.run(expression);
    setHistory((prev) => [...prev, entry]);
    setBusy(false);
  }, []);

  const statusLine = `[${PANEL_LABELS[panel]}] ${statusMsg ? `| ${statusMsg}` : ""}`;

  return (
    <Box flexDirection="column">
      {/* header */}
      <Box>
        <Text bold color="cyan">hexdtl</Text>
        <Text> </Text>
        <Text dimColor>attached to</Text>
        <Text> </Text>
        <Text color="green" bold>{targetLabel}</Text>
        <Text> </Text>
        <Text dimColor>{statusLine}</Text>
      </Box>

      {/* main content */}
      <Box marginTop={1} height="100%">
        {panel === "runtime" ? (
          <ExecutionFeed items={feed} />
        ) : panel === "console" ? (
          <ConsolePanel history={history} onSubmit={handleEvaluate} busy={busy} />
        ) : panel === "network" ? (
          <NetworkFeed items={networkItems} />
        ) : (
          <SourcesPanel scripts={scripts} />
        )}
      </Box>

      {/* command bar */}
      <Box>
        <Text bold color="yellow">{cmdMode ? ":" : ":"}</Text>
        {cmdMode ? (
          <TextInput
            value={cmdValue}
            onChange={setCmdValue}
            onSubmit={executeCmd}
            placeholder="run | con | net | src | q | clear | help"
          />
        ) : (
          <Text dimColor> run con net src q clear help — press : or ; for command</Text>
        )}
      </Box>
    </Box>
  );
}
