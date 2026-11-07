import { format, isValid, parseISO } from "date-fns";
import type { Color, DateValue, Page } from "./types";

export const uid = (): string =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID().replace(/-/g, "").slice(0, 16)
    : Math.random().toString(36).slice(2, 10) + Date.now().toString(36);

export const cx = (...xs: (string | false | null | undefined)[]) => xs.filter(Boolean).join(" ");

export const clamp = (n: number, a: number, b: number) => Math.max(a, Math.min(b, n));

export function pageTitle(p: Pick<Page, "title"> | undefined | null): string {
  return p?.title?.trim() || "Untitled";
}

export function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

// --------------------------------------------------------------- dates ----

export const toDateKey = (d: Date) => format(d, "yyyy-MM-dd");
export const toDateTimeKey = (d: Date) => format(d, "yyyy-MM-dd'T'HH:mm");

export function parseDateStr(s: string | null | undefined): Date | null {
  if (!s) return null;
  const d = parseISO(s);
  return isValid(d) ? d : null;
}

export function hasTime(s: string | null | undefined) {
  return !!s && s.includes("T");
}

export function formatDateStr(s: string | null | undefined, withTime = hasTime(s)): string {
  const d = parseDateStr(s);
  if (!d) return "";
  const sameYear = d.getFullYear() === new Date().getFullYear();
  const day = format(d, sameYear ? "MMM d" : "MMM d, yyyy");
  return withTime && hasTime(s) ? `${day} ${format(d, "h:mm a")}` : day;
}

export function formatDateValue(v: DateValue | null | undefined): string {
  if (!v || !v.start) return "";
  const a = formatDateStr(v.start);
  if (!v.end) return a;
  return `${a} → ${formatDateStr(v.end)}`;
}

export function isDateValue(v: unknown): v is DateValue {
  return !!v && typeof v === "object" && "start" in (v as any);
}

// -------------------------------------------------------------- colors ----

export const COLOR_LABEL: Record<Color, string> = {
  default: "Default",
  gray: "Gray",
  brown: "Brown",
  orange: "Orange",
  yellow: "Yellow",
  green: "Green",
  blue: "Blue",
  purple: "Purple",
  pink: "Pink",
  red: "Red",
};

/** Solid colours used for calendar events and timeline bars. */
export const SOLID: Record<Color, string> = {
  default: "#8a8a85",
  gray: "#9b9a97",
  brown: "#a27763",
  orange: "#d9730d",
  yellow: "#cb912f",
  green: "#448361",
  blue: "#337ea9",
  purple: "#9065b0",
  pink: "#c14c8a",
  red: "#d44c47",
};

export function colorForString(s: string): Color {
  const palette: Color[] = ["blue", "green", "purple", "orange", "pink", "red", "yellow", "brown"];
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return palette[h % palette.length];
}

// ------------------------------------------------------------ blocks text ----

function inlineText(content: any): string {
  if (!content) return "";
  if (typeof content === "string") return content;
  if (Array.isArray(content)) return content.map(inlineText).join("");
  if (content.type === "text") return content.text || "";
  if (content.type === "link") return inlineText(content.content);
  if (content.type === "tableContent") {
    return (content.rows || [])
      .map((r: any) => (r.cells || []).map((c: any) => inlineText(c?.content ?? c)).join(" "))
      .join(" ");
  }
  if (content.type === "dateMention") return content.props?.date || "";
  return "";
}

export function blocksToText(blocks: any[] | undefined, sep = "\n"): string {
  if (!blocks) return "";
  const out: string[] = [];
  const walk = (bs: any[]) => {
    for (const b of bs) {
      const t = inlineText(b.content);
      if (t) out.push(t);
      if (b.props?.caption) out.push(b.props.caption);
      if (b.children?.length) walk(b.children);
    }
  };
  walk(blocks);
  return out.join(sep);
}

export function wordCount(blocks: any[] | undefined): number {
  const t = blocksToText(blocks, " ").trim();
  return t ? t.split(/\s+/).length : 0;
}

export function firstImage(blocks: any[] | undefined): string | null {
  if (!blocks) return null;
  for (const b of blocks) {
    if (b.type === "image" && b.props?.url) return b.props.url;
    const c = firstImage(b.children);
    if (c) return c;
  }
  return null;
}

/** Plain paragraph block helper used by templates. */
export const p = (text = "", styles: Record<string, any> = {}) => ({
  type: "paragraph",
  content: text ? [{ type: "text", text, styles }] : [],
});
export const h = (level: 1 | 2 | 3, text: string) => ({
  type: "heading",
  props: { level },
  content: [{ type: "text", text, styles: {} }],
});
export const todo = (text: string, checked = false) => ({
  type: "checkListItem",
  props: { checked },
  content: [{ type: "text", text, styles: {} }],
});
export const bullet = (text: string) => ({
  type: "bulletListItem",
  content: [{ type: "text", text, styles: {} }],
});
export const numbered = (text: string) => ({
  type: "numberedListItem",
  content: [{ type: "text", text, styles: {} }],
});
export const callout = (emoji: string, text: string, backgroundColor = "default") => ({
  type: "callout",
  props: { emoji, backgroundColor },
  content: [{ type: "text", text, styles: {} }],
});
export const quote = (text: string) => ({ type: "quote", content: [{ type: "text", text, styles: {} }] });
export const divider = () => ({ type: "divider" });
export const toggle = (text: string, children: any[]) => ({
  type: "toggleListItem",
  content: [{ type: "text", text, styles: {} }],
  children,
});
export const rich = (parts: (string | { text: string; bold?: boolean; italic?: boolean; code?: boolean })[]) => ({
  type: "paragraph",
  content: parts.map((x) =>
    typeof x === "string"
      ? { type: "text", text: x, styles: {} }
      : {
          type: "text",
          text: x.text,
          styles: { ...(x.bold ? { bold: true } : {}), ...(x.italic ? { italic: true } : {}), ...(x.code ? { code: true } : {}) },
        },
  ),
});
