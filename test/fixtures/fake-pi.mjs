#!/usr/bin/env node
if (process.argv.includes("list")) {
  process.stdout.write(`User packages:\n  npm:pi-fake-extension\n    ${process.cwd()}/test/fixtures/fake-extension\n`);
  process.exit(0);
}

const state = {
  model: { provider: "fake", id: "pi-test", name: "PI Test", reasoning: true, contextWindow: 32000, maxTokens: 4096 },
  thinkingLevel: "medium",
  isStreaming: false,
  isCompacting: false,
  steeringMode: "all",
  followUpMode: "one-at-a-time",
  sessionFile: "/tmp/fake-pi-session.jsonl",
  sessionId: "fake-session",
  sessionName: "Fixture session",
  autoCompactionEnabled: true,
  messageCount: 0,
  pendingMessageCount: 0,
};
let buffer = "";
let pendingDialog;

const write = (value) => process.stdout.write(`${JSON.stringify(value)}\n`);
write({ type: "extension_ui_request", id: "status-1", method: "setStatus", statusKey: "fake", statusText: "Fixture extension ready" });
write({ type: "extension_ui_request", id: "widget-1", method: "setWidget", widgetKey: "fake", widgetLines: ["Fixture extension · web compatible"] });

process.stdin.on("data", (chunk) => {
  buffer += chunk.toString();
  let newline = buffer.indexOf("\n");
  while (newline >= 0) {
    const line = buffer.slice(0, newline).replace(/\r$/, "");
    buffer = buffer.slice(newline + 1);
    if (line.trim()) handle(JSON.parse(line));
    newline = buffer.indexOf("\n");
  }
});

function handle(command) {
  if (command.type === "extension_ui_response") {
    if (pendingDialog === command.id) {
      pendingDialog = undefined;
      streamPrompt(`Extension confirmed: ${command.confirmed === true ? "yes" : "no"}`, "dialog result");
    }
    return;
  }
  if (command.type === "get_state") return write({ id: command.id, type: "response", command: command.type, success: true, data: state });
  if (command.type === "get_messages") return write({ id: command.id, type: "response", command: command.type, success: true, data: { messages: [] } });
  if (command.type === "get_available_models") return write({ id: command.id, type: "response", command: command.type, success: true, data: { models: [state.model] } });
  if (command.type === "get_available_thinking_levels") return write({ id: command.id, type: "response", command: command.type, success: true, data: { levels: ["off", "low", "medium", "high"] } });
  if (command.type === "get_commands") return write({ id: command.id, type: "response", command: command.type, success: true, data: { commands: [{ name: "dialog", description: "Test extension dialog", source: "extension", sourceInfo: { path: "fixture" } }, { name: "review", description: "Review changes", source: "skill", sourceInfo: { path: "fixture" } }] } });
  if (command.type === "get_session_stats") return write({ id: command.id, type: "response", command: command.type, success: true, data: { tokens: { total: 24 }, cost: 0 } });
  if (command.type === "get_entries") return write({ id: command.id, type: "response", command: command.type, success: true, data: { entries: [], leafId: null } });
  if (command.type === "set_model") { state.model = { ...state.model, provider: command.provider, id: command.modelId }; return write({ id: command.id, type: "response", command: command.type, success: true, data: state.model }); }
  if (command.type === "set_thinking_level") { state.thinkingLevel = command.level; write({ type: "thinking_level_changed", level: command.level }); return write({ id: command.id, type: "response", command: command.type, success: true }); }
  if (command.type === "set_session_name") { state.sessionName = command.name; write({ type: "session_info_changed", name: command.name }); return write({ id: command.id, type: "response", command: command.type, success: true }); }
  if (command.type === "clone") return write({ id: command.id, type: "response", command: command.type, success: true, data: { cancelled: false } });
  if (command.type === "abort") { write({ id: command.id, type: "response", command: command.type, success: true }); return write({ type: "agent_settled" }); }
  if (command.type === "prompt") {
    write({ id: command.id, type: "response", command: command.type, success: true });
    if (String(command.message).startsWith("/dialog")) {
      pendingDialog = "dialog-1";
      return write({ type: "extension_ui_request", id: pendingDialog, method: "confirm", title: "Fixture extension", message: "Allow the test extension to continue?" });
    }
    return streamPrompt(String(command.message), "PIUI fixture response");
  }
  write({ id: command.id, type: "response", command: command.type, success: true });
}

function streamPrompt(userText, answer) {
  const now = Date.now();
  write({ type: "agent_start" });
  write({ type: "message_start", message: { role: "user", content: userText, timestamp: now } });
  write({ type: "message_end", message: { role: "user", content: userText, timestamp: now } });
  write({ type: "message_start", message: { role: "assistant", content: [], provider: "fake", model: "pi-test", stopReason: "pending", timestamp: now + 1 } });
  write({ type: "message_update", usage: { totalTokens: 1, cost: { total: 0 } }, assistantMessageEvent: { type: "text_start", contentIndex: 0 } });
  write({ type: "message_update", usage: { totalTokens: 2, cost: { total: 0 } }, assistantMessageEvent: { type: "text_delta", contentIndex: 0, delta: `${answer}\u2028` } });
  write({ type: "message_update", usage: { totalTokens: 3, cost: { total: 0 } }, assistantMessageEvent: { type: "text_delta", contentIndex: 0, delta: " with a tool." } });
  const call = { type: "toolCall", id: "tool-1", name: "read", arguments: { path: "README.md" } };
  write({ type: "message_update", usage: { totalTokens: 4, cost: { total: 0 } }, assistantMessageEvent: { type: "toolcall_end", contentIndex: 1, toolCall: call } });
  write({ type: "message_end", message: { role: "assistant", content: [{ type: "text", text: `${answer}\u2028 with a tool.` }, call], provider: "fake", model: "pi-test", stopReason: "toolUse", timestamp: now + 1, usage: { totalTokens: 4, cost: { total: 0 } } } });
  write({ type: "tool_execution_start", toolCallId: "tool-1", toolName: "read", args: { path: "README.md" } });
  write({ type: "tool_execution_update", toolCallId: "tool-1", toolName: "read", args: { path: "README.md" }, partialResult: { content: [{ type: "text", text: "# PIUI" }] } });
  write({ type: "tool_execution_end", toolCallId: "tool-1", toolName: "read", result: { content: [{ type: "text", text: "# PIUI" }] }, isError: false });
  write({ type: "message_start", message: { role: "toolResult", toolCallId: "tool-1", toolName: "read", content: [{ type: "text", text: "# PIUI" }], isError: false, timestamp: now + 2 } });
  write({ type: "message_end", message: { role: "toolResult", toolCallId: "tool-1", toolName: "read", content: [{ type: "text", text: "# PIUI" }], isError: false, timestamp: now + 2 } });
  write({ type: "agent_end", messages: [], willRetry: false });
  write({ type: "agent_settled" });
}

process.on("SIGTERM", () => process.exit(0));
