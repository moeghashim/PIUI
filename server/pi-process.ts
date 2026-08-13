import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { existsSync, realpathSync } from "node:fs";
import { delimiter, dirname, join, resolve } from "node:path";
import { EventEmitter } from "node:events";
import { createRequire } from "node:module";
import { JsonlDecoder, serializeJsonl } from "./jsonl.js";
import type { JsonObject } from "./protocol.js";

export interface PiLaunchOptions {
  cwd: string;
  trust: boolean;
  sessionPath?: string;
  piCli?: string;
  nodePath?: string;
  extraArgs?: string[];
}

export interface PiRuntimeEvents {
  event: [payload: unknown];
  stderr: [text: string];
  exit: [code: number | null, signal: NodeJS.Signals | null];
}

export declare interface PiProcess {
  on<K extends keyof PiRuntimeEvents>(event: K, listener: (...args: PiRuntimeEvents[K]) => void): this;
  emit<K extends keyof PiRuntimeEvents>(event: K, ...args: PiRuntimeEvents[K]): boolean;
}

export class PiProcess extends EventEmitter {
  readonly #child: ChildProcessWithoutNullStreams;
  readonly #decoder = new JsonlDecoder();
  #closed = false;
  #nextId = 1;

  constructor(options: PiLaunchOptions) {
    super();
    const nodePath = options.nodePath ?? process.execPath;
    const piCli = options.piCli ?? resolvePiCli(nodePath);
    const args = [piCli, "--mode", "rpc", options.trust ? "--approve" : "--no-approve"];
    if (options.sessionPath) args.push("--session", options.sessionPath);
    if (options.extraArgs) args.push(...options.extraArgs);

    this.#child = spawn(nodePath, args, {
      cwd: options.cwd,
      env: { ...process.env, PI_OFFLINE: process.env.PIUI_ONLINE === "1" ? "0" : "1" },
      stdio: ["pipe", "pipe", "pipe"],
    });
    this.#child.stdout.on("data", (chunk: Buffer) => {
      try {
        for (const record of this.#decoder.push(chunk)) this.emit("event", record);
      } catch (error) {
        this.emit("stderr", `Invalid PI RPC output: ${error instanceof Error ? error.message : String(error)}`);
      }
    });
    this.#child.stderr.on("data", (chunk: Buffer) => this.emit("stderr", chunk.toString()));
    this.#child.on("error", (error) => this.emit("stderr", `Unable to launch PI: ${error.message}`));
    this.#child.on("exit", (code, signal) => {
      this.#closed = true;
      try {
        for (const record of this.#decoder.finish()) this.emit("event", record);
      } catch (error) {
        this.emit("stderr", `Invalid final PI RPC output: ${error instanceof Error ? error.message : String(error)}`);
      }
      this.emit("exit", code, signal);
    });
  }

  get pid(): number | undefined {
    return this.#child.pid;
  }

  send(command: JsonObject & { type: string }): string {
    if (this.#closed) throw new Error("PI runtime is not running");
    const id = typeof command.id === "string" ? command.id : `piui-${this.#nextId++}`;
    this.#child.stdin.write(serializeJsonl({ ...command, id }));
    return id;
  }

  respond(response: JsonObject & { type: "extension_ui_response"; id: string }): void {
    if (this.#closed) throw new Error("PI runtime is not running");
    this.#child.stdin.write(serializeJsonl(response));
  }

  async stop(): Promise<void> {
    if (this.#closed) return;
    await new Promise<void>((done) => {
      const timer = setTimeout(() => {
        this.#child.kill("SIGKILL");
        done();
      }, 3_000);
      timer.unref();
      this.#child.once("exit", () => {
        clearTimeout(timer);
        done();
      });
      this.#child.kill("SIGTERM");
    });
  }
}

export function resolvePiCli(nodePath = process.execPath): string {
  const explicit = process.env.PIUI_PI_CLI;
  if (explicit) {
    const resolved = resolve(explicit);
    if (!existsSync(resolved)) throw new Error(`PIUI_PI_CLI does not exist: ${resolved}`);
    return resolved;
  }

  let bundledCandidate: string | undefined;
  try {
    const require = createRequire(import.meta.url);
    bundledCandidate = join(dirname(require.resolve("@earendil-works/pi-coding-agent/package.json")), "dist", "cli.js");
  } catch {
    // PI may still be available as a user-installed executable.
  }
  const candidates = [
    ...(bundledCandidate ? [bundledCandidate] : []),
    join(dirname(nodePath), "pi"),
    join(dirname(nodePath), "..", "lib", "node_modules", "@earendil-works", "pi-coding-agent", "dist", "cli.js"),
    ...((process.env.PATH ?? "").split(delimiter).map((part) => join(part, "pi"))),
  ];
  for (const candidate of candidates) {
    if (!existsSync(candidate)) continue;
    const resolved = realpathSync(candidate);
    if (existsSync(resolved)) return resolved;
  }
  throw new Error("PI is not installed or could not be located. Set PIUI_PI_CLI to PI's dist/cli.js path.");
}
