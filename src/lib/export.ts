// Markdown / JSON export and Markdown import.

import { BlockNoteEditor } from "@blocknote/core";
import { viewRows, valueToText } from "./db";
import { assetToPortable, fnApi, pickTextFiles, saveTextFile } from "./storage";
import { createPage, descendants, mergeWorkspace, replaceContent, toast, useApp } from "./store";
import type { ID, Page, WorkspaceData } from "./types";
import { pageTitle } from "./utils";

function inline(content: any, pages: Record<ID, Page>): string {
  if (!content) return "";
  if (typeof content === "string") return content;
  if (Array.isArray(content)) return content.map((c) => inline(c, pages)).join("");
  switch (content.type) {
    case "text": {
      let t = content.text || "";
      const s = content.styles || {};
      if (!t.trim()) return t;
      if (s.code) t = "`" + t + "`";
      if (s.bold) t = `**${t}**`;
      if (s.italic) t = `*${t}*`;
      if (s.strike) t = `~~${t}~~`;
      return t;
    }
    case "link":
      return `[${inline(content.content, pages)}](${content.href})`;
    case "mention":
      return `@${pageTitle(pages[content.props?.pageId])}`;
    case "dateMention":
      return `@${content.props?.date || ""}`;
    default:
      return "";
  }
}

function tableMd(rows: string[][]): string {
  if (!rows.length) return "";
  const esc = (s: string) => s.replace(/\|/g, "\\|").replace(/\n/g, " ");
  const head = rows[0];
  const out = [`| ${head.map(esc).join(" | ")} |`, `| ${head.map(() => "---").join(" | ")} |`];
  for (const r of rows.slice(1)) out.push(`| ${r.map(esc).join(" | ")} |`);
  return out.join("\n");
}

export function databaseToMd(db: Page, pages: Record<ID, Page>): string {
  if (!db.db) return "";
  const view = db.db.views[0];
  const rows = viewRows(db, view, pages);
  const props = db.db.properties;
  return tableMd([props.map((p) => p.name), ...rows.map((r) => props.map((p) => valueToText(r, p, pages)))]);
}

export function blocksToMarkdown(blocks: any[], pages: Record<ID, Page>, depth = 0): string {
  const out: string[] = [];
  const pad = "  ".repeat(depth);
  const LIST = ["bulletListItem", "numberedListItem", "checkListItem", "toggleListItem"];
  let n = 0;
  let prevList = false;
  for (const b of blocks || []) {
    // Consecutive list items are joined with a single newline (tight lists).
    const isList = LIST.includes(b.type);
    if (isList && prevList && out.length) out[out.length - 1] += "\u0000";
    prevList = isList;
    const text = inline(b.content, pages);
    if (b.type !== "numberedListItem") n = 0;
    let line = "";
    switch (b.type) {
      case "heading":
        line = `${"#".repeat(Math.min(6, b.props?.level || 1))} ${text}`;
        break;
      case "bulletListItem":
      case "toggleListItem":
        line = `${pad}- ${text}`;
        break;
      case "numberedListItem":
        n += 1;
        line = `${pad}${n}. ${text}`;
        break;
      case "checkListItem":
        line = `${pad}- [${b.props?.checked ? "x" : " "}] ${text}`;
        break;
      case "quote":
        line = `> ${text}`;
        break;
      case "callout":
        line = `> ${b.props?.emoji || "💡"} ${text}`;
        break;
      case "codeBlock":
        line = "```" + (b.props?.language || "") + "\n" + inline(b.content, pages) + "\n```";
        break;
      case "divider":
        line = "---";
        break;
      case "image":
        line = `![${b.props?.caption || b.props?.name || ""}](${b.props?.url || ""})`;
        break;
      case "video":
      case "audio":
      case "file":
        line = `[${b.props?.name || b.props?.caption || "file"}](${b.props?.url || ""})`;
        break;
      case "table": {
        const rows = (b.content?.rows || []).map((r: any) => (r.cells || []).map((c: any) => inline(c?.content ?? c, pages)));
        line = tableMd(rows);
        break;
      }
      case "pageLink":
        line = `📄 ${pageTitle(pages[b.props?.pageId])}`;
        break;
      case "database": {
        const db = pages[b.props?.dbId];
        line = db ? `**${pageTitle(db)}**\n\n${databaseToMd(db, pages)}` : "";
        break;
      }
      default:
        line = depth ? pad + text : text;
    }
    out.push(line);
    if (b.children?.length) {
      const nested = ["bulletListItem", "numberedListItem", "checkListItem", "toggleListItem"].includes(b.type);
      out.push(blocksToMarkdown(b.children, pages, nested ? depth + 1 : depth));
    }
  }
  return out
    .filter((l) => l !== undefined)
    .join("\n\n")
    .replace(/\u0000\n\n/g, "\n")
    .replace(/\u0000/g, "")
    .replace(/\n{3,}/g, "\n\n");
}

export function pageToMarkdown(page: Page, pages: Record<ID, Page>): string {
  const parts = [`# ${page.icon ? page.icon + " " : ""}${pageTitle(page)}`];
  if (page.isRow && page.parentId && pages[page.parentId]?.db) {
    const db = pages[page.parentId].db!;
    const lines = db.properties
      .filter((p) => p.type !== "title")
      .map((p) => `- **${p.name}:** ${valueToText(page, p, pages)}`);
    if (lines.length) parts.push(lines.join("\n"));
  }
  if (page.type === "database") parts.push(databaseToMd(page, pages));
  const body = blocksToMarkdown(page.content, pages);
  if (body.trim()) parts.push(body);
  return parts.join("\n\n") + "\n";
}

const safeName = (s: string) => (s || "Untitled").replace(/[\\/:*?"<>|]+/g, "-").slice(0, 80);

export async function exportPageMarkdown(id: ID) {
  const s = useApp.getState();
  const page = s.pages[id];
  if (!page) return;
  const md = pageToMarkdown(page, s.pages);
  const saved = await saveTextFile(`${safeName(pageTitle(page))}.md`, md, [{ name: "Markdown", extensions: ["md"] }]);
  if (saved) toast("Exported as Markdown");
}

export async function exportPagePdf(id: ID) {
  const page = useApp.getState().pages[id];
  if (!page) return;
  if (fnApi) {
    const saved = await fnApi.exportPdf({ defaultName: `${safeName(pageTitle(page))}.pdf` });
    if (saved) toast("Exported as PDF");
  } else {
    window.print();
  }
}

async function portable(data: WorkspaceData): Promise<WorkspaceData> {
  // Inline local images so the export works on any computer.
  const json = JSON.stringify(data);
  const urls = [...new Set(json.match(/fnasset:\/\/local\/[^"\\)\s]+/g) || [])];
  let out = json;
  for (const u of urls) {
    const data = await assetToPortable(u);
    out = out.split(u).join(data);
  }
  return JSON.parse(out);
}

export async function exportWorkspaceJson(rootId?: ID) {
  const s = useApp.getState();
  let data: WorkspaceData;
  if (rootId) {
    const ids = new Set([rootId, ...descendants(s.pages, rootId)]);
    data = {
      meta: { ...s.meta, rootOrder: [rootId], favorites: [], recent: [] },
      pages: Object.values(s.pages)
        .filter((p) => ids.has(p.id))
        .map((p) => (p.id === rootId ? { ...p, parentId: null, isRow: false } : p)),
    };
  } else {
    data = { meta: s.meta, pages: Object.values(s.pages) };
  }
  const stamp = new Date().toISOString().slice(0, 10);
  const name = rootId ? `${safeName(pageTitle(s.pages[rootId]))}.json` : `Fernando-Notion-backup-${stamp}.json`;
  const saved = await saveTextFile(name, JSON.stringify(await portable(data)), [{ name: "JSON", extensions: ["json"] }]);
  if (saved) toast("Export complete");
}

export async function importJsonFiles() {
  const files = await pickTextFiles(".json", true);
  let total = 0;
  for (const f of files) {
    try {
      const data = JSON.parse(f.content) as WorkspaceData;
      if (!Array.isArray(data.pages)) throw new Error("Not a Fernando Notion export");
      total += mergeWorkspace(data);
    } catch (err: any) {
      toast(`Could not import ${f.name}: ${err.message}`);
    }
  }
  if (total) toast(`Imported ${total} page${total === 1 ? "" : "s"}`);
}

let parser: BlockNoteEditor<any, any, any> | null = null;
async function markdownToBlocks(md: string): Promise<any[]> {
  if (!parser) {
    const { schema } = await import("../components/editor/schema");
    parser = BlockNoteEditor.create({ schema } as any) as any;
  }
  return parser!.tryParseMarkdownToBlocks(md) as any[];
}

export async function importMarkdownFiles(parentId: ID | null = null): Promise<ID | null> {
  const files = await pickTextFiles(".md,.markdown,.txt", true);
  let last: ID | null = null;
  for (const f of files) {
    let md = f.content;
    let title = f.name.replace(/\.(md|markdown|txt)$/i, "");
    const m = md.match(/^#\s+(.+)\n/);
    if (m) {
      title = m[1].trim();
      md = md.slice(m[0].length);
    }
    const blocks = await markdownToBlocks(md);
    last = createPage({ parentId, title, content: blocks });
  }
  if (files.length) toast(`Imported ${files.length} file${files.length === 1 ? "" : "s"}`);
  return last;
}

export async function appendMarkdownToPage(id: ID) {
  const files = await pickTextFiles(".md,.markdown,.txt", false);
  if (!files.length) return;
  const blocks = await markdownToBlocks(files[0].content);
  const page = useApp.getState().pages[id];
  if (!page) return;
  replaceContent(id, [...page.content, ...blocks]);
  toast("Markdown imported into this page");
}
