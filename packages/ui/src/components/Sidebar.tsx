import React from "react";
import { Box, Text } from "ink";

export type PanelId = "runtime" | "console" | "network" | "sources";

const PANELS: Array<{ id: PanelId; label: string }> = [
  { id: "runtime", label: "Runtime" },
  { id: "console", label: "Console" },
  { id: "network", label: "Network" },
  { id: "sources", label: "Sources" },
];

export function Sidebar({ active }: { active: PanelId }) {
  return (
    <Box flexDirection="column" width={18} borderStyle="round" borderColor="gray" paddingX={1}>
      <Text bold color="cyan">
        HexDTL
      </Text>
      <Box marginTop={1} flexDirection="column">
        {PANELS.map((p) => (
          <Text key={p.id} color={p.id === active ? "black" : "white"} backgroundColor={p.id === active ? "cyan" : undefined}>
            {p.id === active ? "› " : "  "}
            {p.label}
          </Text>
        ))}
      </Box>
      <Box marginTop={1}>
        <Text dimColor>Tab: switch</Text>
      </Box>
      <Box>
        <Text dimColor>q: quit</Text>
      </Box>
    </Box>
  );
}
