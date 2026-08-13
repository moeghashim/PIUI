import { describe, expect, it } from "vitest";
import { createPiuiServer, sanitizeDiagnostic } from "../server/app.js";

describe("server security", () => {
  it("refuses non-loopback bind addresses", async () => {
    await expect(createPiuiServer({ host: "0.0.0.0" })).rejects.toThrow("only binds to loopback");
  });

  it("redacts common credential forms from PI diagnostics", () => {
    expect(sanitizeDiagnostic("OPENAI_API_KEY=sk-abcdefghijklmnop Bearer top-secret-token")).toBe(
      "OPENAI_API_KEY=[redacted] Bearer [redacted]",
    );
  });
});
