import "@blocknote/mantine/style.css";
import { filterSuggestionItems, insertOrUpdateBlockForSlashMenu } from "@blocknote/core";
import { syntaxHighlighter } from "@blocknote/code-block";
import { BlockNoteView } from "@blocknote/mantine";
import {
  getDefaultReactSlashMenuItems,
  SuggestionMenuController,
  useCreateBlockNote,
  type DefaultReactSuggestionItem,
} from "@blocknote/react";
import { addDays, format, isValid, parse } from "date-fns";
import {
  CalendarClock,
  CalendarDays,
  ChartGantt,
  FilePlus,
  FileSymlink,
  LayoutGrid,
  LayoutList,
  Link2,
  MessageSquareText,
  SquareKanban,
  Table,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { registerFlusher } from "../../lib/persist";
import { saveAsset } from "../../lib/storage";
import { createDatabase, createPage, isAlive, openPage, setContent, useApp } from "../../lib/store";
import type { ID, ViewType } from "../../lib/types";
import { normalize, pageTitle } from "../../lib/utils";
import { PagePicker } from "../PagePicker";
import { PageIcon } from "../Sidebar";
import { useResolvedTheme } from "../ui";
import { schema, type AppEditor } from "./schema";

const GROUP_ORDER = ["Headings", "Basic blocks", "Database", "Advanced", "Media", "Inline", "Others"];

const VIEW_ITEMS: { type: ViewType; label: string; icon: React.JSX.Element }[] = [
  { type: "table", label: "Table view", icon: <Table size={18} /> },
  { type: "board", label: "Board view", icon: <SquareKanban size={18} /> },
  { type: "calendar", label: "Calendar view", icon: <CalendarDays size={18} /> },
  { type: "timeline", label: "Timeline view", icon: <ChartGantt size={18} /> },
  { type: "list", label: "List view", icon: <LayoutList size={18} /> },
  { type: "gallery", label: "Gallery view", icon: <LayoutGrid size={18} /> },
];

function parseLooseDate(q: string): Date | null {
  const s = q.trim();
  if (!s) return null;
  const formats = ["yyyy-MM-dd", "MMM d", "MMMM d", "d MMM", "d MMMM", "MMM d yyyy", "MMMM d yyyy", "d/M/yyyy", "M/d/yyyy", "d/M"];
  for (const f of formats) {
    const d = parse(s, f, new Date());
    if (isValid(d) && d.getFullYear() > 1900) return d;
  }
  return null;
}

export default function Editor({
  pageId,
  editable,
  onEditor,
}: {
  pageId: ID;
  editable: boolean;
  onEditor?: (e: AppEditor | null) => void;
}) {
  const theme = useResolvedTheme();
  const initialContent = useMemo(() => {
    const c = useApp.getState().pages[pageId]?.content;
    return c && c.length ? c : undefined;
  }, [pageId]);

  const editor = useCreateBlockNote(
    {
      schema,
      initialContent: initialContent as any,
      uploadFile: (file: File) => saveAsset(file),
      extensions: [syntaxHighlighter],
      tables: { splitCells: true, cellBackgroundColor: true, cellTextColor: true, headers: true },
      placeholders: {
        emptyDocument: "Start writing, or press “/” for commands…",
        default: "Type “/” for commands, “@” to mention",
        checkListItem: "To-do",
        bulletListItem: "List",
        numberedListItem: "List",
        toggleListItem: "Toggle",
      },
    },
    [pageId],
  ) as unknown as AppEditor;

  useEffect(() => {
    onEditor?.(editor);
    if (import.meta.env.DEV) (window as any).__editor = editor;
    return () => onEditor?.(null);
  }, [editor, onEditor]);

  // ---- debounced write-back of the document into the store ----
  const dirty = useRef(false);
  const timer = useRef<number | undefined>(undefined);
  const flush = useCallback(() => {
    if (!dirty.current) return;
    dirty.current = false;
    window.clearTimeout(timer.current);
    if (useApp.getState().pages[pageId]) setContent(pageId, editor.document as any[]);
  }, [editor, pageId]);

  useEffect(() => {
    const unregister = registerFlusher(flush);
    return () => {
      unregister();
      flush();
    };
  }, [flush]);

  const onChange = () => {
    dirty.current = true;
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(flush, 300);
  };

  // ---- pickers opened from the slash menu ----
  const [picker, setPicker] = useState<null | "link" | "database">(null);

  const insertBlock = useCallback(
    (block: any) => {
      insertOrUpdateBlockForSlashMenu(editor as any, block);
    },
    [editor],
  );

  const getSlashItems = useCallback(
    async (query: string) => {
      const defaults = getDefaultReactSlashMenuItems(editor as any);
      const custom: DefaultReactSuggestionItem[] = [
        {
          title: "Page",
          subtext: "Create a sub-page inside this page",
          aliases: ["page", "subpage", "new page", "doc"],
          group: "Basic blocks",
          icon: <FilePlus size={18} />,
          onItemClick: () => {
            const id = createPage({ parentId: pageId });
            insertBlock({ type: "pageLink", props: { pageId: id } });
            flush();
            openPage(id);
            useApp.setState({ focusTitle: id });
          },
        },
        {
          title: "Link to page",
          subtext: "Link to an existing page",
          aliases: ["link", "page link", "reference"],
          group: "Basic blocks",
          icon: <FileSymlink size={18} />,
          onItemClick: () => setPicker("link"),
        },
        {
          title: "Callout",
          subtext: "Make writing stand out",
          aliases: ["callout", "note", "tip", "info", "warning"],
          group: "Basic blocks",
          icon: <MessageSquareText size={18} />,
          onItemClick: () => insertBlock({ type: "callout" }),
        },
        ...VIEW_ITEMS.map(
          (v): DefaultReactSuggestionItem => ({
            title: v.label,
            subtext: `Add an inline ${v.label.replace(" view", "").toLowerCase()} database`,
            aliases: [v.type, "database", "db", "inline", v.label.toLowerCase()],
            group: "Database",
            icon: v.icon,
            onItemClick: () => {
              const dbId = createDatabase({ parentId: pageId, inline: true, viewType: v.type, title: "" });
              insertBlock({ type: "database", props: { dbId } });
            },
          }),
        ),
        {
          title: "Linked view of database",
          subtext: "Show an existing database on this page",
          aliases: ["linked", "database", "embed database"],
          group: "Database",
          icon: <Link2 size={18} />,
          onItemClick: () => setPicker("database"),
        },
        {
          title: "Date or reminder",
          subtext: "Insert today's date (click it to change)",
          aliases: ["date", "today", "reminder", "now"],
          group: "Inline",
          icon: <CalendarClock size={18} />,
          onItemClick: () => {
            editor.insertInlineContent([{ type: "dateMention", props: { date: format(new Date(), "yyyy-MM-dd") } } as any, " "]);
          },
        },
      ];
      const all = [...defaults, ...custom];
      const groups = [...new Set(all.map((i) => i.group || "Others"))].sort(
        (a, b) => (GROUP_ORDER.indexOf(a) + 1 || 99) - (GROUP_ORDER.indexOf(b) + 1 || 99),
      );
      const ordered = groups.flatMap((g) => all.filter((i) => (i.group || "Others") === g));
      return filterSuggestionItems(ordered, query);
    },
    [editor, pageId, insertBlock, flush],
  );

  const getMentionItems = useCallback(
    async (query: string): Promise<DefaultReactSuggestionItem[]> => {
      const s = useApp.getState();
      const nq = normalize(query.trim());
      const insertDate = (d: Date) =>
        editor.insertInlineContent([{ type: "dateMention", props: { date: format(d, "yyyy-MM-dd") } } as any, " "]);
      const dateItems: DefaultReactSuggestionItem[] = [
        { title: "Today", d: new Date() },
        { title: "Tomorrow", d: addDays(new Date(), 1) },
        { title: "Yesterday", d: addDays(new Date(), -1) },
        { title: "Next week", d: addDays(new Date(), 7) },
      ]
        .filter((x) => !nq || normalize(x.title).startsWith(nq))
        .map((x) => ({
          title: x.title,
          subtext: format(x.d, "EEEE, MMM d"),
          group: "Date",
          icon: <CalendarClock size={16} />,
          onItemClick: () => insertDate(x.d),
        }));
      const parsed = parseLooseDate(query);
      if (parsed) {
        dateItems.unshift({
          title: format(parsed, "MMMM d, yyyy"),
          group: "Date",
          icon: <CalendarClock size={16} />,
          onItemClick: () => insertDate(parsed),
        });
      }
      const rank = new Map(s.meta.recent.map((id, i) => [id, i]));
      const pages = Object.values(s.pages)
        .filter((p) => p.id !== pageId && isAlive(s.pages, p.id))
        .filter((p) => !nq || normalize(pageTitle(p)).includes(nq))
        .sort((a, b) => (rank.get(a.id) ?? 999) - (rank.get(b.id) ?? 999))
        .slice(0, 8);
      const pageItems: DefaultReactSuggestionItem[] = pages.map((p) => ({
        title: pageTitle(p),
        group: "Mention a page",
        icon: <PageIcon icon={p.icon} type={p.type} size={16} />,
        onItemClick: () => editor.insertInlineContent([{ type: "mention", props: { pageId: p.id } } as any, " "]),
      }));
      if (query.trim()) {
        pageItems.push({
          title: `New page “${query.trim()}”`,
          subtext: "Create a sub-page and mention it",
          group: "Mention a page",
          icon: <FilePlus size={16} />,
          onItemClick: () => {
            const id = createPage({ parentId: pageId, title: query.trim() });
            editor.insertInlineContent([{ type: "mention", props: { pageId: id } } as any, " "]);
          },
        });
      }
      return [...pageItems, ...dateItems];
    },
    [editor, pageId],
  );

  return (
    <>
      <BlockNoteView
        editor={editor as any}
        theme={theme}
        editable={editable}
        onChange={onChange}
        slashMenu={false}
        className="page-editor"
      >
        <SuggestionMenuController triggerCharacter="/" getItems={getSlashItems} />
        <SuggestionMenuController triggerCharacter="@" getItems={getMentionItems} />
      </BlockNoteView>
      {picker === "link" && (
        <PagePicker
          onClose={() => setPicker(null)}
          filter={(p) => p.id !== pageId}
          onPick={(id) => {
            setPicker(null);
            if (id) insertBlock({ type: "pageLink", props: { pageId: id } });
          }}
        />
      )}
      {picker === "database" && (
        <PagePicker
          title="Choose a database"
          placeholder="Search databases…"
          onClose={() => setPicker(null)}
          filter={(p) => p.type === "database"}
          onPick={(id) => {
            setPicker(null);
            if (id) insertBlock({ type: "database", props: { dbId: id } });
          }}
        />
      )}
    </>
  );
}
