import { execFile } from "node:child_process";
import { readFile, readdir, realpath, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, dirname, join, resolve, sep } from "node:path";
import { promisify } from "node:util";
import { resolvePiCli } from "./pi-process.js";

const execFileAsync = promisify(execFile);

export interface SessionCatalogItem {
  path: string;
  id: string;
  cwd: string;
  name?: string;
  created: string;
  modified: string;
  messageCount: number;
  firstMessage: string;
}

export interface ExtensionCatalogItem {
  name: string;
  source: string;
  path: string;
  scope: "user" | "project";
  resources: string[];
}

interface SessionHeader {
  type: "session";
  id: string;
  cwd: string;
  timestamp: string;
}

export async function listSessions(agentDir = process.env.PI_CODING_AGENT_DIR ?? join(homedir(), ".pi", "agent")) {
  const root = join(agentDir, "sessions");
  const paths = await findFiles(root, (name) => name.endsWith(".jsonl"));
  const sessions = await Promise.all(paths.map((path) => inspectSession(path)));
  return sessions
    .filter((item): item is SessionCatalogItem => item !== undefined)
    .sort((a, b) => b.modified.localeCompare(a.modified));
}

async function inspectSession(path: string): Promise<SessionCatalogItem | undefined> {
  try {
    const [content, fileStat] = await Promise.all([readFile(path, "utf8"), stat(path)]);
    const lines = content.split("\n").filter(Boolean);
    const header = JSON.parse(lines[0] ?? "null") as SessionHeader | null;
    if (!header || header.type !== "session" || typeof header.cwd !== "string") return undefined;
    let name: string | undefined;
    let firstMessage = "";
    let messageCount = 0;
    for (const line of lines.slice(1)) {
      let entry: Record<string, unknown>;
      try { entry = JSON.parse(line) as Record<string, unknown>; } catch { continue; }
      if (entry.type === "session_info" && typeof entry.name === "string") name = entry.name;
      if (entry.type !== "message" || !entry.message || typeof entry.message !== "object") continue;
      const message = entry.message as Record<string, unknown>;
      messageCount += 1;
      if (!firstMessage && message.role === "user") firstMessage = textContent(message.content).slice(0, 160);
    }
    return {
      path,
      id: header.id,
      cwd: header.cwd,
      ...(name ? { name } : {}),
      created: header.timestamp,
      modified: fileStat.mtime.toISOString(),
      messageCount,
      firstMessage,
    };
  } catch {
    return undefined;
  }
}

function textContent(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content.flatMap((part) => part && typeof part === "object" && (part as { type?: string }).type === "text" ? [(part as { text?: string }).text ?? ""] : []).join("\n");
}

export async function listExtensions(
  cwd: string,
  trusted: boolean,
  agentDir = process.env.PI_CODING_AGENT_DIR ?? join(homedir(), ".pi", "agent"),
): Promise<ExtensionCatalogItem[]> {
  const piCli = resolvePiCli();
  const { stdout } = await execFileAsync(process.execPath, [piCli, "list", "--no-approve"], {
    cwd,
    env: { ...process.env, PI_OFFLINE: "1" },
    maxBuffer: 4 * 1024 * 1024,
  });
  const packages = parsePiList(stdout);
  const result: ExtensionCatalogItem[] = [];
  for (const pkg of packages) {
    const resources = await packageExtensionResources(pkg.path);
    if (resources.length === 0) continue;
    result.push({
      name: packageDisplayName(pkg.source),
      source: pkg.source,
      path: pkg.path,
      scope: "user",
      resources,
    });
  }

  const roots: Array<{ path: string; scope: "user" | "project" }> = [
    { path: join(agentDir, "extensions"), scope: "user" },
    ...(trusted ? [{ path: join(cwd, ".pi", "extensions"), scope: "project" as const }] : []),
  ];
  for (const root of roots) {
    for (const path of await findExtensionEntries(root.path)) {
      result.push({ name: basename(dirname(path)) === "extensions" ? basename(path).replace(/\.[^.]+$/, "") : basename(dirname(path)), source: path, path, scope: root.scope, resources: [path] });
    }
  }
  return result;
}

function parsePiList(output: string): Array<{ source: string; path: string }> {
  const lines = output.split("\n");
  const result: Array<{ source: string; path: string }> = [];
  for (let index = 0; index < lines.length; index += 1) {
    const sourceLine = lines[index];
    const pathLine = lines[index + 1];
    if (!sourceLine?.startsWith("  ") || sourceLine.startsWith("    ") || !pathLine?.startsWith("    ")) continue;
    result.push({ source: sourceLine.trim(), path: pathLine.trim() });
    index += 1;
  }
  return result;
}

async function packageExtensionResources(packageRoot: string): Promise<string[]> {
  try {
    const pkg = JSON.parse(await readFile(join(packageRoot, "package.json"), "utf8")) as { pi?: { extensions?: string[] } };
    return (pkg.pi?.extensions ?? []).map((resource) => resolve(packageRoot, resource));
  } catch {
    return [];
  }
}

function packageDisplayName(source: string) {
  return source.replace(/^(npm:|git:|https?:\/\/)/, "").replace(/@[0-9a-f]{7,}$/, "");
}

async function findExtensionEntries(root: string): Promise<string[]> {
  try {
    const entries = await readdir(root, { withFileTypes: true });
    const found: string[] = [];
    for (const entry of entries) {
      if (entry.isFile() && /\.[cm]?[jt]s$/.test(entry.name)) found.push(join(root, entry.name));
      if (entry.isDirectory()) {
        for (const name of ["index.ts", "index.js", "index.mjs"]) {
          try { found.push(await realpath(join(root, entry.name, name))); break; } catch { /* no entry */ }
        }
      }
    }
    return found;
  } catch {
    return [];
  }
}

async function findFiles(root: string, accept: (name: string) => boolean): Promise<string[]> {
  try {
    const entries = await readdir(root, { withFileTypes: true });
    const nested = await Promise.all(entries.map(async (entry) => {
      const path = join(root, entry.name);
      if (entry.isDirectory()) return findFiles(path, accept);
      return entry.isFile() && accept(entry.name) ? [path] : [];
    }));
    return nested.flat();
  } catch {
    return [];
  }
}

export async function validateWorkspace(input: string): Promise<string> {
  const path = await realpath(resolve(input));
  if (!(await stat(path)).isDirectory()) throw new Error("Workspace must be a directory");
  return path.endsWith(sep) && path !== sep ? path.slice(0, -1) : path;
}

export async function validateSessionPath(path: string, agentDir = process.env.PI_CODING_AGENT_DIR ?? join(homedir(), ".pi", "agent")): Promise<string> {
  const [resolvedPath, sessionRoot] = await Promise.all([realpath(resolve(path)), realpath(join(agentDir, "sessions"))]);
  if (!resolvedPath.startsWith(`${sessionRoot}${sep}`) || !resolvedPath.endsWith(".jsonl")) throw new Error("Session path is outside PI's session directory");
  return resolvedPath;
}
