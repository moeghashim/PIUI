import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  Activity, AlertTriangle, Archive, BarChart3, Brain, Check, ChevronRight, CircleDollarSign,
  Copy, Download, FileCode2, Folder, GitFork, Gauge, MessageSquare, Package, RefreshCw,
  Search, Settings2, ShieldAlert, Sparkles, TerminalSquare, Wrench, X,
} from "lucide-react";
import type { ExtensionItem, ModelInfo, RpcState, SlashCommand } from "./types";

export type ThemeChoice = "system" | "dark" | "light";
export type SettingsTab = "general" | "models" | "extensions" | "session";

export function ModalSurface({ children, className = "", labelledBy, close }: { children: ReactNode; className?: string; labelledBy: string; close: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    if (dialog && !dialog.open) dialog.showModal();
    return () => { if (dialog?.open) dialog.close(); };
  }, []);
  return <dialog ref={ref} className={`surface-dialog ${className}`} aria-labelledby={labelledBy} onCancel={(event) => { event.preventDefault(); close(); }}>
    {children}
  </dialog>;
}

export function ModelPicker({ models, current, onSelect, close }: { models: ModelInfo[]; current: ModelInfo | undefined; onSelect: (provider: string, id: string) => void; close: () => void }) {
  const [search, setSearch] = useState("");
  const filtered = useMemo(() => models.filter((model) => `${model.name ?? ""} ${model.id} ${model.provider}`.toLowerCase().includes(search.toLowerCase())), [models, search]);
  const groups = useMemo(() => {
    const result = new Map<string,ModelInfo[]>();
    for (const model of filtered) result.set(model.provider,[...(result.get(model.provider) ?? []),model]);
    return result;
  }, [filtered]);
  return <ModalSurface className="picker-dialog" labelledBy="model-picker-title" close={close}>
    <header className="dialog-header"><div><span className="eyebrow"><Sparkles/> PI MODELS</span><h2 id="model-picker-title">Choose a model</h2><p>Models available through your local PI configuration.</p></div><button className="icon-button" onClick={close} aria-label="Close model picker"><X/></button></header>
    <label className="search dialog-search"><Search/><input autoFocus value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search models or providers" aria-label="Search models"/></label>
    <div className="model-groups">{[...groups.entries()].map(([provider, items]) => <section key={provider}><div className="provider-heading"><strong>{provider}</strong><span>{items.length} models</span></div>{items.map((model) => {
      const selected = current?.provider === model.provider && current?.id === model.id;
      return <button className={`model-row ${selected ? "selected" : ""}`} key={`${model.provider}/${model.id}`} onClick={() => { onSelect(model.provider, model.id); close(); }} aria-pressed={selected}>
        <span className="model-icon"><Sparkles/></span><span><strong>{model.name ?? model.id}</strong><small>{model.id}</small></span><span className="model-meta">{model.reasoning && <em>reasoning</em>}{model.contextWindow && <small>{formatCompact(model.contextWindow)} ctx</small>}</span>{selected ? <Check/> : <ChevronRight/>}
      </button>;
    })}</section>)}</div>
  </ModalSurface>;
}

export function RenameDialog({ initial, save, close }: { initial: string; save: (name: string) => void; close: () => void }) {
  const [name, setName] = useState(initial);
  return <ModalSurface className="small-dialog" labelledBy="rename-title" close={close}>
    <button className="modal-close" onClick={close} aria-label="Close rename dialog"><X/></button>
    <h2 id="rename-title">Rename session</h2><p>Give this PI session a name that is easy to find later.</p>
    <form onSubmit={(event) => { event.preventDefault(); if (name.trim()) save(name.trim()); }}><label>Session name<input autoFocus value={name} onChange={(event) => setName(event.target.value)} /></label><div className="modal-actions"><button type="button" className="secondary" onClick={close}>Cancel</button><button className="primary" disabled={!name.trim()}>Save name</button></div></form>
  </ModalSurface>;
}

export function SessionDetails({ state, stats, entries, queue, runtime, commands, close }: {
  state: RpcState | undefined; stats: Record<string, unknown>; entries: Record<string, unknown>[]; queue: { steering: string[]; followUp: string[] }; runtime: Record<string, unknown>; commands: SlashCommand[]; close: () => void;
}) {
  const [search, setSearch] = useState("");
  const filteredEntries = entries.filter((entry) => JSON.stringify(entry).toLowerCase().includes(search.toLowerCase())).slice(-80).reverse();
  const tokens = stats.tokens as Record<string, number> | undefined;
  const context = stats.contextUsage as Record<string, number | null> | undefined;
  const contextPercent = Math.min(100,Math.max(0,Number(context?.percent ?? 0)));
  return <ModalSurface className="side-dialog" labelledBy="details-title" close={close}>
    <header className="dialog-header"><div><span className="eyebrow"><Activity/> LIVE SESSION</span><h2 id="details-title">Details</h2><p>Runtime, context, queues, and the PI session ledger.</p></div><button className="icon-button" onClick={close} aria-label="Close session details"><X/></button></header>
    <div className="metric-grid">
      <Metric icon={<MessageSquare/>} label="Messages" value={String(stats.totalMessages ?? state?.messageCount ?? 0)}/>
      <Metric icon={<Wrench/>} label="Tool calls" value={String(stats.toolCalls ?? 0)}/>
      <Metric icon={<Gauge/>} label="Tokens" value={formatCompact(tokens?.total ?? 0)}/>
      <Metric icon={<CircleDollarSign/>} label="Cost" value={`$${Number(stats.cost ?? 0).toFixed(4)}`}/>
    </div>
    {context && <section className="context-card"><div><strong>Context used</strong><span>{contextPercent.toFixed(1)}%</span></div><div className="context-track"><i style={{width:`${contextPercent}%`}}/></div><small>{formatCompact(Number(context.tokens ?? 0))} / {formatCompact(Number(context.contextWindow ?? 0))} tokens</small></section>}
    <section className="detail-section"><h3>Runtime</h3><dl className="detail-list"><div><dt>Workspace</dt><dd>{String(runtime.cwd ?? "—")}</dd></div><div><dt>Model</dt><dd>{state?.model ? `${state.model.provider}/${state.model.id}` : "—"}</dd></div><div><dt>Thinking</dt><dd>{state?.thinkingLevel ?? "—"}</dd></div><div><dt>Extensions</dt><dd>{runtime.trust ? "project trusted" : "user only"}</dd></div></dl></section>
    {(queue.steering.length > 0 || queue.followUp.length > 0) && <section className="detail-section"><h3>Queued messages</h3>{queue.steering.map((item,index) => <div className="queue-row" key={`s${index}`}><em>steer</em><span>{item}</span></div>)}{queue.followUp.map((item,index) => <div className="queue-row" key={`f${index}`}><em>follow up</em><span>{item}</span></div>)}</section>}
    <section className="detail-section ledger"><div className="section-heading"><h3>Session ledger</h3><span>{entries.length} entries</span></div><label className="search"><Search/><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search events" aria-label="Search session events"/></label><div className="ledger-list">{filteredEntries.map((entry,index) => <details key={`${String(entry.id ?? index)}`}><summary><span className={`ledger-dot ${String(entry.type)}`}/><strong>{String(entry.type ?? "event").replaceAll("_"," ")}</strong><small>{entry.timestamp ? new Date(String(entry.timestamp)).toLocaleTimeString() : ""}</small></summary><pre>{JSON.stringify(entry,null,2)}</pre></details>)}{filteredEntries.length === 0 && <p className="empty-list">No matching session events.</p>}</div></section>
    <section className="detail-section"><h3>Capabilities</h3><p className="muted-copy">{commands.length} commands from PI extensions, skills, and prompt templates.</p></section>
  </ModalSurface>;
}

function Metric({ icon, label, value }: { icon: ReactNode; label: string; value: string }) { return <div className="metric"><span>{icon}</span><div><small>{label}</small><strong>{value}</strong></div></div>; }

export function SettingsDialog({ initialTab, state, ready, runtime, models, thinkingLevels, extensions, commands, stats, theme, busyMode, close, showModelPicker, onTheme, onBusyMode, onThinking, onCommand, onRename, onClone }: {
  initialTab: SettingsTab; state: RpcState | undefined; ready: boolean; runtime: Record<string, unknown>; models: ModelInfo[]; thinkingLevels: string[]; extensions: ExtensionItem[]; commands: SlashCommand[]; stats: Record<string, unknown>; theme: ThemeChoice; busyMode: "steer"|"followUp"; close: () => void; showModelPicker: () => void; onTheme: (theme: ThemeChoice) => void; onBusyMode: (mode: "steer"|"followUp") => void; onThinking: (level: string) => void; onCommand: (command: Record<string,unknown>) => void; onRename: () => void; onClone: () => void;
}) {
  const [tab, setTab] = useState<SettingsTab>(initialTab);
  const [extensionSearch, setExtensionSearch] = useState("");
  const filteredExtensions = extensions.filter((item) => `${item.name} ${item.source} ${item.scope}`.toLowerCase().includes(extensionSearch.toLowerCase()));
  return <ModalSurface className="settings-dialog" labelledBy="settings-title" close={close}>
    <aside className="settings-nav"><h2 id="settings-title">Settings</h2>{(["general","models","extensions","session"] as const).map((item) => <button key={item} className={tab === item ? "active" : ""} onClick={() => setTab(item)}>{item === "general" ? <Settings2/> : item === "models" ? <Sparkles/> : item === "extensions" ? <Package/> : <BarChart3/>}{item.charAt(0).toUpperCase()+item.slice(1)}</button>)}</aside>
    <section className="settings-content"><button className="icon-button settings-close" onClick={close} aria-label="Close settings"><X/></button>
      {tab === "general" && <><h2>General</h2><p className="settings-lead">Defaults for the PIUI browser experience.</p>
        <SettingRow title="Workspace" description="The directory used by the active PI process."><span className="value-pill"><Folder/>{String(runtime.cwd ?? "Starting…")}</span></SettingRow>
        <SettingRow title="Project extensions" description="PI is not sandboxed; extensions run with your user permissions."><span className={`value-pill ${runtime.trust ? "warning" : ""}`}><ShieldAlert/>{runtime.trust ? "Trusted for this run" : "Not loaded"}</span></SettingRow>
        <SettingRow title="Appearance" description="Use a light, dark, or system interface."><div className="segmented">{(["light","dark","system"] as const).map((item) => <button key={item} aria-pressed={theme === item} onClick={() => onTheme(item)}>{item}</button>)}</div></SettingRow>
        <SettingRow title="Enter behavior while busy" description="Choose where Enter queues a message while PI is working."><div className="segmented"><button aria-pressed={busyMode === "steer"} onClick={() => onBusyMode("steer")}>Steer</button><button aria-pressed={busyMode === "followUp"} onClick={() => onBusyMode("followUp")}>Follow up</button></div></SettingRow>
        <div className="compatibility-note"><AlertTriangle/><div><strong>PI permissions</strong><span>Unlike DeepSeek Harness permission presets, PI has no built-in sandbox. PIUI shows the actual trust state rather than offering controls it cannot enforce.</span></div></div>
      </>}
      {tab === "models" && <><h2>Models</h2><p className="settings-lead">Available from your existing PI providers and authentication.</p><div className="current-model-card"><span className="model-icon"><Sparkles/></span><div><small>Current model</small><strong>{state?.model ? `${state.model.name ?? state.model.id}` : ready ? "No model selected" : "Starting PI…"}</strong><span>{state?.model ? `${state.model.provider}/${state.model.id}` : ""}</span></div><button className="secondary" disabled={!ready} onClick={showModelPicker}>Choose model</button></div><h3>Reasoning effort</h3><div className="effort-grid">{thinkingLevels.map((level) => <button key={level} disabled={!ready} aria-pressed={state?.thinkingLevel === level} onClick={() => onThinking(level)}><Brain/>{level}</button>)}</div><div className="inventory-summary"><span><strong>{models.length}</strong> models</span><span><strong>{new Set(models.map((model)=>model.provider)).size}</strong> providers</span></div></>}
      {tab === "extensions" && <><h2>Extensions</h2><p className="settings-lead">PI extensions are the equivalent of DeepSeek Harness plugins.</p><div className="compatibility-note"><AlertTriangle/><div><strong>Web compatibility</strong><span>Tools, events, commands, standard dialogs, status, and text widgets work. Terminal-only custom components and renderers do not cross PI RPC.</span></div></div><label className="search dialog-search"><Search/><input value={extensionSearch} onChange={(event) => setExtensionSearch(event.target.value)} placeholder="Search configured extension sources" aria-label="Search extensions"/></label><div className="inventory-summary"><span><strong>{extensions.length}</strong> configured sources</span><span><strong>{commands.filter((item)=>item.source === "extension").length}</strong> commands</span></div><div className="settings-extension-list">{filteredExtensions.map((extension,index) => <div className="extension-row" key={`${extension.path}-${index}`}><span className="extension-logo"><Package/></span><div><strong>{extension.name}</strong><small>{extension.source}</small><span>{extension.scope} · {extension.resources.length} resource{extension.resources.length === 1 ? "" : "s"}</span></div><em>configured</em></div>)}</div></>}
      {tab === "session" && <><h2>Session</h2><p className="settings-lead">History, context, retries, and export controls for this PI session.</p><div className="session-action-grid"><button disabled={!ready} onClick={onRename}><FileCode2/>Rename session</button><button disabled={!ready} onClick={onClone}><GitFork/>Clone branch</button><button disabled={!ready || state?.isStreaming} onClick={() => onCommand({type:"compact"})}><Archive/>Compact context</button><button disabled={!ready} onClick={() => onCommand({type:"export_html"})}><Download/>Export HTML</button></div><SettingRow title="Auto compaction" description="Compact automatically when context is nearly full."><button className="toggle" role="switch" aria-checked={Boolean(state?.autoCompactionEnabled)} disabled={!ready} onClick={() => onCommand({type:"set_auto_compaction",enabled:!state?.autoCompactionEnabled})}><i/></button></SettingRow><SettingRow title="Auto retry" description="Retry transient provider errors automatically."><button className="toggle" role="switch" aria-checked={Boolean(state?.autoRetryEnabled)} disabled={!ready} onClick={() => onCommand({type:"set_auto_retry",enabled:!state?.autoRetryEnabled})}><i/></button></SettingRow><div className="inventory-summary"><span><strong>{String(stats.totalMessages ?? state?.messageCount ?? 0)}</strong> messages</span><span><strong>{formatCompact(Number((stats.tokens as Record<string,number>|undefined)?.total ?? 0))}</strong> tokens</span><span><strong>${Number(stats.cost ?? 0).toFixed(4)}</strong> cost</span></div></>}
    </section>
  </ModalSurface>;
}

function SettingRow({ title, description, children }: { title: string; description: string; children: ReactNode }) { return <div className="setting-row"><div><strong>{title}</strong><span>{description}</span></div><div>{children}</div></div>; }
function formatCompact(value: number) { return Intl.NumberFormat(undefined,{notation:"compact",maximumFractionDigits:1}).format(value); }
