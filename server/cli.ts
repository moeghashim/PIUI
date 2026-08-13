#!/usr/bin/env node
import { spawn } from "node:child_process";
import { createPiuiServer } from "./app.js";

function arg(name: string) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

if (process.argv.includes("--help") || process.argv.includes("-h")) {
  console.log(`PIUI - local web harness for PI\n\nUsage: piui [--port 31415] [--host 127.0.0.1] [--cwd /workspace] [--no-open]\n\nEnvironment:\n  PIUI_PI_CLI  Absolute path to PI's dist/cli.js\n  PIUI_ONLINE=1 Allow PI startup network operations\n`);
  process.exit(0);
}

const host = arg("--host") ?? "127.0.0.1";
const port = Number(arg("--port") ?? (process.argv.includes("--dev") ? 31415 : 31415));
if (process.argv.includes("--dev")) process.env.PIUI_DEV = "1";
const server = await createPiuiServer({ host, port, cwd: arg("--cwd") ?? process.cwd() });
const url = await server.listen();
console.log(`PIUI is ready at ${url}`);

if (!process.argv.includes("--no-open") && !process.argv.includes("--dev")) {
  const command = process.platform === "darwin" ? "open" : process.platform === "win32" ? "cmd" : "xdg-open";
  const args = process.platform === "win32" ? ["/c", "start", "", url] : [url];
  spawn(command, args, { detached: true, stdio: "ignore" }).unref();
}

const shutdown = async () => {
  await server.close();
  process.exit(0);
};
process.once("SIGINT", () => void shutdown());
process.once("SIGTERM", () => void shutdown());
