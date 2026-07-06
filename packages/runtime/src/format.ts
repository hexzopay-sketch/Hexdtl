interface RemoteObject {
  type: string;
  subtype?: string;
  value?: unknown;
  description?: string;
  className?: string;
  preview?: ObjectPreview;
}

interface PropertyPreview {
  name: string;
  type: string;
  value?: string;
  subtype?: string;
}

interface ObjectPreview {
  type: string;
  subtype?: string;
  description?: string;
  overflow: boolean;
  properties: PropertyPreview[];
}

function formatPropertyValue(prop: PropertyPreview): string {
  if (prop.type === "string") return `"${prop.value ?? ""}"`;
  if (prop.type === "undefined") return "undefined";
  if (prop.type === "object" && prop.subtype === "null") return "null";
  if (prop.type === "object" && !prop.value) return prop.subtype ?? "Object";
  return prop.value ?? "undefined";
}

/** Render a CDP RemoteObject the way a terminal console should print it. */
export function formatRemoteObject(obj: RemoteObject | undefined): string {
  if (!obj) return "undefined";
  switch (obj.type) {
    case "undefined":
      return "undefined";
    case "string":
      return typeof obj.value === "string" ? obj.value : (obj.description ?? "");
    case "number":
    case "boolean":
    case "bigint":
      return String(obj.value ?? obj.description);
    case "object":
      if (obj.subtype === "null") return "null";
      if (obj.subtype === "array") return obj.description ?? "Array";
      if (obj.preview) {
        const parts = obj.preview.properties.map(
          (p) => `${p.name}: ${formatPropertyValue(p)}`
        );
        const suffix = obj.preview.overflow ? ", …" : "";
        return `{${parts.join(", ")}${suffix}}`;
      }
      return obj.description ?? obj.className ?? "Object";
    case "function":
      return obj.description ?? "function";
    default:
      return obj.description ?? String(obj.value ?? "");
  }
}

interface CallFrame {
  functionName: string;
  url: string;
  lineNumber: number;
  columnNumber: number;
}

export function formatCallFrame(frame: CallFrame): {
  file: string;
  line: number;
  column: number;
  functionName?: string;
} {
  return {
    file: frame.url.replace(/^file:\/\//, "") || "<anonymous>",
    line: frame.lineNumber + 1, // CDP is 0-indexed, humans expect 1-indexed
    column: frame.columnNumber + 1,
    functionName: frame.functionName || "<anonymous>",
  };
}
