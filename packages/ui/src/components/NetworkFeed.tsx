import React from "react";
import { Box, Text } from "ink";
import type { NetworkEvent } from "@hexdtl/core";

export interface NetworkFeedItem {
  id: number;
  event: NetworkEvent;
}

export function NetworkFeed({ items }: { items: NetworkFeedItem[] }) {
  const visible = items.slice(-100);

  if (visible.length === 0) {
    return (
      <Box flexGrow={1} paddingX={1}>
        <Text dimColor>waiting for network requests…</Text>
      </Box>
    );
  }

  return (
    <Box flexGrow={1} flexDirection="column" paddingX={1}>
      <Box>
        <Box width={7}><Text bold color="gray">METHOD</Text></Box>
        <Box width={7}><Text bold color="gray">STATUS</Text></Box>
        <Box flexGrow={1}><Text bold color="gray">URL</Text></Box>
        <Box width={8}><Text bold color="gray">TIME</Text></Box>
      </Box>
      <Box flexDirection="column" marginTop={1}>
        {visible.map((item) => {
          const req = item.event.request;
          const res = item.event.response;
          const methodColor = req.method === "GET" ? "green" : req.method === "POST" ? "yellow" : "cyan";
          const statusCode = res?.statusCode ?? 0;
          const statusColor = statusCode >= 200 && statusCode < 300 ? "green" : statusCode >= 400 ? "red" : "yellow";
          const duration = item.event.totalDurationMs ?? 0;

          return (
            <Box key={item.id}>
              <Box width={7}>
                <Text color={methodColor}>{req.method}</Text>
              </Box>
              <Box width={7}>
                {statusCode > 0 ? (
                  <Text color={statusColor}>{statusCode}</Text>
                ) : (
                  <Text dimColor>…</Text>
                )}
              </Box>
              <Box flexGrow={1}>
                <Text wrap="truncate">{req.url}</Text>
              </Box>
              <Box width={8}>
                <Text dimColor>{duration > 0 ? `${duration}ms` : "…"}</Text>
              </Box>
            </Box>
          );
        })}
      </Box>
    </Box>
  );
}
