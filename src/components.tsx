import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  AlertTriangle, Bot, Box, Brain, Check, ChevronDown, ChevronRight, CircleStop, Copy, FileCode2,
  Folder, GitFork, LoaderCircle, MessageSquarePlus, Package, PanelLeftClose, Play, Plus, RefreshCw,
  Search, Send, Settings2, ShieldCheck, Sparkles, SquareTerminal, Wrench, X,
} from "lucide-react";
import type { AgentMessage, ExtensionItem, ExtensionUiRequest, ModelInfo, RpcState, SessionItem, SlashCommand, ToolExecution } from "./types";

export function Sidebar({ sessions, currentFile, openSession, newSession, collapsed, setCollapsed }: {
  sessions: SessionItem[]; currentFile: string | undefined; openSession: (session: SessionItem) => void; newSession: () => void; collapsed: boolean; setCollapsed: (value: boolean) => void;
}) {
  const [search, setSearch] = useState("");
  const filtered = sessions.filter((session) => `${session.name ?? ""} ${session.firstMessage} ${session.cwd}`.toLowerCase().includes(search.toLowerCase())).slice(0, 80);
  if (collapsed) return <button className="sidebar-rail" onClick={() => setCollapsed(false)} aria-label="Open sidebar"><PanelLeftClose /></button>;
  return <aside className="sidebar" data-testid="sidebar">
    <div className="brand"><div className="pi-mark">π</div><div><strong>PIUI</strong><span>agent harness</span></div><button className="icon-button" onClick={() => setCollapsed(true)} aria-label="Collapse sidebar"><PanelLeftClose /></button></div>
    <button className="new-session" onClick={newSession}><MessageSquarePlus size={17} /> New session</button>
    <label className="search"><Search size={15}/><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search sessions" aria-label="Search sessions"/></label>
    <div className="session-list">
      <div className="section-label">RECENT</div>
      {filtered.map((session) => <button key={session.path} className={`session-row ${currentFile === session.path ? "active" : ""}`} onClick={() => openSession(session)}>
        <span className="session-icon"><Bot size={16}/></span><span className="session-copy"><strong>{session.name || session.firstMessage || "Untitled session"}</strong><small>{shortPath(session.cwd)} · {relativeTime(session.modified)}</small></span>
      </button>)}
      {!filtered.length && <div className="empty-list">No matching sessions</div>}
    </div>
  </aside>;
}

export function Topbar({ state, runtime, models, thinkingLevels, onModel, onThinking, onRename, onClone, onShowExtensions }: {
  state: RpcState | undefined; runtime: Record<string, unknown>; models: ModelInfo[]; thinkingLevels: string[]; onModel: (provider: string, id: string) => void; onThinking: (level: string) => void; onRename: () => void; onClone: () => void; onShowExtensions: () => void;
}) {
  const currentModel = state?.model ? `${state.model.provider}/${state.model.id}` : "Choose model";
  return <header className="topbar">
    <div className="session-title"><span className={`health ${runtime.status === "running" ? "ok" : ""}`}/><div><strong>{state?.sessionName || "PI session"}</strong><small>{runtime.status === "running" ? String(runtime.cwd ?? "") : "Runtime stopped"}</small></div></div>
    <div className="topbar-actions">
      <label className="select-control"><Sparkles size={15}/><select value={currentModel} onChange={(event) => { const index = event.target.value.indexOf("/"); onModel(event.target.value.slice(0,index), event.target.value.slice(index+1)); }} aria-label="Model">
        {!state?.model && <option>Choose model</option>}{models.map((model) => <option key={`${model.provider}/${model.id}`} value={`${model.provider}/${model.id}`}>{model.name ?? model.id} · {model.provider}</option>)}
      </select></label>
      <label className="select-control compact"><Brain size={15}/><select value={state?.thinkingLevel ?? "off"} onChange={(event) => onThinking(event.target.value)} aria-label="Thinking level">{thinkingLevels.map((level) => <option key={level}>{level}</option>)}</select></label>
      <button className="icon-button" onClick={onClone} title="Clone session"><GitFork/></button>
      <button className="icon-button" onClick={onRename} title="Rename session"><FileCode2/></button>
      <button className="icon-button" onClick={onShowExtensions} title="Extensions"><Package/></button>
    </div>
  </header>;
}

export function Conversation({ messages, streaming, tools, emptyAction }: { messages: AgentMessage[]; streaming: AgentMessage | undefined; tools: Record<string, ToolExecution>; emptyAction: () => void }) {
  const bottom = useRef<HTMLDivElement>(null);
  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streaming]);
  if (!messages.length && !streaming) return <main className="conversation empty-conversation" data-testid="conversation"><div className="empty-orbit"><div className="pi-hero">π</div></div><h1>What should PI build?</h1><p>Run a coding agent in any local workspace, with native tools, sessions, and extensions.</p><button className="primary" onClick={emptyAction}><Play size={16}/> Start a session</button></main>;
  return <main className="conversation" data-testid="conversation"><div className="message-stack">
    {messages.map((message, index) => <MessageView key={`${message.timestamp ?? "m"}-${index}`} message={message} tools={tools}/>) }
    {streaming && <MessageView message={streaming} tools={tools} streaming/>}
    <div ref={bottom}/>
  </div></main>;
}

function MessageView({ message, tools, streaming = false }: { message: AgentMessage; tools: Record<string, ToolExecution>; streaming?: boolean }) {
  if (message.role === "toolResult") return <ToolResult message={message}/>;
  if (message.role === "bashExecution") return <div className="system-card"><SquareTerminal size={17}/><div><strong>{message.command}</strong><pre>{message.output}</pre></div></div>;
  if (message.role === "compactionSummary" || message.role === "branchSummary") return <div className="system-card"><Box size={17}/><div><strong>{message.role === "compactionSummary" ? "Context compacted" : "Branch summary"}</strong><p>{String(message.summary ?? "")}</p></div></div>;
  if (message.role === "custom") return <div className="system-card"><Package size={17}/><div><strong>{message.customType ?? "Extension message"}</strong><Content content={message.content} tools={tools}/></div></div>;
  const user = message.role === "user";
  return <article className={`message ${user ? "user" : "assistant"}`}>
    <div className="avatar">{user ? "M" : "π"}</div>
    <div className="message-body"><div className="message-meta"><strong>{user ? "You" : "PI"}</strong>{!user && message.model && <span>{message.model}</span>}{streaming && <span className="streaming"><LoaderCircle size={12}/> working</span>}</div>
      <Content content={message.content} tools={tools}/>
      {message.errorMessage && <div className="inline-error"><AlertTriangle size={15}/>{message.errorMessage}</div>}
      {!streaming && !user && <button className="copy-action" onClick={() => void navigator.clipboard.writeText(contentText(message.content))}><Copy size={13}/> Copy</button>}
    </div>
  </article>;
}

function Content({ content, tools }: { content: AgentMessage["content"]; tools: Record<string, ToolExecution> }) {
  if (typeof content === "string") return <Markdown text={content}/>;
  if (!Array.isArray(content)) return null;
  return <>{content.map((block, index) => {
    if (block.type === "text") return <Markdown key={index} text={String((block as { text?: string }).text ?? "")}/>;
    if (block.type === "thinking") return <Thinking key={index} text={String((block as { thinking?: string }).thinking ?? "")}/>;
    if (block.type === "image") return <img key={index} className="message-image" alt="Attached content" src={`data:${String((block as { mimeType?: string }).mimeType)};base64,${String((block as { data?: string }).data)}`}/>;
    if (block.type === "toolCall") { const tool = block as unknown as { id: string; name: string; arguments: unknown }; return <ToolCallView key={tool.id || index} name={tool.name} args={tool.arguments} execution={tools[tool.id]}/>; }
    return <details key={index} className="raw-block"><summary>Extension content</summary><pre>{pretty(block)}</pre></details>;
  })}</>;
}

function Markdown({ text }: { text: string }) { return <div className="markdown"><ReactMarkdown remarkPlugins={[remarkGfm]}>{text}</ReactMarkdown></div>; }
function Thinking({ text }: { text: string }) { const [open, setOpen] = useState(false); return <div className="thinking"><button onClick={() => setOpen(!open)}>{open ? <ChevronDown/> : <ChevronRight/>}<Brain/> Reasoning</button>{open && <Markdown text={text}/>}</div>; }
function ToolCallView({ name, args, execution }: { name: string; args: unknown; execution: ToolExecution | undefined }) { const [open, setOpen] = useState(false); return <div className={`tool-card ${execution?.status ?? "pending"}`}><button onClick={() => setOpen(!open)}><span className="tool-icon"><Wrench/></span><span><strong>{name}</strong><small>{toolSummary(name,args)}</small></span><span className="tool-status">{execution?.status === "running" ? <LoaderCircle className="spin"/> : execution?.status === "error" ? <X/> : <Check/>}</span><ChevronRight className={open ? "rotated" : ""}/></button>{open && <div className="tool-detail"><label>Input</label><pre>{pretty(args)}</pre>{execution?.result !== undefined && <><label>Result</label><pre>{pretty(execution.result)}</pre></>}</div>}</div>; }
function ToolResult({ message }: { message: AgentMessage }) { return <details className={`tool-result ${message.isError ? "error" : ""}`}><summary><Wrench/> {message.toolName ?? "Tool"} result <span>{message.isError ? "failed" : "completed"}</span></summary><pre>{contentText(message.content)}</pre></details>; }

export function Composer({ running, settled, commands, statuses, widgets, injection, clearInjection, onSubmit, onAbort }: {
  running: boolean; settled: boolean; commands: SlashCommand[]; statuses: Record<string,string>; widgets: Record<string,string[]>; injection: string | undefined; clearInjection: () => void; onSubmit: (text: string, behavior?: "steer"|"followUp") => void; onAbort: () => void;
}) {
  const [text, setText] = useState("");
  const [queueMode, setQueueMode] = useState<"steer"|"followUp">("steer");
  useEffect(() => { if (injection !== undefined) { setText(injection); clearInjection(); } }, [injection, clearInjection]);
  const suggestions = useMemo(() => text.startsWith("/") ? commands.filter((command) => command.name.toLowerCase().includes(text.slice(1).split(/\s/)[0]?.toLowerCase() ?? "")).slice(0,8) : [], [text, commands]);
  const submit = (event?: FormEvent) => { event?.preventDefault(); const value = text.trim(); if (!value || !running) return; onSubmit(value, settled ? undefined : queueMode); setText(""); };
  return <div className="composer-wrap">
    {Object.entries(widgets).map(([key, lines]) => <div className="extension-widget" key={key}><Package size={14}/><div>{lines.map((line,index) => <span key={index}>{line}</span>)}</div></div>)}
    {suggestions.length > 0 && <div className="command-menu">{suggestions.map((command) => <button key={`${command.source}-${command.name}`} onClick={() => setText(`/${command.name} `)}><span className={`command-source ${command.source}`}>/{command.name}</span><small>{command.description}</small><em>{command.source}</em></button>)}</div>}
    <form className="composer" onSubmit={submit}>
      <textarea value={text} onChange={(event) => setText(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); submit(); } }} placeholder={running ? (settled ? "Ask PI to build, inspect, or change something…" : "Steer PI while it works…") : "Start a session to send a message"} disabled={!running} rows={1} aria-label="Message PI"/>
      <div className="composer-footer"><div className="status-strip">{Object.entries(statuses).map(([key,value]) => <span key={key}><span className="status-dot"/>{value}</span>)}</div><div className="composer-actions">
        {!settled && <select value={queueMode} onChange={(event) => setQueueMode(event.target.value as "steer"|"followUp")} aria-label="Queue mode"><option value="steer">Steer now</option><option value="followUp">Follow up</option></select>}
        {!settled && <button type="button" className="stop" onClick={onAbort} title="Stop"><CircleStop/></button>}
        <button type="submit" className="send" disabled={!text.trim() || !running} aria-label="Send message"><Send/></button>
      </div></div>
    </form><div className="composer-hint">PI and extensions run with your user permissions. Review tool activity before approving sensitive work.</div>
  </div>;
}

export function StartDialog({ initialCwd, session, close, start }: { initialCwd: string; session: SessionItem | undefined; close: () => void; start: (cwd: string, trusted: boolean) => void }) {
  const [cwd, setCwd] = useState(session?.cwd ?? initialCwd);
  return <div className="modal-backdrop"><div className="modal start-modal" role="dialog" aria-modal="true" aria-labelledby="start-title"><button className="modal-close" onClick={close}><X/></button><div className="modal-icon"><ShieldCheck/></div><h2 id="start-title">{session ? "Resume this session?" : "Open a PI workspace"}</h2><p>PI can read, edit, and run commands in this workspace. Project extensions are code and receive the same permissions.</p><label>Workspace directory<input value={cwd} onChange={(event) => setCwd(event.target.value)} autoFocus/></label><div className="trust-actions"><button className="secondary" onClick={() => start(cwd,false)}><ShieldCheck/> Start without project extensions</button><button className="primary" onClick={() => start(cwd,true)}><Play/> Trust & start</button></div><small>“Without project extensions” still loads your user-level PI extensions and tools.</small></div></div>;
}

export function ExtensionDialog({ request, respond }: { request: ExtensionUiRequest; respond: (value: Record<string, unknown>) => void }) {
  const [value, setValue] = useState(request.prefill ?? "");
  return <div className="modal-backdrop"><div className="modal extension-dialog" role="dialog" aria-modal="true"><button className="modal-close" onClick={() => respond({cancelled:true})}><X/></button><div className="eyebrow"><Package/> PI EXTENSION</div><h2>{request.title ?? "Extension input"}</h2>{request.message && <p>{request.message}</p>}
    {request.method === "select" && <div className="option-list">{request.options?.map((option) => <button key={option} onClick={() => respond({value:option})}>{option}<ChevronRight/></button>)}</div>}
    {request.method === "confirm" && <div className="modal-actions"><button className="secondary" onClick={() => respond({confirmed:false})}>Cancel</button><button className="primary" onClick={() => respond({confirmed:true})}>Confirm</button></div>}
    {(request.method === "input" || request.method === "editor") && <form onSubmit={(event) => {event.preventDefault();respond({value});}}><textarea value={value} onChange={(event) => setValue(event.target.value)} placeholder={request.placeholder} rows={request.method === "editor" ? 10 : 2} autoFocus/><div className="modal-actions"><button type="button" className="secondary" onClick={() => respond({cancelled:true})}>Cancel</button><button className="primary">Submit</button></div></form>}
  </div></div>;
}

export function ExtensionsPanel({ extensions, commands, close, refresh }: { extensions: ExtensionItem[]; commands: SlashCommand[]; close: () => void; refresh: () => void }) {
  const [search, setSearch] = useState("");
  const filtered = extensions.filter((extension) => `${extension.name} ${extension.source}`.toLowerCase().includes(search.toLowerCase()));
  return <div className="panel-backdrop"><aside className="extensions-panel"><header><div><span className="eyebrow"><Package/> PI RUNTIME</span><h2>Extensions</h2><p>DeepSeek Harness plugins map to native PI extensions here.</p></div><button className="icon-button" onClick={close} aria-label="Close extensions"><X/></button></header><div className="compatibility-note"><AlertTriangle/><div><strong>Web compatibility</strong><span>Tools, events, commands, dialogs, status, and text widgets work. TUI-only custom components, headers, footers, themes, and terminal input are unavailable in RPC mode.</span></div></div><div className="panel-tools"><label className="search"><Search/><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Filter extensions"/></label><button className="icon-button" onClick={refresh} aria-label="Refresh extensions"><RefreshCw/></button></div><div className="extension-summary"><span><strong>{extensions.length}</strong> loaded sources</span><span><strong>{commands.filter((item)=>item.source==="extension").length}</strong> commands</span></div><div className="extension-list">{filtered.map((extension,index) => <div className="extension-row" key={`${extension.path}-${index}`}><span className="extension-logo"><Package/></span><div><strong>{extension.name}</strong><small>{extension.source}</small><span>{extension.scope} · {extension.resources.length ? `${extension.resources.length} extension resource${extension.resources.length === 1 ? "" : "s"}` : "package resources"}</span></div><em>active</em></div>)}</div></aside></div>;
}

export function Toasts({ items }: { items: Array<{id:number;message:string;type:string}> }) { return <div className="toasts" aria-live="polite">{items.map((item)=><div key={item.id} className={`toast ${item.type}`}>{item.type === "error" || item.type === "warning" ? <AlertTriangle/> : <Check/>}<span>{item.message}</span></div>)}</div>; }

function shortPath(path: string) { const parts = path.split("/").filter(Boolean); return parts.slice(-2).join("/") || "/"; }
function relativeTime(value: string) { const diff = Date.now() - new Date(value).getTime(); const minutes=Math.floor(diff/60000); if(minutes<1)return "now"; if(minutes<60)return `${minutes}m`; const hours=Math.floor(minutes/60); if(hours<24)return `${hours}h`; return `${Math.floor(hours/24)}d`; }
function contentText(content: AgentMessage["content"]): string { if(typeof content === "string")return content; if(!Array.isArray(content))return ""; return content.map((part)=>part.type === "text" ? String((part as {text?:string}).text??"") : part.type === "thinking" ? String((part as {thinking?:string}).thinking??"") : "").join("\n"); }
function pretty(value: unknown) { if(typeof value === "string")return value; try{return JSON.stringify(value,null,2);}catch{return String(value);} }
function toolSummary(name:string,args:unknown) { if(!args||typeof args!=="object")return ""; const record=args as Record<string,unknown>; return String(record.path??record.command??record.query??record.pattern??Object.keys(record).slice(0,2).join(", ")).slice(0,100); }
