import {
  CalendarDays,
  ChevronDown,
  ChevronRight,
  ChevronsLeft,
  Copy,
  Ellipsis,
  FileText,
  House,
  LayoutGrid,
  Pencil,
  Plus,
  Search,
  Settings as SettingsIcon,
  Star,
  Table,
  Trash,
  ExternalLink,
} from "lucide-react";
import React, { useRef, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import {
  duplicatePage,
  movePage,
  navigate,
  newPageAndOpen,
  openPage,
  openPeek,
  setQuickFind,
  setTitle,
  toggleFavorite,
  trashPage,
  updateSettings,
  useApp,
} from "../lib/store";
import { setExpanded, toggleSection, useUi } from "../lib/ui-store";
import type { ID, Route } from "../lib/types";
import { cx, pageTitle } from "../lib/utils";
import { InlineInput, Menu, MenuItem, MenuSep, Popover, usePopover } from "./ui";

export function PageIcon({ icon, type, size = 18 }: { icon?: string | null; type?: string; size?: number }) {
  if (icon) {
    if (icon.startsWith("data:") || icon.startsWith("http") || icon.startsWith("fnasset:"))
      return <img className="page-icon-img" src={icon} style={{ width: size, height: size }} alt="" />;
    return (
      <span className="page-emoji" style={{ fontSize: size * 0.9, width: size, height: size }}>
        {icon}
      </span>
    );
  }
  const Icon = type === "database" ? Table : FileText;
  return <Icon size={size * 0.92} className="page-icon-default" strokeWidth={1.8} />;
}

let dragId: ID | null = null;

function TreeItem({ id, depth }: { id: ID; depth: number }) {
  const info = useApp(
    useShallow((s) => {
      const p = s.pages[id];
      if (!p) return null;
      return {
        title: p.title,
        icon: p.icon,
        type: p.type,
        trashed: p.trashed,
        parentId: p.parentId,
        children: p.children,
        active: s.route.kind === "page" && s.route.id === id,
        fav: s.meta.favorites.includes(id),
      };
    }),
  );
  const visibleChildren = useApp(
    useShallow((s) => (s.pages[id]?.children || []).filter((c) => s.pages[c] && !s.pages[c].trashed)),
  );
  const expanded = useUi((s) => !!s.expanded[id]);
  const [renaming, setRenaming] = useState(false);
  const [drop, setDrop] = useState<"before" | "after" | "inside" | null>(null);
  const menu = usePopover();
  const rowRef = useRef<HTMLDivElement>(null);
  if (!info || info.trashed) return null;
  const hasChildren = visibleChildren.length > 0;

  const onDragOver = (e: React.DragEvent) => {
    if (!dragId || dragId === id) return;
    e.preventDefault();
    const rect = rowRef.current!.getBoundingClientRect();
    const y = e.clientY - rect.top;
    const zone = rect.height / 4;
    if (y < zone) setDrop("before");
    else if (y > rect.height - zone) setDrop("after");
    else setDrop(info.type === "database" ? "after" : "inside");
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const pos = drop;
    setDrop(null);
    const src = dragId;
    dragId = null;
    if (!src || src === id || !pos) return;
    const s = useApp.getState();
    if (pos === "inside") {
      movePage(src, id);
      setExpanded(id, true);
    } else {
      const parentId = info.parentId;
      const siblings = (parentId ? s.pages[parentId]?.children : s.meta.rootOrder) || [];
      const list = siblings.filter((x) => x !== src);
      const idx = list.indexOf(id) + (pos === "after" ? 1 : 0);
      movePage(src, parentId, idx);
    }
  };

  return (
    <div className="tree-node">
      <div
        ref={rowRef}
        className={cx("tree-row", info.active && "active", drop && `drop-${drop}`)}
        style={{ paddingLeft: 8 + depth * 14 }}
        draggable={!renaming}
        onDragStart={(e) => {
          dragId = id;
          e.dataTransfer.effectAllowed = "move";
          e.dataTransfer.setData("text/plain", pageTitle(info));
        }}
        onDragEnd={() => {
          dragId = null;
          setDrop(null);
        }}
        onDragOver={onDragOver}
        onDragLeave={() => setDrop(null)}
        onDrop={onDrop}
        onClick={() => openPage(id)}
        onContextMenu={(e) => {
          e.preventDefault();
          menu.open(rowRef.current);
        }}
      >
        <button
          type="button"
          className={cx("tree-toggle", !hasChildren && "empty", info.type === "database" && !hasChildren && "hidden")}
          onClick={(e) => {
            e.stopPropagation();
            setExpanded(id, !expanded);
          }}
          title={expanded ? "Collapse" : "Expand"}
        >
          {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </button>
        <span className="tree-icon">
          <PageIcon icon={info.icon} type={info.type} size={18} />
        </span>
        {renaming ? (
          <InlineInput
            value={info.title}
            selectAll
            onCommit={(v) => {
              setTitle(id, v);
              setRenaming(false);
            }}
          />
        ) : (
          <span className="tree-title">{pageTitle(info)}</span>
        )}
        <span className="tree-actions" onClick={(e) => e.stopPropagation()}>
          <button type="button" className="icon-btn sm" title="Delete, duplicate, and more…" onClick={(e) => menu.toggle(e.currentTarget)}>
            <Ellipsis size={15} />
          </button>
          {info.type !== "database" && (
            <button
              type="button"
              className="icon-btn sm"
              title="Add a page inside"
              onClick={() => {
                setExpanded(id, true);
                newPageAndOpen(id);
              }}
            >
              <Plus size={15} />
            </button>
          )}
        </span>
      </div>
      {menu.anchor && (
        <Popover anchor={menu.anchor} onClose={menu.close} placement="right-start">
          <Menu width={230}>
            <MenuItem
              icon={<Star size={16} />}
              label={info.fav ? "Remove from Favorites" : "Add to Favorites"}
              onClick={() => {
                toggleFavorite(id);
                menu.close();
              }}
            />
            <MenuItem
              icon={<Pencil size={16} />}
              label="Rename"
              onClick={() => {
                menu.close();
                setRenaming(true);
              }}
            />
            <MenuItem
              icon={<Copy size={16} />}
              label="Duplicate"
              onClick={() => {
                menu.close();
                const nid = duplicatePage(id);
                if (nid) openPage(nid);
              }}
            />
            <MenuItem
              icon={<ExternalLink size={16} />}
              label="Open in side peek"
              onClick={() => {
                menu.close();
                openPeek(id);
              }}
            />
            <MenuSep />
            <MenuItem
              icon={<Trash size={16} />}
              label="Move to Trash"
              danger
              onClick={() => {
                menu.close();
                trashPage(id);
              }}
            />
          </Menu>
        </Popover>
      )}
      {expanded && (
        <div className="tree-children">
          {hasChildren ? (
            visibleChildren.map((c) => <TreeItem key={c} id={c} depth={depth + 1} />)
          ) : (
            <div className="tree-empty" style={{ paddingLeft: 30 + depth * 14 }}>
              {info.type === "database" ? "Open to see rows" : "No pages inside"}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function NavItem({
  icon,
  label,
  route,
  onClick,
  shortcut,
}: {
  icon: React.ReactNode;
  label: string;
  route?: Route;
  onClick?: () => void;
  shortcut?: string;
}) {
  const active = useApp((s) => !!route && s.route.kind === route.kind && route.kind !== "page");
  return (
    <div className={cx("nav-item", active && "active")} onClick={onClick || (() => route && navigate(route))}>
      <span className="nav-icon">{icon}</span>
      <span className="nav-label">{label}</span>
      {shortcut && <span className="nav-shortcut">{shortcut}</span>}
    </div>
  );
}

export function Sidebar() {
  const settings = useApp((s) => s.meta.settings);
  const roots = useApp(
    useShallow((s) => s.meta.rootOrder.filter((id) => s.pages[id] && !s.pages[id].trashed)),
  );
  const favorites = useApp(
    useShallow((s) => s.meta.favorites.filter((id) => s.pages[id] && !s.pages[id].trashed)),
  );
  const trashCount = useApp((s) => Object.values(s.pages).filter((p) => p.trashed).length);
  const sections = useUi((s) => s.sections);
  const [rootDrop, setRootDrop] = useState(false);
  const resizing = useRef(false);

  const startResize = (e: React.MouseEvent) => {
    e.preventDefault();
    resizing.current = true;
    const startX = e.clientX;
    const startW = settings.sidebarWidth;
    let w = startW;
    const el = document.querySelector<HTMLElement>(".sidebar");
    const move = (ev: MouseEvent) => {
      w = Math.max(200, Math.min(480, startW + ev.clientX - startX));
      if (el) el.style.width = `${w}px`;
    };
    const up = () => {
      resizing.current = false;
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
      updateSettings({ sidebarWidth: w });
    };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
  };

  if (settings.sidebarCollapsed) return null;
  const initial = (settings.workspaceName || "F").trim().charAt(0).toUpperCase();

  return (
    <aside className="sidebar" style={{ width: settings.sidebarWidth }}>
      <div className="sidebar-head">
        <div className="ws-switch" onClick={() => navigate({ kind: "settings" })} title="Workspace settings">
          <span className="ws-avatar">{initial}</span>
          <span className="ws-name">{settings.workspaceName}</span>
        </div>
        <button
          type="button"
          className="icon-btn"
          title="Close sidebar (Ctrl+\)"
          onClick={() => updateSettings({ sidebarCollapsed: true })}
        >
          <ChevronsLeft size={18} />
        </button>
      </div>

      <div className="sidebar-nav">
        <NavItem icon={<Search size={17} />} label="Search" shortcut="Ctrl+K" onClick={() => setQuickFind(true)} />
        <NavItem icon={<House size={17} />} label="Home" route={{ kind: "home" }} />
        <NavItem icon={<CalendarDays size={17} />} label="Calendar" route={{ kind: "calendar" }} />
        <NavItem icon={<LayoutGrid size={17} />} label="Templates" route={{ kind: "templates" }} />
        <NavItem icon={<SettingsIcon size={17} />} label="Settings" route={{ kind: "settings" }} />
      </div>

      <div className="sidebar-scroll">
        {favorites.length > 0 && (
          <div className="sidebar-section">
            <div className="section-title" onClick={() => toggleSection("favorites")}>
              <span>Favorites</span>
            </div>
            {sections.favorites !== false && favorites.map((id) => <TreeItem key={`fav-${id}`} id={id} depth={0} />)}
          </div>
        )}
        <div className="sidebar-section">
          <div
            className={cx("section-title", rootDrop && "drop-inside")}
            onClick={() => toggleSection("pages")}
            onDragOver={(e) => {
              if (dragId) {
                e.preventDefault();
                setRootDrop(true);
              }
            }}
            onDragLeave={() => setRootDrop(false)}
            onDrop={(e) => {
              e.preventDefault();
              setRootDrop(false);
              if (dragId) movePage(dragId, null, 0);
              dragId = null;
            }}
          >
            <span>Pages</span>
            <button
              type="button"
              className="icon-btn sm section-add"
              title="Add a page"
              onClick={(e) => {
                e.stopPropagation();
                newPageAndOpen(null);
              }}
            >
              <Plus size={15} />
            </button>
          </div>
          {sections.pages !== false && (
            <>
              {roots.map((id) => (
                <TreeItem key={id} id={id} depth={0} />
              ))}
              {roots.length === 0 && <div className="tree-empty" style={{ paddingLeft: 14 }}>No pages yet</div>}
            </>
          )}
        </div>
      </div>

      <div className="sidebar-foot">
        <NavItem icon={<Plus size={17} />} label="New page" onClick={() => newPageAndOpen(null)} />
        <NavItem
          icon={<Trash size={17} />}
          label={trashCount ? `Trash (${trashCount})` : "Trash"}
          route={{ kind: "trash" }}
        />
      </div>
      <div className="sidebar-resizer" onMouseDown={startResize} />
    </aside>
  );
}
