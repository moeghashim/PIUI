import { describe, expect, it } from "vitest";
import { mkdtemp, mkdir, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createPiuiServer, sanitizeDiagnostic } from "../server/app.js";
import { sessionWorkspace, validateWorkspace } from "../server/catalog.js";

describe("server security", () => {
  it("refuses non-loopback bind addresses", async () => {
    await expect(createPiuiServer({ host: "0.0.0.0" })).rejects.toThrow("only binds to loopback");
  });

  it("redacts common credential forms from PI diagnostics", () => {
    expect(sanitizeDiagnostic("OPENAI_API_KEY=sk-abcdefghijklmnop Bearer top-secret-token")).toBe(
      "OPENAI_API_KEY=[redacted] Bearer [redacted]",
    );
  });

  it("rejects an empty workspace instead of silently using the server cwd", async () => {
    await expect(validateWorkspace("   ")).rejects.toThrow("Workspace directory is required");
  });

  it("uses the saved session header as the authoritative resume workspace", async () => {
    const root = await mkdtemp(join(tmpdir(), "piui-session-"));
    const agentDir = join(root, "agent");
    const sessionDir = join(agentDir, "sessions", "fixture");
    const workspace = join(root, "workspace");
    await mkdir(sessionDir, { recursive: true });
    await mkdir(workspace);
    const path = join(sessionDir, "session.jsonl");
    await writeFile(path, `${JSON.stringify({ type: "session", version: 3, id: "fixture", timestamp: new Date().toISOString(), cwd: workspace })}\n`);
    try {
      await expect(sessionWorkspace(path, agentDir)).resolves.toBe(await realpath(workspace));
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
