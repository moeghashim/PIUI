export type ContentBlock =
  | { type: "text"; text: string }
  | { type: "thinking"; thinking: string }
  | { type: "image"; data: string; mimeType: string }
  | { type: "toolCall"; id: string; name: string; arguments: Record<string, unknown> }
  | Record<string, unknown>;

export interface AgentMessage {
  role: string;
  content?: string | ContentBlock[];
  timestamp?: number;
  provider?: string;
  model?: string;
  stopReason?: string;
  errorMessage?: string;
  toolCallId?: string;
  toolName?: string;
  isError?: boolean;
  command?: string;
  output?: string;
  summary?: string;
  customType?: string;
  usage?: {
    totalTokens?: number;
    cost?: { total?: number };
  };
  [key: string]: unknown;
}

export interface SessionItem {
  path: string;
  id: string;
  cwd: string;
  name?: string;
  created: string;
  modified: string;
  messageCount: number;
  firstMessage: string;
}

export interface ExtensionItem {
  name: string;
  source: string;
  path: string;
  scope: "user" | "project";
  resources: string[];
}

export interface MarketplaceExtension {
  name: string;
  description: string;
  author: string;
  downloads: number;
  downloadsLabel: string;
  updated: string;
  types: string[];
  detailsUrl: string;
  npmUrl: string;
  repositoryUrl?: string;
  installCommand: string;
}

export interface MarketplacePage {
  items: MarketplaceExtension[];
  page: number;
  pages: number;
  total: number;
  allPackagesTotal?: number;
  source: "pi.dev" | "fixture";
}

export interface ModelInfo {
  provider: string;
  id: string;
  name?: string;
  reasoning?: boolean;
  contextWindow?: number;
  maxTokens?: number;
}

export interface SlashCommand {
  name: string;
  description?: string;
  source: "extension" | "prompt" | "skill";
  sourceInfo?: Record<string, unknown>;
}

export interface RpcState {
  model?: ModelInfo | undefined;
  thinkingLevel: string;
  isStreaming: boolean;
  isCompacting: boolean;
  sessionFile?: string | undefined;
  sessionId: string;
  sessionName?: string | undefined;
  messageCount: number;
  pendingMessageCount: number;
  autoCompactionEnabled: boolean;
  autoRetryEnabled?: boolean;
  steeringMode?: string;
  followUpMode?: string;
}

export interface ToolExecution {
  id: string;
  name: string;
  args: unknown;
  result?: unknown;
  status: "running" | "success" | "error";
}

export interface ExtensionUiRequest {
  type: "extension_ui_request";
  id: string;
  method: string;
  title?: string;
  message?: string;
  options?: string[];
  placeholder?: string;
  prefill?: string;
  statusKey?: string;
  statusText?: string;
  widgetKey?: string;
  widgetLines?: string[];
  widgetPlacement?: string;
  notifyType?: string;
  text?: string;
  timeout?: number;
}
