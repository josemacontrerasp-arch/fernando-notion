import { formatDistanceToNow } from "date-fns";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CloudAlert,
  Copy,
  Ellipsis,
  FileDown,
  FileUp,
  Lock,
  LockOpen,
  Menu as MenuIcon,
  MoveRight,
  Printer,
  Star,
  Trash,
  LoaderCircle,
} from "lucide-react";
import { useMemo, useState } from "react";
import { appendMarkdownToPage, exportPageMarkdown, exportPagePdf, exportWorkspaceJson } from "../lib/export";
import { flushEditors } from "../lib/persist";
import {
  ancestors,
  descendants,
  duplicatePage,
  goBack,
  goForward,
  movePage,
  openPage,
  toggleFavorite,
  trashPage,
  updatePage,
  updateSettings,
  useApp,
} from "../lib/store";
import type { ID } from "../lib/types";
import { cx, pageTitle, wordCount } from "../lib/utils";
import { KEYS } from "../lib/platform";
import { PagePicker } from "./PagePicker";
import { PageIcon } from "./Sidebar";
import { Menu, MenuItem, MenuSep, Popover, Toggle, usePopover } from "./ui";

export function SaveIndicator() {
  const status = useApp((s) => s.saveStatus);
  if (status === "error")
    return (
      <span className="save-ind error" title="Could not save. Retrying…">
        <CloudAlert size={14} /> Not saved — retrying
      </span>
    );
  if (status === "saving")
    return (
      <span className="save-ind saving">
        <LoaderCircle size={13} className="spin" /> Saving…
      </span>
    );
  return (
    <span className="save-ind saved" title="All changes are saved on this computer">
      <Check size={14} /> Saved
    </span>
  );
}

export function PageMenu({ pageId, anchor, onClose }: { pageId: ID; anchor: HTMLElement; onClose: () => void }) {
  const page = useApp((s) => s.pages[pageId]);
  const fav = useApp((s) => s.meta.favorites.includes(pageId));
  const [moving, setMoving] = useState(false);
  if (!page) return null;
  const font = page.font || "default";
  const isRow = !!page.isRow;
  return (
    <>
      {!moving && (
        <Popover anchor={anchor} onClose={onClose} placement="bottom-end">
          <Menu width={270}>
            <div className="font-picker">
              {(["default", "serif", "mono"] as const).map((f) => (
                <button
                  key={f}
                  type="button"
                  className={cx("font-opt", font === f && "active", `font-${f}`)}
                  onClick={() => updatePage(pageId, { font: f }, false)}
                >
                  <span className="font-sample">Ag</span>
                  <span className="font-name">{f === "default" ? "Default" : f === "serif" ? "Serif" : "Mono"}</span>
                </button>
              ))}
            </div>
            <MenuSep />
            <div className="menu-toggle-row">
              <span>Small text</span>
              <Toggle checked={!!page.smallText} onChange={(v) => updatePage(pageId, { smallText: v }, false)} />
            </div>
            <div className="menu-toggle-row">
              <span>Full width</span>
              <Toggle checked={!!page.fullWidth} onChange={(v) => updatePage(pageId, { fullWidth: v }, false)} />
            </div>
            <div className="menu-toggle-row">
              <span>{page.locked ? <Lock size={14} /> : <LockOpen size={14} />} Lock page</span>
              <Toggle checked={!!page.locked} onChange={(v) => updatePage(pageId, { locked: v }, false)} />
            </div>
            <MenuSep />
            <MenuItem
              icon={<Star size={16} />}
              label={fav ? "Remove from Favorites" : "Add to Favorites"}
              onClick={() => {
                toggleFavorite(pageId);
                onClose();
              }}
            />
            <MenuItem
              icon={<Copy size={16} />}
              label="Duplicate"
              onClick={() => {
                flushEditors();
                const id = duplicatePage(pageId);
                onClose();
                if (id && !isRow) openPage(id);
              }}
            />
            {!isRow && <MenuItem icon={<MoveRight size={16} />} label="Move to…" onClick={() => setMoving(true)} />}
            <MenuSep />
            <MenuItem
              icon={<FileDown size={16} />}
              label="Export as Markdown"
              onClick={() => {
                flushEditors();
                onClose();
                void exportPageMarkdown(pageId);
              }}
            />
            <MenuItem
              icon={<Printer size={16} />}
              label="Export as PDF"
              onClick={() => {
                flushEditors();
                onClose();
                setTimeout(() => void exportPagePdf(pageId), 150);
              }}
            />
            <MenuItem
              icon={<FileDown size={16} />}
              label="Export page + sub-pages (JSON)"
              onClick={() => {
                flushEditors();
                onClose();
                void exportWorkspaceJson(pageId);
              }}
            />
            {page.type === "page" && (
              <MenuItem
                icon={<FileUp size={16} />}
                label="Import Markdown into page"
                onClick={() => {
                  flushEditors();
                  onClose();
                  void appendMarkdownToPage(pageId);
                }}
              />
            )}
            <MenuSep />
            <MenuItem
              icon={<Trash size={16} />}
              label="Move to Trash"
              danger
              onClick={() => {
                onClose();
                trashPage(pageId);
              }}
            />
            <div className="menu-hint">
              {page.type === "page" && <>Word count: {wordCount(page.content)}<br /></>}
              Last edited {formatDistanceToNow(page.updatedAt, { addSuffix: true })}
              <br />
              Created {new Date(page.createdAt).toLocaleDateString()}
            </div>
          </Menu>
        </Popover>
      )}
      {moving && (
        <PagePicker
          title="Move page to"
          placeholder="Move page to…"
          extra={{ label: "Top level (Pages)", value: null }}
          filter={(p) => {
            const s = useApp.getState();
            return p.id !== pageId && p.type === "page" && !p.isRow && !descendants(s.pages, pageId).includes(p.id);
          }}
          onClose={() => {
            setMoving(false);
            onClose();
          }}
          onPick={(target) => {
            movePage(pageId, target);
            setMoving(false);
            onClose();
          }}
        />
      )}
    </>
  );
}

function Breadcrumbs({ pageId }: { pageId: ID }) {
  const pages = useApp((s) => s.pages);
  const crumbs = useMemo(() => {
    const p = pages[pageId];
    if (!p) return [];
    return [...ancestors(pages, pageId), p];
  }, [pages, pageId]);
  const shown = crumbs.length > 4 ? [crumbs[0], null, ...crumbs.slice(-2)] : crumbs;
  return (
    <div className="crumbs">
      {shown.map((c, i) => (
        <span key={c ? c.id : `gap-${i}`} className="crumb-wrap">
          {i > 0 && <span className="crumb-sep">/</span>}
          {c ? (
            <button type="button" className="crumb" onClick={() => openPage(c.id)}>
              <PageIcon icon={c.icon} type={c.type} size={15} />
              <span>{pageTitle(c)}</span>
            </button>
          ) : (
            <span className="crumb muted">…</span>
          )}
        </span>
      ))}
    </div>
  );
}

const ROUTE_TITLES: Record<string, string> = {
  home: "Home",
  calendar: "Calendar",
  trash: "Trash",
  templates: "Templates",
  settings: "Settings",
};

export function TopBar() {
  const route = useApp((s) => s.route);
  const collapsed = useApp((s) => s.meta.settings.sidebarCollapsed);
  const canBack = useApp((s) => s.backStack.length > 0);
  const canFwd = useApp((s) => s.fwdStack.length > 0);
  const pageId = route.kind === "page" ? route.id : null;
  const fav = useApp((s) => (pageId ? s.meta.favorites.includes(pageId) : false));
  const menu = usePopover();
  return (
    <header className="topbar">
      {collapsed && (
        <button type="button" className="icon-btn" title={`Open sidebar (${KEYS.sidebar})`} onClick={() => updateSettings({ sidebarCollapsed: false })}>
          <MenuIcon size={18} />
        </button>
      )}
      <button type="button" className="icon-btn" disabled={!canBack} title={`Back (${KEYS.back})`} onClick={goBack}>
        <ArrowLeft size={17} />
      </button>
      <button type="button" className="icon-btn" disabled={!canFwd} title={`Forward (${KEYS.forward})`} onClick={goForward}>
        <ArrowRight size={17} />
      </button>
      {pageId ? <Breadcrumbs pageId={pageId} /> : <div className="crumbs"><span className="crumb static">{ROUTE_TITLES[route.kind]}</span></div>}
      <span style={{ flex: 1 }} />
      <SaveIndicator />
      {pageId && (
        <>
          <button type="button" className={cx("icon-btn", fav && "fav-on")} title={fav ? "Remove from Favorites" : "Add to Favorites"} onClick={() => toggleFavorite(pageId)}>
            <Star size={17} fill={fav ? "currentColor" : "none"} />
          </button>
          <button type="button" className="icon-btn" title="Style, export, and more…" onClick={(e) => menu.toggle(e.currentTarget)}>
            <Ellipsis size={18} />
          </button>
          {menu.anchor && <PageMenu pageId={pageId} anchor={menu.anchor as HTMLElement} onClose={menu.close} />}
        </>
      )}
    </header>
  );
}
