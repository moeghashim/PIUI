import { useCallback, useEffect, useRef, useState } from "react";
import { emptyConversation, reducePiEvent, type ConversationState } from "./state";
import type { ExtensionItem, ExtensionUiRequest, ModelInfo, RpcState, SessionItem, SlashCommand } from "./types";

interface Catalog {
  cwd: string;
  sessions: SessionItem[];
  extensions: ExtensionItem[];
}

interface Toast { id: number; message: string; type: string }

export function usePiui() {
  const socketRef = useRef<WebSocket | undefined>(undefined);
  const [connected, setConnected] = useState(false);
  const [runtime, setRuntime] = useState<Record<string, unknown>>({ status: "stopped" });
  const [catalog, setCatalog] = useState<Catalog>({ cwd: "", sessions: [], extensions: [] });
  const [conversation, setConversation] = useState<ConversationState>(emptyConversation);
  const [rpcState, setRpcState] = useState<RpcState>();
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [thinkingLevels, setThinkingLevels] = useState<string[]>([]);
  const [commands, setCommands] = useState<SlashCommand[]>([]);
  const [stats, setStats] = useState<Record<string, unknown>>({});
  const [dialog, setDialog] = useState<ExtensionUiRequest>();
  const [statuses, setStatuses] = useState<Record<string, string>>({});
  const [widgets, setWidgets] = useState<Record<string, string[]>>({});
  const [editorInjection, setEditorInjection] = useState<string>();
  const [toasts, setToasts] = useState<Toast[]>([]);
  const toastCounter = useRef(0);

  const addToast = useCallback((message: string, type = "info") => {
    const id = ++toastCounter.current;
    setToasts((items) => [...items, { id, message, type }]);
    window.setTimeout(() => setToasts((items) => items.filter((item) => item.id !== id)), 4500);
  }, []);

  useEffect(() => {
    let disposed = false;
    const connect = () => {
      if (disposed) return;
      const protocol = location.protocol === "https:" ? "wss:" : "ws:";
      const socket = new WebSocket(`${protocol}//${location.host}/api/ws`);
      socketRef.current = socket;
      socket.onopen = () => setConnected(true);
      socket.onclose = () => {
        setConnected(false);
        if (!disposed) window.setTimeout(connect, 900);
      };
      socket.onmessage = (message) => {
        const envelope = JSON.parse(message.data as string) as { kind: string; payload: unknown };
        if (envelope.kind === "catalog") setCatalog(envelope.payload as Catalog);
        if (envelope.kind === "runtime") {
          const next = envelope.payload as Record<string, unknown>;
          setRuntime(next);
          if (next.status === "diagnostic" && typeof next.text === "string") addToast(next.text.trim(), "warning");
        }
        if (envelope.kind === "server_error") addToast(String(envelope.payload), "error");
        if (envelope.kind === "pi") handlePi(envelope.payload);
      };
    };
    connect();
    return () => { disposed = true; socketRef.current?.close(); };
  }, [addToast]);

  const handlePi = (payload: unknown) => {
    setConversation((state) => reducePiEvent(state, payload));
    if (!payload || typeof payload !== "object") return;
    const event = payload as Record<string, unknown>;
    if (event.type === "response") {
      if (event.success === false) addToast(String(event.error ?? "PI command failed"), "error");
      const data = event.data as Record<string, unknown> | undefined;
      if (event.command === "get_state" && data) setRpcState(data as unknown as RpcState);
      if (event.command === "get_available_models") setModels((data?.models as ModelInfo[]) ?? []);
      if (event.command === "get_available_thinking_levels") setThinkingLevels((data?.levels as string[]) ?? []);
      if (event.command === "get_commands") setCommands((data?.commands as SlashCommand[]) ?? []);
      if (event.command === "get_session_stats" && data) setStats(data);
      if (["set_model", "set_thinking_level", "set_session_name", "new_session", "clone", "fork"].includes(String(event.command)) && event.success === true) command({ type: "get_state" });
      return;
    }
    if (event.type === "thinking_level_changed") setRpcState((state) => state ? { ...state, thinkingLevel: String(event.level) } : state);
    if (event.type === "session_info_changed") setRpcState((state) => state ? { ...state, sessionName: typeof event.name === "string" ? event.name : undefined } : state);
    if (event.type === "extension_error") addToast(`Extension error: ${String(event.error ?? event.extensionPath ?? "unknown")}`, "error");
    if (event.type === "extension_ui_request") handleExtensionUi(event as unknown as ExtensionUiRequest);
  };

  const handleExtensionUi = (request: ExtensionUiRequest) => {
    if (["select", "confirm", "input", "editor"].includes(request.method)) setDialog(request);
    if (request.method === "notify") addToast(request.message ?? "Extension notification", request.notifyType ?? "info");
    if (request.method === "setStatus" && request.statusKey) setStatuses((items) => updateKey(items, request.statusKey!, request.statusText));
    if (request.method === "setWidget" && request.widgetKey) setWidgets((items) => updateKey(items, request.widgetKey!, request.widgetLines));
    if (request.method === "setTitle" && request.title) document.title = `${request.title} — PIUI`;
    if (request.method === "set_editor_text") setEditorInjection(request.text ?? "");
  };

  const send = useCallback((message: unknown) => {
    if (socketRef.current?.readyState !== WebSocket.OPEN) throw new Error("PIUI server is disconnected");
    socketRef.current.send(JSON.stringify(message));
  }, []);
  const command = useCallback((value: Record<string, unknown>) => send({ kind: "command", command: value }), [send]);
  const start = useCallback((cwd: string, trust: boolean, sessionPath?: string) => {
    setConversation(emptyConversation);
    setRpcState(undefined);
    send({ kind: "start", cwd, trust, ...(sessionPath ? { sessionPath } : {}) });
  }, [send]);
  const respondToDialog = useCallback((response: Record<string, unknown>) => {
    if (!dialog) return;
    send({ kind: "extension_response", response: { type: "extension_ui_response", id: dialog.id, ...response } });
    setDialog(undefined);
  }, [dialog, send]);

  return {
    connected, runtime, catalog, conversation, rpcState, models, thinkingLevels, commands, stats,
    dialog, statuses, widgets, editorInjection, setEditorInjection, toasts, addToast,
    command, start, respondToDialog,
    refreshCatalog: (cwd?: string) => send({ kind: "refresh_catalog", ...(cwd ? { cwd } : {}) }),
    stop: () => send({ kind: "stop_runtime" }),
  };
}

function updateKey<T>(record: Record<string, T>, key: string, value: T | undefined) {
  const next = { ...record };
  if (value === undefined || value === "") delete next[key];
  else next[key] = value;
  return next;
}
