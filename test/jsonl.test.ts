import { describe, expect, it } from "vitest";
import { JsonlDecoder, serializeJsonl } from "../server/jsonl.js";
import { selectedPath } from "../server/folder-picker.js";

describe("JsonlDecoder", () => {
  it("handles split records, CRLF, multiple records, and Unicode separators", () => {
    const decoder = new JsonlDecoder();
    expect(decoder.push('{"value":"a')).toEqual([]);
    expect(decoder.push('\u2028b"}\r\n{"value":2}\n')).toEqual([{ value: "a\u2028b" }, { value: 2 }]);
  });

  it("serializes exactly one LF-delimited record", () => {
    expect(serializeJsonl({ type: "get_state" })).toBe('{"type":"get_state"}\n');
  });

  it("rejects oversized unterminated records", () => {
    const decoder = new JsonlDecoder(8);
    expect(() => decoder.push("123456789")).toThrow("larger than 8 bytes");
  });

  it("normalizes native folder picker output and preserves cancellation", () => {
    expect(selectedPath("/Users/moe/PIUI/\n")).toBe("/Users/moe/PIUI/");
    expect(selectedPath("  \n")).toBeNull();
  });
});
