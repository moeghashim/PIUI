import { describe, expect, it } from "vitest";
import { PiProcess } from "../server/pi-process.js";

describe("installed PI smoke", () => {
  it("starts, reports state and models, and can complete a no-tools prompt", async () => {
    const runtime = new PiProcess({
      cwd: process.cwd(),
      trust: false,
      extraArgs: ["--no-session", "--no-extensions", "--no-skills", "--no-prompt-templates", "--no-tools"],
    });
    const events: Array<Record<string, unknown>> = [];
    runtime.on("event", (event) => events.push(event as Record<string, unknown>));
    runtime.send({ type: "get_state", id: "real-state" });
    runtime.send({ type: "get_available_models", id: "real-models" });
    await waitFor(() => events.some((event) => event.id === "real-models"), 15_000);
    runtime.send({ type: "prompt", id: "real-prompt", message: "Reply with exactly PIUI_REAL_OK and nothing else." });
    await waitFor(() => events.some((event) => event.type === "agent_settled"), 90_000);
    const final = events.findLast((event) => event.type === "message_end" && (event.message as { role?: string } | undefined)?.role === "assistant");
    expect(JSON.stringify(final)).toContain("PIUI_REAL_OK");
    expect(events).toContainEqual(expect.objectContaining({ id: "real-state", success: true }));
    await runtime.stop();
  }, 100_000);
});

async function waitFor(condition: () => boolean, timeout: number) {
  const deadline = Date.now() + timeout;
  while (!condition()) {
    if (Date.now() > deadline) throw new Error("Timed out waiting for real PI event");
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
}
