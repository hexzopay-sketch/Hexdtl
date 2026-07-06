import React from "react";
import { Box, Text } from "ink";
import type { SourceScript } from "@hexdtl/core";

interface Props {
  scripts: SourceScript[];
}

export function SourcesPanel({ scripts }: Props) {
  if (scripts.length === 0) {
    return (
      <Box flexGrow={1} paddingX={1}>
        <Text dimColor>no scripts loaded yet</Text>
      </Box>
    );
  }

  return (
    <Box flexGrow={1} flexDirection="column" paddingX={1}>
      <Box>
        <Text bold color="gray">{scripts.length} scripts</Text>
      </Box>
      <Box flexDirection="column" marginTop={1}>
        {scripts.slice(-50).map((script) => {
          const displayUrl = script.url.length > 60 ? "..." + script.url.slice(-57) : script.url;
          const lineCount = script.source.split("\n").length;
          return (
            <Box key={script.scriptId}>
              <Text color="green">▸ </Text>
              <Text wrap="truncate">{displayUrl}</Text>
              <Text dimColor> ({lineCount} lines)</Text>
            </Box>
          );
        })}
      </Box>
    </Box>
  );
}
