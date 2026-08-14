import { useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  Activity, AlertTriangle, Bot, Box, Brain, Check, ChevronDown, ChevronRight, CircleStop, Command, Copy, FileCode2,
  Folder, GitFork, LoaderCircle, MessageSquarePlus, Package, PanelLeftClose, PanelRightOpen, Paperclip, Play, Plus, RefreshCw,
  Search, Send, Settings2, ShieldCheck, Sparkles, SquareTerminal, Wrench, X,
} from "lucide-react";
import type { AgentMessage, ExtensionItem, ExtensionUiRequest, RpcState, SessionItem, SlashCommand, ToolExecution } from "./types";
import { ModalSurface } from "./surfaces";

export function Sidebar({ sessions, currentFile, openSession, newSession, collapsed, setCollapsed }: {
  sessions: SessionItem[]; currentFile: string | undefined; openSession: (session: SessionItem) => void; newSession: () => void; collapsed: boolean; setCollapsed: (value: boolean) => void;
}) {
  const [search, setSearch] = useState("");
  const filtered = sessions.filter((session) => `${session.name ?? ""} ${session.firstMessage} ${session.cwd}`.toLowerCase().includes(search.toLowerCase())).slice(0, 80);
  const workspaces = useMemo(() => {
    const groups = new Map<string, SessionItem[]>();
    for (const session of filtered) groups.set(session.cwd, [...(groups.get(session.cwd) ?? []), session]);
    return [...groups.entries()];
  }, [filtered]);
  if (collapsed) return <button className="sidebar-rail" onClick={() => setCollapsed(false)} aria-label="Open sidebar"><PanelLeftClose /></button>;
  return <aside className="sidebar" data-testid="sidebar">
    <div className="brand"><div className="pi-mark">π</div><div><strong>PIUI</strong><span>agent harness</span></div><button className="icon-button" onClick={() => setCollapsed(true)} aria-label="Collapse sidebar"><PanelLeftClose /></button></div>
    <button className="new-session" onClick={newSession}><MessageSquarePlus size={17} /> New session</button>
    <label className="search"><Search size={15}/><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search sessions" aria-label="Search sessions"/></label>
    <div className="session-list">
      <div className="section-label">WORKSPACES</div>
      {workspaces.map(([cwd, items]) => <section className="workspace-group" key={cwd}><div className="workspace-heading"><Folder/><strong>{shortPath(cwd)}</strong><span>{items.length}</span></div>{items.map((session) => <button key={session.path} className={`session-row ${currentFile === session.path ? "active" : ""}`} onClick={() => openSession(session)}>
        <span className="session-icon"><Bot size={16}/></span><span className="session-copy"><strong>{session.name || session.firstMessage || "Untitled session"}</strong><small>{relativeTime(session.modified)} · {session.messageCount} messages</small></span>
      </button>)}</section>)}
      {!filtered.length && <div className="empty-list">No matching sessions</div>}
    </div>
  </aside>;
}

export function Topbar({ state, runtime, ready, thinkingLevels, onShowModels, onThinking, onRename, onClone, onShowExtensions, onShowSettings, onShowDetails }: {
  state: RpcState | undefined; runtime: Record<string, unknown>; ready: boolean; thinkingLevels: string[]; onShowModels: () => void; onThinking: (level: string) => void; onRename: () => void; onClone: () => void; onShowExtensions: () => void; onShowSettings: () => void; onShowDetails: () => void;
}) {
  return <header className="topbar">
    <div className="session-title"><span className={`health ${ready ? "ok" : runtime.status === "starting" || runtime.status === "running" ? "starting" : ""}`}/><div><strong>{state?.sessionName || "PI session"}</strong><small>{ready ? String(runtime.cwd ?? "") : runtime.status === "stopped" ? "Runtime stopped" : "Starting PI…"}</small></div></div>
    <div className="topbar-actions">
      <button className="model-trigger" onClick={onShowModels} disabled={!ready} aria-label={`Choose model${state?.model ? `, current ${state.model.name ?? state.model.id}` : ""}`}><Sparkles/><span><strong>{state?.model?.name ?? state?.model?.id ?? "Loading models…"}</strong><small>{state?.model?.provider ?? "PI runtime"}</small></span><ChevronDown/></button>
      <label className="select-control compact"><Brain size={15}/><select disabled={!ready} value={state?.thinkingLevel ?? "off"} onChange={(event) => onThinking(event.target.value)} aria-label="Thinking level">{thinkingLevels.map((level) => <option key={level}>{level}</option>)}</select></label>
      <button className="icon-button" disabled={!ready} onClick={onClone} title="Clone session" aria-label="Clone session"><GitFork/></button>
      <button className="icon-button" disabled={!ready} onClick={onRename} title="Rename session" aria-label="Rename session"><FileCode2/></button>
      <button className="icon-button" onClick={onShowDetails} title="Session details" aria-label="Session details"><PanelRightOpen/></button>
      <button className="icon-button" onClick={onShowExtensions} title="Extensions" aria-label="Extensions"><Package/></button>
      <button className="icon-button" onClick={onShowSettings} title="Settings" aria-label="Settings"><Settings2/></button>
    </div>
  </header>;
}

export function ViewTabs({ entryCount, onShowTrajectory }: { entryCount: number; onShowTrajectory: () => void }) {
  return <nav className="view-tabs" aria-label="Session views">
    <button className="active" aria-current="page"><MessageSquarePlus/>Chat</button>
    <button onClick={onShowTrajectory}><Activity/>Trajectory<span>{entryCount}</span></button>
  </nav>;
}

export function ContextRail({ state, runtime, ready, stats, extensionCount, commandCount, onOpenDetails, onOpenExtensions }: {
  state: RpcState | undefined;
  runtime: Record<string, unknown>;
  ready: boolean;
  stats: Record<string, unknown>;
  extensionCount: number;
  commandCount: number;
  onOpenDetails: () => void;
  onOpenExtensions: () => void;
}) {
  const tokens = stats.tokens as Record<string, number> | undefined;
  const runtimeLabel = ready ? "Runtime active" : runtime.status === "stopped" ? "Runtime stopped" : "Runtime starting";
  return <aside className="context-rail" aria-label="Session context">
    <div className="context-rail-card">
      <header><div><span>Environment</span><strong>{state?.sessionName || "PI session"}</strong></div><button className="icon-button" onClick={onOpenDetails} aria-label="Open session details"><Activity/></button></header>
      <section>
        <h3>Session</h3>
        <button className="context-row" onClick={onOpenDetails}><Activity/><span><strong>{runtimeLabel}</strong><small>{String(runtime.cwd ?? "Local workspace")}</small></span><ChevronRight/></button>
        <button className="context-row" onClick={onOpenDetails}><Sparkles/><span><strong>{state?.model?.name ?? state?.model?.id ?? "Loading model"}</strong><small>{state?.thinkingLevel ?? "thinking"} · {formatStat(Number(tokens?.total ?? 0))} tokens</small></span><ChevronRight/></button>
      </section>
      <section>
        <h3>Capabilities</h3>
        <button className="context-row" onClick={onOpenExtensions}><Package/><span><strong>{extensionCount} extensions</strong><small>{commandCount} commands available</small></span><ChevronRight/></button>
        <button className="context-row" onClick={onOpenDetails}><ShieldCheck/><span><strong>{runtime.trust ? "Project trusted" : "User extensions only"}</strong><small>{runtime.trust ? "Workspace resources enabled" : "Project resources disabled"}</small></span><ChevronRight/></button>
      </section>
      <footer><span className={`health ${ready ? "ok" : runtime.status === "stopped" ? "" : "starting"}`}/><span>{ready ? "Connected to local PI" : runtime.status === "stopped" ? "PI runtime stopped" : "Connecting to PI"}</span></footer>
    </div>
  </aside>;
}

export function Conversation({ messages, streaming, tools, ready, emptyAction }: { messages: AgentMessage[]; streaming: AgentMessage | undefined; tools: Record<string, ToolExecution>; ready: boolean; emptyAction: () => void }) {
  const bottom = useRef<HTMLDivElement>(null);
  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streaming]);
  if (!messages.length && !streaming) return <main className="conversation empty-conversation" data-testid="conversation"><div className="empty-orbit"><div className="pi-hero">π</div></div><h1>{ready ? "What should PI build?" : "Starting PI…"}</h1><p>{ready ? "Describe a task below. PI can use native tools, sessions, skills, and extensions in this workspace." : "Loading your models, commands, session history, and extensions."}</p>{!ready && <button className="secondary" onClick={emptyAction}><Folder size={16}/> Choose another workspace</button>}</main>;
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

export function Composer({ running, settled, commands, statuses, widgets, stats, injection, clearInjection, onSubmit, onAbort, queueMode: controlledQueueMode, onQueueMode }: {
  running: boolean; settled: boolean; commands: SlashCommand[]; statuses: Record<string,string>; widgets: Record<string,string[]>; stats: Record<string,unknown>; injection: string | undefined; clearInjection: () => void; onSubmit: (text: string, behavior?: "steer"|"followUp", images?: Array<{type:"image";data:string;mimeType:string}>) => void; onAbort: () => void; queueMode?: "steer"|"followUp"; onQueueMode?: (mode:"steer"|"followUp") => void;
}) {
  const [text, setText] = useState("");
  const [internalQueueMode, setInternalQueueMode] = useState<"steer"|"followUp">("steer");
  const [showCommands, setShowCommands] = useState(false);
  const [attachments, setAttachments] = useState<Array<{name:string;type:"image";data:string;mimeType:string;preview:string}>>([]);
  const fileInput = useRef<HTMLInputElement>(null);
  const queueMode = controlledQueueMode ?? internalQueueMode;
  const setQueueMode = (mode:"steer"|"followUp") => { setInternalQueueMode(mode); onQueueMode?.(mode); };
  useEffect(() => { if (injection !== undefined) { setText(injection); clearInjection(); } }, [injection, clearInjection]);
  const suggestions = useMemo(() => (text.startsWith("/") || showCommands) ? commands.filter((command) => !text.startsWith("/") || command.name.toLowerCase().includes(text.slice(1).split(/\s/)[0]?.toLowerCase() ?? "")).slice(0,12) : [], [text, commands, showCommands]);
  const submit = (event?: FormEvent) => { event?.preventDefault(); const value = text.trim(); if ((!value && attachments.length === 0) || !running) return; onSubmit(value || "Describe these images.", settled ? undefined : queueMode, attachments.map(({type,data,mimeType})=>({type,data,mimeType}))); attachments.forEach((item)=>URL.revokeObjectURL(item.preview)); setText(""); setAttachments([]); setShowCommands(false); };
  const attach = async (event: ChangeEvent<HTMLInputElement>) => { const files = [...(event.target.files ?? [])].filter((file)=>file.type.startsWith("image/")); const items = await Promise.all(files.map(async (file) => ({name:file.name,type:"image" as const,mimeType:file.type,data:await fileBase64(file),preview:URL.createObjectURL(file)}))); setAttachments((current)=>{const combined=[...current,...items];combined.slice(6).forEach((item)=>URL.revokeObjectURL(item.preview));return combined.slice(0,6);}); event.target.value=""; };
  return <div className="composer-wrap">
    {Object.entries(widgets).map(([key, lines]) => <div className="extension-widget" key={key}><Package size={14}/><div>{lines.map((line,index) => <span key={index}>{line}</span>)}</div></div>)}
    {suggestions.length > 0 && <div className="command-menu" role="listbox" aria-label="Commands">{suggestions.map((command) => <button role="option" key={`${command.source}-${command.name}`} onClick={() => {setText(`/${command.name} `);setShowCommands(false);}}><span className={`command-source ${command.source}`}>/{command.name}</span><small>{command.description}</small><em>{command.source}</em></button>)}</div>}
    <form className="composer" onSubmit={submit}>
      {attachments.length > 0 && <div className="attachment-strip">{attachments.map((item,index)=><div key={`${item.name}-${index}`}><img src={item.preview} alt=""/><span>{item.name}</span><button type="button" onClick={()=>setAttachments((items)=>items.filter((candidate,itemIndex)=>{if(itemIndex===index)URL.revokeObjectURL(candidate.preview);return itemIndex!==index;}))} aria-label={`Remove ${item.name}`}><X/></button></div>)}</div>}
      <textarea value={text} onChange={(event) => setText(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); submit(); } }} placeholder={running ? (settled ? "Describe what you want PI to build" : "Steer PI while it works…") : "Starting PI and loading models…"} readOnly={!running} rows={1} aria-label="Message PI" aria-busy={!running}/>
      <div className="composer-footer"><div className="status-strip">{Object.entries(statuses).map(([key,value]) => <span key={key}><span className="status-dot"/>{value}</span>)}</div><div className="composer-actions">
        <input ref={fileInput} type="file" accept="image/*" multiple hidden onChange={(event)=>void attach(event)}/><button type="button" className="composer-tool" onClick={()=>fileInput.current?.click()} disabled={!running} aria-label="Attach images"><Paperclip/></button>
        <button type="button" className="composer-tool" onClick={()=>setShowCommands((value)=>!value)} disabled={!running || commands.length === 0} aria-label="Commands" aria-expanded={showCommands}><Command/></button>
        {!settled && <select value={queueMode} onChange={(event) => setQueueMode(event.target.value as "steer"|"followUp")} aria-label="Queue mode"><option value="steer">Steer now</option><option value="followUp">Follow up</option></select>}
        {!settled && <button type="button" className="stop" onClick={onAbort} title="Stop"><CircleStop/></button>}
        <button type="submit" className="send" disabled={(!text.trim() && attachments.length === 0) || !running} aria-label="Send message"><Send/></button>
      </div></div>
    </form><div className="session-strip"><span>{String(stats.totalMessages ?? 0)} messages</span><i/><span>{formatStat((stats.tokens as Record<string,number>|undefined)?.total ?? 0)} tokens</span><i/><span>${Number(stats.cost ?? 0).toFixed(4)}</span><i/><span>{commands.length} commands</span></div><div className="composer-hint">PI and extensions run with your user permissions. Review tool activity before approving sensitive work.</div>
  </div>;
}

export function StartDialog({ initialCwd, session, close, start }: { initialCwd: string; session: SessionItem | undefined; close: () => void; start: (cwd: string, trusted: boolean) => void }) {
  const [cwd, setCwd] = useState(session?.cwd ?? initialCwd);
  const valid = Boolean(cwd.trim());
  return <ModalSurface className="small-dialog start-modal" labelledBy="start-title" close={close}><button className="modal-close" onClick={close} aria-label="Close workspace dialog"><X/></button><div className="modal-icon"><ShieldCheck/></div><h2 id="start-title">{session ? "Resume this session?" : "Open a PI workspace"}</h2><p>PI can read, edit, and run commands in this workspace. Project extensions are code and receive the same permissions.</p><label>Workspace directory<input value={cwd} readOnly={Boolean(session)} onChange={(event) => setCwd(event.target.value)} autoFocus={!session}/></label>{session && <small className="field-note">Saved sessions always resume in their original workspace.</small>}<div className="trust-actions"><button className="secondary" disabled={!valid} onClick={() => start(cwd,false)}><ShieldCheck/> Start without project extensions</button><button className="primary" disabled={!valid} onClick={() => start(cwd,true)}><Play/> Trust & start</button></div><small>“Without project extensions” still loads your user-level PI extensions and tools.</small></ModalSurface>;
}

export function ExtensionDialog({ request, respond }: { request: ExtensionUiRequest; respond: (value: Record<string, unknown>) => void }) {
  const [value, setValue] = useState(request.prefill ?? "");
  return <ModalSurface className="small-dialog extension-dialog" labelledBy="extension-dialog-title" close={() => respond({cancelled:true})}><button className="modal-close" onClick={() => respond({cancelled:true})} aria-label="Cancel extension dialog"><X/></button><div className="eyebrow"><Package/> PI EXTENSION</div><h2 id="extension-dialog-title">{request.title ?? "Extension input"}</h2>{request.message && <p>{request.message}</p>}
    {request.method === "select" && <div className="option-list">{request.options?.map((option) => <button key={option} onClick={() => respond({value:option})}>{option}<ChevronRight/></button>)}</div>}
    {request.method === "confirm" && <div className="modal-actions"><button className="secondary" onClick={() => respond({confirmed:false})}>Cancel</button><button className="primary" onClick={() => respond({confirmed:true})}>Confirm</button></div>}
    {(request.method === "input" || request.method === "editor") && <form onSubmit={(event) => {event.preventDefault();respond({value});}}><textarea value={value} onChange={(event) => setValue(event.target.value)} placeholder={request.placeholder} rows={request.method === "editor" ? 10 : 2} autoFocus/><div className="modal-actions"><button type="button" className="secondary" onClick={() => respond({cancelled:true})}>Cancel</button><button className="primary">Submit</button></div></form>}
  </ModalSurface>;
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
function fileBase64(file: File) { return new Promise<string>((resolve,reject) => { const reader = new FileReader(); reader.onerror=()=>reject(reader.error); reader.onload=()=>resolve(String(reader.result).split(",",2)[1] ?? ""); reader.readAsDataURL(file); }); }
function formatStat(value: number) { return Intl.NumberFormat(undefined,{notation:"compact",maximumFractionDigits:1}).format(value); }
