import crypto from "node:crypto";
import http from "node:http";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import { WebSocketServer, WebSocket } from "ws";
import { listExtensions, listSessions, validateSessionPath, validateWorkspace } from "./catalog.js";
import { PiProcess } from "./pi-process.js";
import { isBrowserMessage, type ServerEnvelope } from "./protocol.js";

export interface PiuiServerOptions {
  host?: string;
  port?: number;
  cwd?: string;
  webRoot?: string;
}

function parseCookies(value: string | undefined) {
  return Object.fromEntries((value ?? "").split(";").map((item) => item.trim().split("=").map(decodeURIComponent)).filter((parts) => parts.length === 2) as Array<[string, string]>);
}

export async function createPiuiServer(options: PiuiServerOptions = {}) {
  const host = options.host ?? "127.0.0.1";
  if (!["127.0.0.1", "localhost", "::1"].includes(host)) throw new Error("PIUI only binds to loopback addresses");
  const port = options.port ?? 31415;
  const initialCwd = await validateWorkspace(options.cwd ?? process.cwd());
  const webRoot = options.webRoot ?? join(dirname(fileURLToPath(import.meta.url)), "..", "web");
  const sessionToken = crypto.randomBytes(32).toString("base64url");
  const app = express();
  app.disable("x-powered-by");
  app.use((req, res, next) => {
    const hostname = req.hostname.replace(/^\[|\]$/g, "");
    if (!["127.0.0.1", "localhost", "::1"].includes(hostname)) return res.status(403).send("Loopback host required");
    res.setHeader("Content-Security-Policy", "default-src 'self'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; connect-src 'self' ws: wss:; font-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'");
    res.setHeader("Referrer-Policy", "no-referrer");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Frame-Options", "DENY");
    res.cookie("piui_session", sessionToken, { httpOnly: true, sameSite: "strict", secure: false, path: "/" });
    next();
  });
  app.get("/api/bootstrap", (_req, res) => res.json({ cwd: initialCwd, piuiVersion: "0.1.0" }));
  if (existsSync(webRoot)) app.use(express.static(webRoot, { index: false }));
  app.get("/{*splat}", (_req, res) => res.sendFile(join(webRoot, "index.html")));

  const server = http.createServer(app);
  const clients = new Set<WebSocket>();
  let runtime: PiProcess | undefined;
  let runtimeInfo: { cwd: string; trust: boolean; sessionPath?: string } | undefined;

  const send = (socket: WebSocket, message: ServerEnvelope) => {
    if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message));
  };
  const broadcast = (message: ServerEnvelope) => {
    for (const socket of clients) send(socket, message);
  };
  const catalog = async (cwd = runtimeInfo?.cwd ?? initialCwd, trusted = runtimeInfo?.trust ?? false) => ({
    cwd,
    sessions: await listSessions(),
    extensions: await listExtensions(cwd, trusted),
  });

  const wss = new WebSocketServer({ noServer: true, maxPayload: 8 * 1024 * 1024 });
  server.on("upgrade", (req, socket, head) => {
    const origin = req.headers.origin;
    const originHost = host === "::1" ? "[::1]" : host;
    const expectedOrigins = [`http://${originHost}:${port}`, `http://localhost:${port}`, ...(process.env.PIUI_DEV === "1" ? ["http://127.0.0.1:5173", "http://localhost:5173"] : [])];
    const authorized = parseCookies(req.headers.cookie).piui_session === sessionToken;
    if (req.url !== "/api/ws" || !authorized || !origin || !expectedOrigins.includes(origin)) {
      socket.write("HTTP/1.1 403 Forbidden\r\n\r\n");
      socket.destroy();
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => wss.emit("connection", ws, req));
  });

  wss.on("connection", (socket) => {
    clients.add(socket);
    void catalog().then((payload) => send(socket, { kind: "catalog", payload })).catch((error) => send(socket, { kind: "server_error", payload: messageOf(error) }));
    send(socket, { kind: "runtime", payload: runtime ? { status: "running", pid: runtime.pid, ...runtimeInfo } : { status: "stopped" } });
    socket.on("close", () => clients.delete(socket));
    socket.on("message", (data) => void (async () => {
      try {
        const message = JSON.parse(data.toString()) as unknown;
        if (!isBrowserMessage(message)) throw new Error("Invalid browser message");
        if (message.kind === "start") {
          const cwd = await validateWorkspace(message.cwd);
          const sessionPath = message.sessionPath ? await validateSessionPath(message.sessionPath) : undefined;
          await runtime?.stop();
          runtimeInfo = { cwd, trust: message.trust, ...(sessionPath ? { sessionPath } : {}) };
          runtime = new PiProcess(runtimeInfo);
          runtime.on("event", (payload) => broadcast({ kind: "pi", payload }));
          runtime.on("stderr", (text) => broadcast({ kind: "runtime", payload: { status: "diagnostic", text: sanitizeDiagnostic(text) } }));
          runtime.on("exit", (code, signal) => {
            broadcast({ kind: "runtime", payload: { status: "stopped", code, signal } });
            runtime = undefined;
          });
          broadcast({ kind: "runtime", payload: { status: "running", pid: runtime.pid, ...runtimeInfo } });
          for (const type of ["get_state", "get_messages", "get_available_models", "get_available_thinking_levels", "get_commands", "get_session_stats", "get_entries"]) runtime.send({ type });
          broadcast({ kind: "catalog", payload: await catalog(cwd, message.trust) });
        } else if (message.kind === "command") {
          if (!runtime) throw new Error("Start a PI session first");
          runtime.send(message.command);
        } else if (message.kind === "extension_response") {
          if (!runtime) throw new Error("PI is not running");
          runtime.respond(message.response);
        } else if (message.kind === "stop_runtime") {
          await runtime?.stop();
          runtime = undefined;
        } else {
          const cwd = message.cwd ? await validateWorkspace(message.cwd) : runtimeInfo?.cwd ?? initialCwd;
          broadcast({ kind: "catalog", payload: await catalog(cwd) });
        }
      } catch (error) {
        send(socket, { kind: "server_error", payload: messageOf(error) });
      }
    })());
  });

  return {
    host,
    port,
    initialCwd,
    async listen() {
      await new Promise<void>((resolve, reject) => {
        server.once("error", reject);
        server.listen(port, host, () => { server.off("error", reject); resolve(); });
      });
      return `http://${host === "::1" ? "[::1]" : host}:${port}`;
    },
    async close() {
      await runtime?.stop();
      for (const client of clients) client.close();
      await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    },
  };
}

function messageOf(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

export function sanitizeDiagnostic(text: string) {
  return text
    .slice(0, 8_000)
    .replace(/\bsk-[A-Za-z0-9_-]{12,}\b/g, "[redacted]")
    .replace(/\b(Bearer\s+)[^\s]+/gi, "$1[redacted]")
    .replace(/\b([A-Z0-9_]*(?:API_KEY|TOKEN|SECRET|PASSWORD))\s*[:=]\s*([^\s]+)/gi, "$1=[redacted]");
}
