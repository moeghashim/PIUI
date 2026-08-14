import crypto from "node:crypto";
import http from "node:http";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import { WebSocketServer, WebSocket } from "ws";
import { listExtensions, listSessions, sessionWorkspace, validateSessionPath, validateWorkspace } from "./catalog.js";
import { PiProcess } from "./pi-process.js";
import { isBrowserMessage, type ServerEnvelope } from "./protocol.js";

export interface PiuiServerOptions {
  host?: string;
  port?: number;
  cwd?: string;
  webRoot?: string;
}

const HYDRATION_COMMANDS = [
  "get_state",
  "get_messages",
  "get_available_models",
  "get_available_thinking_levels",
  "get_commands",
  "get_session_stats",
  "get_entries",
] as const;

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
  let runtimeGeneration = 0;
  let automaticStart: Promise<void> | undefined;
  const runtimeSnapshot = new Map<string, unknown>();
  const extensionReplay = new Map<string, unknown>();

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

  const hydrateRuntime = () => {
    if (!runtime) return;
    for (const type of HYDRATION_COMMANDS) runtime.send({ type });
  };

  const startRuntime = async (cwd: string, trust: boolean, sessionPath?: string) => {
    await runtime?.stop();
    const generation = ++runtimeGeneration;
    runtimeInfo = { cwd, trust, ...(sessionPath ? { sessionPath } : {}) };
    runtimeSnapshot.clear();
    extensionReplay.clear();
    const nextRuntime = new PiProcess(runtimeInfo);
    runtime = nextRuntime;
    nextRuntime.on("event", (payload) => {
      if (payload && typeof payload === "object") {
        const event = payload as Record<string, unknown>;
        if (event.type === "response" && typeof event.command === "string" && HYDRATION_COMMANDS.includes(event.command as typeof HYDRATION_COMMANDS[number])) {
          runtimeSnapshot.set(event.command, payload);
        }
        if (event.type === "extension_ui_request" && typeof event.method === "string") {
          const key = extensionReplayKey(event);
          if (key) extensionReplay.set(key, payload);
        }
        if (event.type === "agent_settled") {
          for (const type of ["get_state", "get_messages", "get_session_stats", "get_entries"] as const) nextRuntime.send({ type });
          void catalog(cwd, trust).then((payload) => broadcast({ kind: "catalog", payload }));
        }
      }
      broadcast({ kind: "pi", payload });
    });
    nextRuntime.on("stderr", (text) => broadcast({ kind: "diagnostic", payload: sanitizeDiagnostic(text) }));
    nextRuntime.on("exit", (code, signal) => {
      if (generation !== runtimeGeneration) return;
      broadcast({ kind: "runtime", payload: { status: "stopped", code, signal, ...runtimeInfo } });
      runtime = undefined;
    });
    broadcast({ kind: "runtime", payload: { status: "running", pid: nextRuntime.pid, ...runtimeInfo } });
    hydrateRuntime();
    broadcast({ kind: "catalog", payload: await catalog(cwd, trust) });
  };

  const ensureRuntime = () => {
    if (runtime) return Promise.resolve();
    automaticStart ??= startRuntime(initialCwd, false).finally(() => { automaticStart = undefined; });
    return automaticStart;
  };

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
    if (runtime) {
      send(socket, { kind: "runtime", payload: { status: "running", pid: runtime.pid, ...runtimeInfo } });
      for (const payload of runtimeSnapshot.values()) send(socket, { kind: "pi", payload });
      for (const payload of extensionReplay.values()) send(socket, { kind: "pi", payload });
      if (runtimeSnapshot.size < HYDRATION_COMMANDS.length) hydrateRuntime();
    } else {
      send(socket, { kind: "runtime", payload: { status: "starting", cwd: initialCwd, trust: false } });
      void ensureRuntime().catch((error) => {
        send(socket, { kind: "server_error", payload: messageOf(error) });
        broadcast({ kind: "runtime", payload: { status: "stopped", cwd: initialCwd, trust: false } });
      });
    }
    socket.on("close", () => clients.delete(socket));
    socket.on("message", (data) => void (async () => {
      try {
        const message = JSON.parse(data.toString()) as unknown;
        if (!isBrowserMessage(message)) throw new Error("Invalid browser message");
        if (message.kind === "start") {
          await automaticStart;
          const cwd = await validateWorkspace(message.cwd);
          const sessionPath = message.sessionPath ? await validateSessionPath(message.sessionPath) : undefined;
          if (sessionPath) {
            const authoritativeCwd = await sessionWorkspace(sessionPath);
            if (authoritativeCwd !== cwd) throw new Error("Saved sessions must resume in their original workspace");
          }
          await startRuntime(cwd, message.trust, sessionPath);
        } else if (message.kind === "command") {
          if (!runtime) throw new Error("Start a PI session first");
          runtime.send(message.command);
        } else if (message.kind === "extension_response") {
          if (!runtime) throw new Error("PI is not running");
          runtime.respond(message.response);
        } else if (message.kind === "stop_runtime") {
          runtimeGeneration += 1;
          await runtime?.stop();
          runtime = undefined;
          broadcast({ kind: "runtime", payload: { status: "stopped", ...runtimeInfo } });
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

function extensionReplayKey(event: Record<string, unknown>): string | undefined {
  if (event.method === "setStatus" && typeof event.statusKey === "string") return `status:${event.statusKey}`;
  if (event.method === "setWidget" && typeof event.widgetKey === "string") return `widget:${event.widgetKey}`;
  if (event.method === "setTitle") return "title";
  if (event.method === "set_editor_text") return "editor";
  return undefined;
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
