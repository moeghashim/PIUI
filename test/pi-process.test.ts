import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { PiProcess } from "../server/pi-process.js";

describe("PiProcess", () => {
  it("correlates commands and preserves extension UI round trips", async () => {
    const runtime = new PiProcess({ cwd: process.cwd(), trust: false, piCli: join(process.cwd(), "test/fixtures/fake-pi.mjs") });
    const events: Array<Record<string, unknown>> = [];
    runtime.on("event", (event) => events.push(event as Record<string, unknown>));
    runtime.send({ type: "get_state", id: "state" });
    runtime.send({ type: "prompt", id: "dialog-prompt", message: "/dialog" });
    await waitFor(() => events.some((event) => event.type === "extension_ui_request" && event.id === "dialog-1"));
    runtime.respond({ type: "extension_ui_response", id: "dialog-1", confirmed: true });
    await waitFor(() => events.some((event) => event.type === "agent_settled"));
    expect(events).toContainEqual(expect.objectContaining({ id: "state", command: "get_state", success: true }));
    expect(events).toContainEqual(expect.objectContaining({ type: "tool_execution_end", toolCallId: "tool-1" }));
    await runtime.stop();
  });
});

async function waitFor(condition: () => boolean) {
  const deadline = Date.now() + 5_000;
  while (!condition()) {
    if (Date.now() > deadline) throw new Error("Timed out waiting for fake PI event");
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}
