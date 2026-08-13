import type { AgentMessage, ToolExecution } from "./types";

export interface ConversationState {
  messages: AgentMessage[];
  streaming: AgentMessage | undefined;
  tools: Record<string, ToolExecution>;
  steering: string[];
  followUp: string[];
  settled: boolean;
}

export const emptyConversation: ConversationState = {
  messages: [],
  streaming: undefined,
  tools: {},
  steering: [],
  followUp: [],
  settled: true,
};

export function reducePiEvent(state: ConversationState, payload: unknown): ConversationState {
  if (!payload || typeof payload !== "object") return state;
  const event = payload as Record<string, unknown>;
  if (event.type === "response" && event.command === "get_messages" && event.success === true) {
    const data = event.data as { messages?: AgentMessage[] } | undefined;
    return { ...state, messages: data?.messages ?? [], streaming: undefined };
  }
  if (event.type === "agent_start") return { ...state, settled: false };
  if (event.type === "agent_settled") return { ...state, settled: true };
  if (event.type === "message_start") {
    const message = event.message as AgentMessage | undefined;
    return message?.role === "assistant" ? { ...state, streaming: structuredClone(message) } : state;
  }
  if (event.type === "message_update") {
    const update = event.assistantMessageEvent as Record<string, unknown> | undefined;
    if (!update) return state;
    return { ...state, streaming: applyAssistantUpdate(state.streaming, update) };
  }
  if (event.type === "message_end") {
    const message = event.message as AgentMessage | undefined;
    if (!message) return state;
    return {
      ...state,
      messages: [...state.messages, message],
      streaming: message.role === "assistant" ? undefined : state.streaming,
    };
  }
  if (event.type === "queue_update") {
    return { ...state, steering: stringArray(event.steering), followUp: stringArray(event.followUp) };
  }
  if (event.type === "tool_execution_start") {
    const id = String(event.toolCallId ?? "unknown");
    return { ...state, tools: { ...state.tools, [id]: { id, name: String(event.toolName ?? "tool"), args: event.args, status: "running" } } };
  }
  if (event.type === "tool_execution_update") {
    const id = String(event.toolCallId ?? "unknown");
    const previous = state.tools[id] ?? { id, name: String(event.toolName ?? "tool"), args: event.args, status: "running" as const };
    return { ...state, tools: { ...state.tools, [id]: { ...previous, result: event.partialResult } } };
  }
  if (event.type === "tool_execution_end") {
    const id = String(event.toolCallId ?? "unknown");
    const previous = state.tools[id] ?? { id, name: String(event.toolName ?? "tool"), args: undefined, status: "running" as const };
    return { ...state, tools: { ...state.tools, [id]: { ...previous, result: event.result, status: event.isError ? "error" : "success" } } };
  }
  return state;
}

function applyAssistantUpdate(current: AgentMessage | undefined, update: Record<string, unknown>): AgentMessage {
  if (update.type === "done" && update.message && typeof update.message === "object") return update.message as AgentMessage;
  if (update.type === "error" && update.error && typeof update.error === "object") return update.error as AgentMessage;
  const message: AgentMessage = current ? structuredClone(current) : { role: "assistant", content: [] };
  const blocks = Array.isArray(message.content) ? [...message.content] : [];
  const index = typeof update.contentIndex === "number" ? update.contentIndex : -1;
  if (index < 0) return message;
  while (blocks.length <= index) blocks.push({ type: "text", text: "" });
  if (update.type === "text_start") blocks[index] = { type: "text", text: "" };
  if (update.type === "text_delta") {
    const block = blocks[index] as { type?: string; text?: string };
    blocks[index] = { type: "text", text: `${block.type === "text" ? block.text ?? "" : ""}${String(update.delta ?? "")}` };
  }
  if (update.type === "text_end") blocks[index] = { type: "text", text: String(update.content ?? "") };
  if (update.type === "thinking_start") blocks[index] = { type: "thinking", thinking: "" };
  if (update.type === "thinking_delta") {
    const block = blocks[index] as { type?: string; thinking?: string };
    blocks[index] = { type: "thinking", thinking: `${block.type === "thinking" ? block.thinking ?? "" : ""}${String(update.delta ?? "")}` };
  }
  if (update.type === "thinking_end") blocks[index] = { type: "thinking", thinking: String(update.content ?? "") };
  if (update.type === "toolcall_end" && update.toolCall && typeof update.toolCall === "object") blocks[index] = update.toolCall as Record<string, unknown>;
  message.content = blocks;
  return message;
}

function stringArray(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}
