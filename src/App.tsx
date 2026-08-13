import { useState } from "react";
import { Composer, Conversation, ExtensionDialog, ExtensionsPanel, Sidebar, StartDialog, Toasts, Topbar } from "./components";
import { usePiui } from "./use-piui";
import type { SessionItem } from "./types";

export default function App() {
  const piui = usePiui();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => window.innerWidth <= 650);
  const [startDialog, setStartDialog] = useState<{ session?: SessionItem }>();
  const [showExtensions, setShowExtensions] = useState(false);

  const launch = (cwd: string, trust: boolean) => {
    piui.start(cwd, trust, startDialog?.session?.path);
    setStartDialog(undefined);
  };
  const running = piui.runtime.status === "running";
  const rename = () => {
    const name = window.prompt("Session name", piui.rpcState?.sessionName ?? "");
    if (name !== null) piui.command({ type: "set_session_name", name });
  };

  return <div className="app-shell">
    <Sidebar sessions={piui.catalog.sessions} currentFile={piui.rpcState?.sessionFile} openSession={(session) => setStartDialog({session})} newSession={() => setStartDialog({})} collapsed={sidebarCollapsed} setCollapsed={setSidebarCollapsed}/>
    <section className="workspace-shell">
      <Topbar state={piui.rpcState} runtime={piui.runtime} models={piui.models} thinkingLevels={piui.thinkingLevels} onModel={(provider,id)=>piui.command({type:"set_model",provider,modelId:id})} onThinking={(level)=>piui.command({type:"set_thinking_level",level})} onRename={rename} onClone={()=>piui.command({type:"clone"})} onShowExtensions={()=>setShowExtensions(true)}/>
      <Conversation messages={piui.conversation.messages} streaming={piui.conversation.streaming} tools={piui.conversation.tools} emptyAction={()=>setStartDialog({})}/>
      <Composer running={running} settled={piui.conversation.settled} commands={piui.commands} statuses={piui.statuses} widgets={piui.widgets} injection={piui.editorInjection} clearInjection={()=>piui.setEditorInjection(undefined)} onSubmit={(message,behavior)=>piui.command({type:"prompt",message,...(behavior?{streamingBehavior:behavior}:{})})} onAbort={()=>piui.command({type:"abort"})}/>
    </section>
    {!piui.connected && <div className="connection-banner">Reconnecting to PIUI…</div>}
    {startDialog && <StartDialog initialCwd={startDialog.session?.cwd ?? piui.catalog.cwd} session={startDialog.session} close={()=>setStartDialog(undefined)} start={launch}/>}
    {piui.dialog && <ExtensionDialog request={piui.dialog} respond={piui.respondToDialog}/>}
    {showExtensions && <ExtensionsPanel extensions={piui.catalog.extensions} commands={piui.commands} close={()=>setShowExtensions(false)} refresh={()=>piui.refreshCatalog()}/>}
    <Toasts items={piui.toasts}/>
  </div>;
}
