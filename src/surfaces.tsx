import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  Activity, AlertTriangle, Archive, BarChart3, Brain, Check, ChevronLeft, ChevronRight, CircleDollarSign,
  Copy, Download, ExternalLink, FileCode2, Folder, GitFork, Gauge, Info, LoaderCircle, MessageSquare, Package, RefreshCw,
  Search, Settings2, ShieldAlert, Sparkles, TerminalSquare, Wrench, X,
} from "lucide-react";
import type { ExtensionItem, MarketplacePage, ModelInfo, RpcState, SlashCommand } from "./types";

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
  const providerCount = useMemo(() => new Set(models.map((model) => model.provider)).size, [models]);
  const groups = useMemo(() => {
    const result = new Map<string,ModelInfo[]>();
    for (const model of filtered) result.set(model.provider,[...(result.get(model.provider) ?? []),model]);
    return result;
  }, [filtered]);
  return <ModalSurface className="picker-dialog" labelledBy="model-picker-title" close={close}>
    <header className="dialog-header"><div><span className="eyebrow"><Sparkles/> PI MODELS</span><h2 id="model-picker-title">Choose a model</h2><p>Models available through your local PI configuration.</p></div><button className="icon-button" onClick={close} aria-label="Close model picker"><X/></button></header>
    <label className="search dialog-search"><Search/><input autoFocus value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search models or providers" aria-label="Search models"/></label>
    <div className="model-source-note"><Info/><span><strong>{models.length} selectable models from {providerCount} provider{providerCount === 1 ? "" : "s"}.</strong> PI only returns providers that are configured and authenticated. Add another provider with <code>/login</code> in PI, then restart this runtime.</span></div>
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
      {tab === "models" && <><h2>Models</h2><p className="settings-lead">PIUI shows the selectable models returned by your local PI runtime. Providers without configured authentication stay hidden.</p><div className="current-model-card"><span className="model-icon"><Sparkles/></span><div><small>Current model</small><strong>{state?.model ? `${state.model.name ?? state.model.id}` : ready ? "No model selected" : "Starting PI…"}</strong><span>{state?.model ? `${state.model.provider}/${state.model.id}` : ""}</span></div><button className="secondary" disabled={!ready} onClick={showModelPicker}>Choose model</button></div><h3>Reasoning effort</h3><div className="effort-grid">{thinkingLevels.map((level) => <button key={level} disabled={!ready} aria-pressed={state?.thinkingLevel === level} onClick={() => onThinking(level)}><Brain/>{level}</button>)}</div><div className="inventory-summary"><span><strong>{models.length}</strong> models</span><span><strong>{new Set(models.map((model)=>model.provider)).size}</strong> authenticated providers</span></div></>}
      {tab === "extensions" && <MarketplaceExtensions extensions={extensions} commands={commands}/>}
      {tab === "session" && <><h2>Session</h2><p className="settings-lead">History, context, retries, and export controls for this PI session.</p><div className="session-action-grid"><button disabled={!ready} onClick={onRename}><FileCode2/>Rename session</button><button disabled={!ready} onClick={onClone}><GitFork/>Clone branch</button><button disabled={!ready || state?.isStreaming} onClick={() => onCommand({type:"compact"})}><Archive/>Compact context</button><button disabled={!ready} onClick={() => onCommand({type:"export_html"})}><Download/>Export HTML</button></div><SettingRow title="Auto compaction" description="Compact automatically when context is nearly full."><button className="toggle" role="switch" aria-checked={Boolean(state?.autoCompactionEnabled)} disabled={!ready} onClick={() => onCommand({type:"set_auto_compaction",enabled:!state?.autoCompactionEnabled})}><i/></button></SettingRow><SettingRow title="Auto retry" description="Retry transient provider errors automatically."><button className="toggle" role="switch" aria-checked={Boolean(state?.autoRetryEnabled)} disabled={!ready} onClick={() => onCommand({type:"set_auto_retry",enabled:!state?.autoRetryEnabled})}><i/></button></SettingRow><div className="inventory-summary"><span><strong>{String(stats.totalMessages ?? state?.messageCount ?? 0)}</strong> messages</span><span><strong>{formatCompact(Number((stats.tokens as Record<string,number>|undefined)?.total ?? 0))}</strong> tokens</span><span><strong>${Number(stats.cost ?? 0).toFixed(4)}</strong> cost</span></div></>}
    </section>
  </ModalSurface>;
}

function MarketplaceExtensions({ extensions, commands }: { extensions: ExtensionItem[]; commands: SlashCommand[] }) {
  const [view, setView] = useState<"marketplace" | "installed">("marketplace");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<"downloads" | "recent" | "name">("downloads");
  const [page, setPage] = useState(1);
  const [marketplace, setMarketplace] = useState<MarketplacePage>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [refresh, setRefresh] = useState(0);
  const [copied, setCopied] = useState("");
  const filteredInstalled = extensions.filter((item) => `${item.name} ${item.source} ${item.scope}`.toLowerCase().includes(search.toLowerCase()));
  const installedNames = useMemo(() => new Set(extensions.map((item) => npmPackageName(item.source)).filter(Boolean)), [extensions]);

  useEffect(() => {
    if (view !== "marketplace") return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setLoading(true);
      setError("");
      const query = new URLSearchParams({ page: String(page), sort });
      if (search.trim()) query.set("name", search.trim());
      void fetch(`/api/marketplace/extensions?${query}`, { signal: controller.signal })
        .then(async (response) => {
          const body = await response.json() as MarketplacePage & { error?: string };
          if (!response.ok) throw new Error(body.error ?? `Marketplace request failed (${response.status})`);
          setMarketplace(body);
        })
        .catch((reason: unknown) => { if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : String(reason)); })
        .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    }, 250);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [page, refresh, search, sort, view]);

  const copyInstall = (name: string, command: string) => {
    void navigator.clipboard.writeText(command).then(() => {
      setCopied(name);
      window.setTimeout(() => setCopied((value) => value === name ? "" : value), 1600);
    });
  };

  return <>
    <h2>Extensions</h2>
    <p className="settings-lead">Browse every extension package published in PI's official marketplace or inspect this runtime's configured sources.</p>
    <div className="extension-view-tabs" role="tablist" aria-label="Extension catalog view">
      <button role="tab" aria-selected={view === "marketplace"} onClick={() => { setView("marketplace"); setPage(1); }}>Marketplace</button>
      <button role="tab" aria-selected={view === "installed"} onClick={() => setView("installed")}>Installed <span>{extensions.length}</span></button>
    </div>
    <div className="marketplace-tools">
      <label className="search dialog-search"><Search/><input value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} placeholder={view === "marketplace" ? "Search all marketplace extensions" : "Search installed extensions"} aria-label="Search extensions"/></label>
      {view === "marketplace" && <label className="marketplace-sort"><span className="sr-only">Sort extensions</span><select aria-label="Sort extensions" value={sort} onChange={(event) => { setSort(event.target.value as typeof sort); setPage(1); }}><option value="downloads">Most downloaded</option><option value="recent">Recently updated</option><option value="name">Name A–Z</option></select></label>}
    </div>
    {view === "marketplace" ? <>
      <div className="marketplace-note"><ShieldAlert/><span><strong>Packages run as local code.</strong> Review third-party extensions before installing. PIUI lists the official catalog but does not install anything automatically.</span></div>
      <div className="inventory-summary marketplace-summary"><span><strong>{marketplace?.total.toLocaleString() ?? "—"}</strong> matching {marketplace?.total === 1 ? "extension" : "extensions"}</span><span>Official source: <a href="https://pi.dev/packages?type=extension" target="_blank" rel="noreferrer">pi.dev <ExternalLink/></a></span></div>
      {loading && <div className="marketplace-state"><LoaderCircle className="spin"/><span>Loading marketplace…</span></div>}
      {!loading && error && <div className="marketplace-state error"><AlertTriangle/><div><strong>Marketplace unavailable</strong><span>{error}</span></div><button className="secondary" onClick={() => setRefresh((value) => value + 1)}>Retry</button></div>}
      {!loading && !error && <div className="settings-extension-list marketplace-list">{marketplace?.items.map((extension) => {
        const installed = installedNames.has(extension.name);
        return <article className="marketplace-row" key={extension.name}>
          <span className="extension-logo"><Package/></span>
          <div className="marketplace-package"><div className="marketplace-name"><a href={extension.detailsUrl} target="_blank" rel="noreferrer">{extension.name}</a>{installed && <em>installed</em>}</div><p>{extension.description || "No description provided."}</p><small>{extension.author || "unknown author"} · {extension.downloadsLabel || `${extension.downloads.toLocaleString()}/mo`} · {extension.updated}</small></div>
          <div className="marketplace-actions"><a href={extension.npmUrl} target="_blank" rel="noreferrer" aria-label={`Open ${extension.name} on npm`}>npm <ExternalLink/></a><button className="secondary" onClick={() => copyInstall(extension.name, extension.installCommand)} aria-label={`Copy install command for ${extension.name}`}><Copy/>{copied === extension.name ? "Copied" : "Install command"}</button></div>
        </article>;
      })}{marketplace?.items.length === 0 && <p className="empty-list">No marketplace extensions match this search.</p>}</div>}
      {!loading && !error && marketplace && marketplace.pages > 1 && <nav className="marketplace-pagination" aria-label="Marketplace pages"><button className="secondary" disabled={marketplace.page <= 1} onClick={() => setPage(marketplace.page - 1)}><ChevronLeft/>Previous</button><span>Page <strong>{marketplace.page}</strong> of <strong>{marketplace.pages}</strong></span><button className="secondary" disabled={marketplace.page >= marketplace.pages} onClick={() => setPage(marketplace.page + 1)}>Next<ChevronRight/></button></nav>}
    </> : <>
      <div className="compatibility-note"><AlertTriangle/><div><strong>Web compatibility</strong><span>Tools, events, commands, standard dialogs, status, and text widgets work. Terminal-only custom components and renderers do not cross PI RPC.</span></div></div>
      <div className="inventory-summary"><span><strong>{extensions.length}</strong> configured sources</span><span><strong>{commands.filter((item)=>item.source === "extension").length}</strong> commands</span></div>
      <div className="settings-extension-list">{filteredInstalled.map((extension,index) => <div className="extension-row" key={`${extension.path}-${index}`}><span className="extension-logo"><Package/></span><div><strong>{extension.name}</strong><small>{extension.source}</small><span>{extension.scope} · {extension.resources.length} resource{extension.resources.length === 1 ? "" : "s"}</span></div><em>configured</em></div>)}{filteredInstalled.length === 0 && <p className="empty-list">No installed extensions match this search.</p>}</div>
    </>}
  </>;
}

function npmPackageName(source: string) {
  if (!source.startsWith("npm:")) return "";
  const value = source.slice(4);
  const versionAt = value.lastIndexOf("@");
  return versionAt > 0 ? value.slice(0, versionAt) : value;
}

function SettingRow({ title, description, children }: { title: string; description: string; children: ReactNode }) { return <div className="setting-row"><div><strong>{title}</strong><span>{description}</span></div><div>{children}</div></div>; }
function formatCompact(value: number) { return Intl.NumberFormat(undefined,{notation:"compact",maximumFractionDigits:1}).format(value); }
