import React from "react";
import { Box, Text } from "ink";
import type { ConsoleEvent, ExceptionEvent, ExecutionEvent } from "@hexdtl/core";

export type FeedItem =
  | { kind: "console"; id: number; event: ConsoleEvent }
  | { kind: "exception"; id: number; event: ExceptionEvent }
  | { kind: "execution"; id: number; event: ExecutionEvent };

const LEVEL_COLOR: Record<string, string> = {
  log: "white",
  info: "blue",
  warn: "yellow",
  error: "red",
  debug: "gray",
  trace: "magenta",
  table: "cyan",
};

function timeLabel(ts: number): string {
  return new Date(ts).toLocaleTimeString(undefined, { hour12: false });
}

function FeedLine({ item }: { item: FeedItem }) {
  if (item.kind === "console") {
    const color = LEVEL_COLOR[item.event.level] ?? "white";
    return (
      <Text>
        <Text dimColor>{timeLabel(item.event.timestampMs)} </Text>
        <Text color={color}>
          {item.event.level.padEnd(5)} {item.event.text}
        </Text>
      </Text>
    );
  }
  if (item.kind === "exception") {
    return (
      <Text>
        <Text dimColor>{timeLabel(item.event.timestampMs)} </Text>
        <Text color="red" bold>✖ {item.event.message}</Text>
      </Text>
    );
  }
  return (
    <Text>
      <Text dimColor>{timeLabel(item.event.timestampMs)} </Text>
      <Text color="green">▸ {item.event.location.file}:{item.event.location.line}</Text>
    </Text>
  );
}

export function ExecutionFeed({ items }: { items: FeedItem[] }) {
  const visible = items.slice(-200);
  return (
    <Box flexDirection="column" flexGrow={1} paddingX={1}>
      {visible.length === 0 ? (
        <Text dimColor>waiting for activity…</Text>
      ) : (
        visible.map((item) => <FeedLine key={`${item.kind}-${item.id}`} item={item} />)
      )}
    </Box>
  );
}
