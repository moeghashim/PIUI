export type JsonObject = Record<string, unknown>;

export interface BrowserStartMessage {
  kind: "start";
  cwd: string;
  trust: boolean;
  sessionPath?: string;
}

export interface BrowserCommandMessage {
  kind: "command";
  command: JsonObject & { type: string };
}

export interface BrowserExtensionResponseMessage {
  kind: "extension_response";
  response: JsonObject & { type: "extension_ui_response"; id: string };
}

export type BrowserMessage =
  | BrowserStartMessage
  | BrowserCommandMessage
  | BrowserExtensionResponseMessage
  | { kind: "stop_runtime" }
  | { kind: "refresh_catalog"; cwd?: string };

export interface ServerEnvelope {
  kind: "pi" | "runtime" | "catalog" | "diagnostic" | "server_error";
  payload: unknown;
}

export function isBrowserMessage(value: unknown): value is BrowserMessage {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  if (record.kind === "stop_runtime") return true;
  if (record.kind === "refresh_catalog") return record.cwd === undefined || typeof record.cwd === "string";
  if (record.kind === "start") {
    return (
      typeof record.cwd === "string" &&
      typeof record.trust === "boolean" &&
      (record.sessionPath === undefined || typeof record.sessionPath === "string")
    );
  }
  if (record.kind === "command") {
    return Boolean(record.command && typeof record.command === "object" && typeof (record.command as JsonObject).type === "string");
  }
  if (record.kind === "extension_response") {
    const response = record.response as JsonObject | undefined;
    return response?.type === "extension_ui_response" && typeof response.id === "string";
  }
  return false;
}
