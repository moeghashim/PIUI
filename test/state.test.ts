import { describe, expect, it } from "vitest";
import { emptyConversation, reducePiEvent } from "../src/state";

describe("PI event projection", () => {
  it("assembles streaming blocks and replaces them with the authoritative message", () => {
    let state = reducePiEvent(emptyConversation, { type: "message_start", message: { role: "assistant", content: [] } });
    state = reducePiEvent(state, { type: "message_update", assistantMessageEvent: { type: "text_start", contentIndex: 0 } });
    state = reducePiEvent(state, { type: "message_update", assistantMessageEvent: { type: "text_delta", contentIndex: 0, delta: "hello" } });
    expect(state.streaming?.content).toEqual([{ type: "text", text: "hello" }]);
    state = reducePiEvent(state, { type: "message_end", message: { role: "assistant", content: [{ type: "text", text: "hello!" }] } });
    expect(state.streaming).toBeUndefined();
    expect(state.messages[0]?.content).toEqual([{ type: "text", text: "hello!" }]);
  });

  it("tracks tool lifecycle and queues", () => {
    let state = reducePiEvent(emptyConversation, { type: "tool_execution_start", toolCallId: "1", toolName: "bash", args: { command: "pwd" } });
    state = reducePiEvent(state, { type: "tool_execution_end", toolCallId: "1", toolName: "bash", result: "ok", isError: false });
    state = reducePiEvent(state, { type: "queue_update", steering: ["now"], followUp: ["later"] });
    expect(state.tools["1"]).toMatchObject({ status: "success", result: "ok" });
    expect(state.steering).toEqual(["now"]);
    expect(state.followUp).toEqual(["later"]);
  });
});
