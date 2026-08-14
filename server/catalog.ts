import { execFile } from "node:child_process";
import { readFile, readdir, realpath, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, dirname, join, resolve, sep } from "node:path";
import { promisify } from "node:util";
import { SessionManager } from "@earendil-works/pi-coding-agent";
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
  let directories: string[] = [];
  try {
    directories = (await readdir(root, { withFileTypes: true }))
      .filter((entry) => entry.isDirectory() || entry.isSymbolicLink())
      .map((entry) => join(root, entry.name));
  } catch { /* no session directory yet */ }
  const sessions = (await Promise.all([SessionManager.listAll(root), ...directories.map((directory) => SessionManager.listAll(directory))])).flat();
  return sessions.map((session): SessionCatalogItem => ({
    path: session.path,
    id: session.id,
    cwd: session.cwd,
    ...(session.name ? { name: session.name } : {}),
    created: session.created.toISOString(),
    modified: session.modified.toISOString(),
    messageCount: session.messageCount,
    firstMessage: session.firstMessage.slice(0, 160),
  })).sort((a, b) => b.modified.localeCompare(a.modified));
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

export async function validateWorkspace(input: string): Promise<string> {
  if (!input.trim()) throw new Error("Workspace directory is required");
  const path = await realpath(resolve(input));
  if (!(await stat(path)).isDirectory()) throw new Error("Workspace must be a directory");
  return path.endsWith(sep) && path !== sep ? path.slice(0, -1) : path;
}

export async function validateSessionPath(path: string, agentDir = process.env.PI_CODING_AGENT_DIR ?? join(homedir(), ".pi", "agent")): Promise<string> {
  const [resolvedPath, sessionRoot] = await Promise.all([realpath(resolve(path)), realpath(join(agentDir, "sessions"))]);
  if (!resolvedPath.startsWith(`${sessionRoot}${sep}`) || !resolvedPath.endsWith(".jsonl")) throw new Error("Session path is outside PI's session directory");
  return resolvedPath;
}

export async function sessionWorkspace(path: string, agentDir = process.env.PI_CODING_AGENT_DIR ?? join(homedir(), ".pi", "agent")): Promise<string> {
  const resolvedPath = await validateSessionPath(path, agentDir);
  const firstLine = (await readFile(resolvedPath, "utf8")).split("\n", 1)[0];
  const header = JSON.parse(firstLine ?? "null") as SessionHeader | null;
  if (!header || header.type !== "session" || typeof header.cwd !== "string" || !header.cwd.trim()) throw new Error("Session has no valid workspace");
  return validateWorkspace(header.cwd);
}
