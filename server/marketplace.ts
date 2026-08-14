import { readFile } from "node:fs/promises";

export type MarketplaceSort = "downloads" | "recent" | "name";

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

export interface MarketplaceQuery {
  page?: number;
  name?: string;
  sort?: MarketplaceSort;
}

const cache = new Map<string, { expires: number; value: MarketplacePage }>();
const CACHE_TTL = 5 * 60_000;

export async function listMarketplaceExtensions(query: MarketplaceQuery = {}): Promise<MarketplacePage> {
  const page = clampPage(query.page);
  const name = String(query.name ?? "").trim().slice(0, 120);
  const sort = validSort(query.sort) ? query.sort : "downloads";
  const fixture = process.env.PIUI_MARKETPLACE_FIXTURE;
  if (fixture) return listFixtureExtensions(fixture, { page, name, sort });

  const key = JSON.stringify({ page, name, sort });
  const cached = cache.get(key);
  if (cached && cached.expires > Date.now()) return cached.value;
  const url = new URL("https://pi.dev/packages");
  url.searchParams.set("type", "extension");
  url.searchParams.set("page", String(page));
  if (name) url.searchParams.set("name", name);
  if (sort !== "downloads") url.searchParams.set("sort", sort);
  const response = await fetch(url, { headers: { accept: "text/html", "user-agent": "PIUI/0.1 extension-catalog" }, signal: AbortSignal.timeout(12_000) });
  if (!response.ok) throw new Error(`PI marketplace returned HTTP ${response.status}`);
  const length = Number(response.headers.get("content-length") ?? 0);
  if (length > 4 * 1024 * 1024) throw new Error("PI marketplace response is too large");
  const html = await response.text();
  if (html.length > 4 * 1024 * 1024) throw new Error("PI marketplace response is too large");
  const value = parseMarketplaceHtml(html, page);
  cache.set(key, { expires: Date.now() + CACHE_TTL, value });
  return value;
}

export function parseMarketplaceHtml(html: string, requestedPage = 1): MarketplacePage {
  const items: MarketplaceExtension[] = [];
  const cardPattern = /<article\b([^>]*\bdata-package-card="true"[^>]*)>([\s\S]*?)<\/article>/gi;
  for (const match of html.matchAll(cardPattern)) {
    const attributes = match[1] ?? "";
    const body = match[2] ?? "";
    const name = decodeHtml(attribute(attributes, "data-package-name"));
    if (!name) continue;
    const meta = [...body.matchAll(/<div\b[^>]*class="[^"]*packages-meta[^"]*"[^>]*>([\s\S]*?)<\/div>/gi)][0]?.[1] ?? "";
    const metaValues = [...meta.matchAll(/<span\b[^>]*>([\s\S]*?)<\/span>/gi)].map((value) => textContent(value[1] ?? ""));
    const links = [...body.matchAll(/<a\b[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi)].map((value) => ({ href: decodeHtml(value[1] ?? ""), text: textContent(value[2] ?? "") }));
    const npmUrl = safeHttpUrl(links.find((link) => link.text.toLowerCase().includes("npm"))?.href) ?? `https://www.npmjs.com/package/${encodePackageName(name)}`;
    const repositoryUrl = safeHttpUrl(links.find((link) => link.text.toLowerCase().includes("repo"))?.href);
    const types = attribute(attributes, "data-package-types").split(/\s+/).filter(Boolean);
    items.push({
      name,
      description: textContent(body.match(/<p\b[^>]*class="[^"]*packages-desc[^"]*"[^>]*>([\s\S]*?)<\/p>/i)?.[1] ?? ""),
      author: metaValues[0] ?? "",
      downloads: Number(attribute(attributes, "data-package-downloads")) || 0,
      downloadsLabel: metaValues[1] ?? "",
      updated: metaValues[2] ?? "",
      types: types.length ? types : ["extension"],
      detailsUrl: `https://pi.dev/packages/${encodePackageName(name)}?type=extension`,
      npmUrl,
      ...(repositoryUrl ? { repositoryUrl } : {}),
      installCommand: `pi install npm:${name}`,
    });
  }
  const summary = textContent(html).match(/(?:All packages\s*)?(\d[\d,]*)-(\d[\d,]*)\s*\/\s*(\d[\d,]*)(?:\s*\(of\s*(\d[\d,]*)\))?/i);
  const total = toNumber(summary?.[3]) || items.length;
  const allPackagesTotal = toNumber(summary?.[4]);
  const pageLinks = [...html.matchAll(/[?&]page=(\d+)/g)].map((match) => Number(match[1]));
  const pages = Math.max(requestedPage, ...pageLinks, total > 0 ? Math.ceil(total / 50) : 1);
  return { items, page: requestedPage, pages, total, ...(allPackagesTotal ? { allPackagesTotal } : {}), source: "pi.dev" };
}

async function listFixtureExtensions(path: string, query: Required<Pick<MarketplaceQuery, "page" | "name" | "sort">>): Promise<MarketplacePage> {
  const fixture = JSON.parse(await readFile(path, "utf8")) as { pageSize?: number; items?: MarketplaceExtension[] };
  const pageSize = Math.max(1, Math.min(50, Number(fixture.pageSize) || 50));
  const needle = query.name.toLowerCase();
  let items = (fixture.items ?? []).filter((item) => !needle || `${item.name} ${item.description} ${item.author}`.toLowerCase().includes(needle));
  items = [...items].sort((a, b) => query.sort === "name" ? a.name.localeCompare(b.name) : query.sort === "recent" ? a.updated.localeCompare(b.updated) : b.downloads - a.downloads);
  const pages = Math.max(1, Math.ceil(items.length / pageSize));
  const page = Math.min(query.page, pages);
  return { items: items.slice((page - 1) * pageSize, page * pageSize), page, pages, total: items.length, source: "fixture" };
}

function attribute(attributes: string, name: string) {
  return attributes.match(new RegExp(`\\b${name}="([^"]*)"`, "i"))?.[1] ?? "";
}

function textContent(value: string) {
  return decodeHtml(value.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim());
}

function decodeHtml(value: string) {
  return value.replace(/&(#x[0-9a-f]+|#\d+|amp|quot|apos|lt|gt);/gi, (entity, code: string) => {
    if (code[0] === "#") return String.fromCodePoint(Number.parseInt(code.slice(code[1]?.toLowerCase() === "x" ? 2 : 1), code[1]?.toLowerCase() === "x" ? 16 : 10));
    return ({ amp: "&", quot: '"', apos: "'", lt: "<", gt: ">" } as Record<string, string>)[code.toLowerCase()] ?? entity;
  });
}

function safeHttpUrl(value: string | undefined) {
  if (!value) return undefined;
  try { const url = new URL(value); return ["http:", "https:"].includes(url.protocol) ? url.href : undefined; } catch { return undefined; }
}

function encodePackageName(name: string) {
  return name.split("/").map(encodeURIComponent).join("/");
}

function toNumber(value: string | undefined) { return Number((value ?? "").replaceAll(",", "")) || 0; }
function clampPage(value: number | undefined) { return Math.max(1, Math.min(10_000, Math.floor(Number(value) || 1))); }
function validSort(value: unknown): value is MarketplaceSort { return value === "downloads" || value === "recent" || value === "name"; }
