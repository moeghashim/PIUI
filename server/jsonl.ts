export class JsonlDecoder {
  readonly #maxRecordBytes: number;
  #buffer = "";

  constructor(maxRecordBytes = 8 * 1024 * 1024) {
    this.#maxRecordBytes = maxRecordBytes;
  }

  push(chunk: Buffer | string): unknown[] {
    this.#buffer += chunk.toString();
    if (Buffer.byteLength(this.#buffer) > this.#maxRecordBytes && !this.#buffer.includes("\n")) {
      this.#buffer = "";
      throw new Error(`PI emitted a JSONL record larger than ${this.#maxRecordBytes} bytes`);
    }

    const records: unknown[] = [];
    let newline = this.#buffer.indexOf("\n");
    while (newline !== -1) {
      let line = this.#buffer.slice(0, newline);
      this.#buffer = this.#buffer.slice(newline + 1);
      if (line.endsWith("\r")) line = line.slice(0, -1);
      if (line.trim()) records.push(JSON.parse(line));
      newline = this.#buffer.indexOf("\n");
    }
    return records;
  }

  finish(): unknown[] {
    if (!this.#buffer.trim()) return [];
    const line = this.#buffer.endsWith("\r") ? this.#buffer.slice(0, -1) : this.#buffer;
    this.#buffer = "";
    return [JSON.parse(line)];
  }
}

export function serializeJsonl(value: unknown): string {
  return `${JSON.stringify(value)}\n`;
}
