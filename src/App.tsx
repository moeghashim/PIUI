import { useEffect, useState } from "react";
import { Composer, Conversation, ExtensionDialog, Sidebar, StartDialog, Toasts, Topbar, ViewTabs } from "./components";
import { ModelPicker, RenameDialog, SessionDetails, SettingsDialog, type SettingsTab, type ThemeChoice } from "./surfaces";
import { usePiui } from "./use-piui";
import type { SessionItem } from "./types";

export default function App() {
  const piui = usePiui();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => window.innerWidth <= 650);
  const [startDialog, setStartDialog] = useState<{ session?: SessionItem }>();
  const [settingsTab, setSettingsTab] = useState<SettingsTab>();
  const [showModelPicker, setShowModelPicker] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const [showRename, setShowRename] = useState(false);
  const [theme, setTheme] = useState<ThemeChoice>(() => (localStorage.getItem("piui-theme") as ThemeChoice | null) ?? "system");
  const [busyMode, setBusyMode] = useState<"steer"|"followUp">(() => localStorage.getItem("piui-busy-mode") === "followUp" ? "followUp" : "steer");

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem("piui-theme",theme);
  }, [theme]);
  useEffect(() => {
    const media = window.matchMedia("(max-width: 650px)");
    const change = () => setSidebarCollapsed(media.matches);
    media.addEventListener("change",change);
    return () => media.removeEventListener("change",change);
  }, []);

  const launch = (cwd: string, trust: boolean) => {
    piui.start(cwd, trust, startDialog?.session?.path);
    setStartDialog(undefined);
  };
  const openSettings = (tab: SettingsTab) => setSettingsTab(tab);
  const rename = () => setShowRename(true);
  const updateBusyMode = (mode:"steer"|"followUp") => { setBusyMode(mode); localStorage.setItem("piui-busy-mode",mode); };

  return <div className="app-shell">
    <Sidebar sessions={piui.catalog.sessions} currentFile={piui.rpcState?.sessionFile} openSession={(session) => setStartDialog({session})} newSession={() => setStartDialog({})} collapsed={sidebarCollapsed} setCollapsed={setSidebarCollapsed}/>
    {!sidebarCollapsed && <button className="sidebar-scrim" onClick={()=>setSidebarCollapsed(true)} aria-label="Close sidebar"/>}
    <section className="workspace-shell">
      <Topbar state={piui.rpcState} runtime={piui.runtime} ready={piui.ready} thinkingLevels={piui.thinkingLevels} onShowModels={()=>setShowModelPicker(true)} onThinking={(level)=>piui.command({type:"set_thinking_level",level})} onRename={rename} onClone={()=>piui.command({type:"clone"})} onShowExtensions={()=>openSettings("extensions")} onShowSettings={()=>openSettings("general")} onShowDetails={()=>setShowDetails(true)}/>
      <ViewTabs entryCount={piui.entries.length} onShowTrajectory={()=>setShowDetails(true)}/>
      <Conversation messages={piui.conversation.messages} streaming={piui.conversation.streaming} tools={piui.conversation.tools} ready={piui.ready} emptyAction={()=>piui.catalog.cwd && setStartDialog({})}/>
      <Composer running={piui.ready} settled={piui.conversation.settled} commands={piui.commands} statuses={piui.statuses} widgets={piui.widgets} stats={piui.stats} injection={piui.editorInjection} clearInjection={()=>piui.setEditorInjection(undefined)} queueMode={busyMode} onQueueMode={updateBusyMode} onSubmit={(message,behavior,images)=>piui.command({type:"prompt",message,...(images?.length?{images}:{}),...(behavior?{streamingBehavior:behavior}:{})})} onAbort={()=>piui.command({type:"abort"})}/>
    </section>
    {!piui.connected && <div className="connection-banner">Reconnecting to PIUI…</div>}
    {startDialog && <StartDialog initialCwd={startDialog.session?.cwd ?? piui.catalog.cwd} session={startDialog.session} close={()=>setStartDialog(undefined)} start={launch}/>}
    {piui.dialog && <ExtensionDialog request={piui.dialog} respond={piui.respondToDialog}/>}
    {showModelPicker && <ModelPicker models={piui.models} current={piui.rpcState?.model} onSelect={(provider,id)=>piui.command({type:"set_model",provider,modelId:id})} close={()=>setShowModelPicker(false)}/>}
    {settingsTab && <SettingsDialog
      initialTab={settingsTab} state={piui.rpcState} ready={piui.ready} runtime={piui.runtime}
      models={piui.models} thinkingLevels={piui.thinkingLevels} extensions={piui.catalog.extensions}
      commands={piui.commands} stats={piui.stats} theme={theme} busyMode={busyMode}
      close={()=>setSettingsTab(undefined)} showModelPicker={()=>setShowModelPicker(true)} onTheme={setTheme}
      onBusyMode={updateBusyMode} onThinking={(level)=>piui.command({type:"set_thinking_level",level})}
      onCommand={piui.command} onRename={rename} onClone={()=>piui.command({type:"clone"})}
    />}
    {showDetails && <SessionDetails
      state={piui.rpcState} stats={piui.stats} entries={piui.entries}
      queue={{steering:piui.conversation.steering,followUp:piui.conversation.followUp}}
      runtime={piui.runtime} commands={piui.commands} close={()=>setShowDetails(false)}
    />}
    {showRename && <RenameDialog initial={piui.rpcState?.sessionName ?? ""} close={()=>setShowRename(false)} save={(name)=>{piui.command({type:"set_session_name",name});setShowRename(false);}}/>}
    <Toasts items={piui.toasts}/>
  </div>;
}
