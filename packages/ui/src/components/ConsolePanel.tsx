import React, { useState } from "react";
import { Box, Text } from "ink";
import TextInput from "ink-text-input";
import type { ConsoleEntry } from "@hexdtl/console";

interface Props {
  history: ConsoleEntry[];
  onSubmit: (expression: string) => void;
  busy: boolean;
}

export function ConsolePanel({ history, onSubmit, busy }: Props) {
  const [value, setValue] = useState("");

  const handleSubmit = (expr: string) => {
    if (!expr.trim() || busy) return;
    onSubmit(expr);
    setValue("");
  };

  const visible = history.slice(-100);

  return (
    <Box flexDirection="column" flexGrow={1} paddingX={1}>
      {visible.length === 0 && (
        <Text dimColor>type an expression and press enter — runs inside the process</Text>
      )}
      {visible.map((entry) => (
        <Box key={entry.id} flexDirection="column">
          <Box>
            <Text color="cyan">&gt; </Text>
            <Text>{entry.expression}</Text>
          </Box>
          <Box>
            <Text>  </Text>
            <Text color={entry.result.ok ? "white" : "red"}>{entry.result.display}</Text>
          </Box>
        </Box>
      ))}
      <Box marginTop={1}>
        <Text color="cyan">&gt; </Text>
        <TextInput
          value={value}
          onChange={setValue}
          onSubmit={handleSubmit}
          placeholder={busy ? "evaluating…" : ""}
        />
      </Box>
    </Box>
  );
}
