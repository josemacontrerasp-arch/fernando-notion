import {
  ArrowUpDown,
  CalendarDays,
  ChartGantt,
  ChevronDown,
  Copy,
  Eye,
  EyeOff,
  FileText,
  Funnel,
  LayoutGrid,
  LayoutList,
  Plus,
  Search,
  SlidersHorizontal,
  SquareKanban,
  Table,
  Trash,
  X,
} from "lucide-react";
import React, { useEffect, useRef, useState } from "react";
import { VIEW_TYPES, opNeedsValue, opsFor } from "../../lib/db";
import {
  addView,
  deleteView,
  duplicateView,
  setActiveView,
  updateView,
  useApp,
} from "../../lib/store";
import type { DatabaseSchema, DatabaseView, Filter, ID, Page, ViewType } from "../../lib/types";
import { cx, pageTitle, uid } from "../../lib/utils";
import { InlineInput, Menu, MenuItem, MenuLabel, MenuSep, Popover, usePopover } from "../ui";
import { PropIcon } from "./PropertyCell";
import { AddPropertyMenu } from "./PropertyMenu";

export function ViewIcon({ type, size = 15 }: { type: ViewType; size?: number }) {
  const p = { size, strokeWidth: 1.8 };
  switch (type) {
    case "table":
      return <Table {...p} />;
    case "board":
      return <SquareKanban {...p} />;
    case "calendar":
      return <CalendarDays {...p} />;
    case "timeline":
      return <ChartGantt {...p} />;
    case "list":
      return <LayoutList {...p} />;
    case "gallery":
      return <LayoutGrid {...p} />;
  }
}

// --------------------------------------------------------------- tabs ----

function ViewTab({ dbId, view, active, canDelete }: { dbId: ID; view: DatabaseView; active: boolean; canDelete: boolean }) {
  const menu = usePopover();
  const [renaming, setRenaming] = useState(false);
  return (
    <>
      <button
        type="button"
        className={cx("view-tab", active && "active")}
        onClick={(e) => {
          if (active) menu.toggle(e.currentTarget);
          else setActiveView(dbId, view.id);
        }}
        onContextMenu={(e) => {
          e.preventDefault();
          menu.open(e.currentTarget);
        }}
        onDoubleClick={() => setRenaming(true)}
      >
        <ViewIcon type={view.type} />
        {renaming ? (
          <InlineInput
            value={view.name}
            selectAll
            onCommit={(v) => {
              if (v.trim()) updateView(dbId, view.id, { name: v.trim() });
              setRenaming(false);
            }}
          />
        ) : (
          <span>{view.name}</span>
        )}
      </button>
      {menu.anchor && (
        <Popover anchor={menu.anchor} onClose={menu.close}>
          <Menu width={230}>
            <MenuItem
              label="Rename"
              onClick={() => {
                menu.close();
                setRenaming(true);
              }}
            />
            <MenuLabel>Layout</MenuLabel>
            {VIEW_TYPES.map((t) => (
              <MenuItem
                key={t.type}
                icon={<ViewIcon type={t.type} />}
                label={t.label}
                right={view.type === t.type ? "✓" : undefined}
                onClick={() => {
                  const schema = useApp.getState().pages[dbId]?.db;
                  const patch: Partial<DatabaseView> = { type: t.type };
                  if (schema && t.type === "board" && !view.groupBy)
                    patch.groupBy = (schema.properties.find((p) => p.type === "status") || schema.properties.find((p) => p.type === "select"))?.id ?? null;
                  if (schema && (t.type === "calendar" || t.type === "timeline") && !view.dateProperty)
                    patch.dateProperty = schema.properties.find((p) => p.type === "date")?.id ?? null;
                  updateView(dbId, view.id, patch);
                  menu.close();
                }}
              />
            ))}
            <MenuSep />
            <MenuItem
              icon={<Copy size={16} />}
              label="Duplicate view"
              onClick={() => {
                duplicateView(dbId, view.id);
                menu.close();
              }}
            />
            {canDelete && (
              <MenuItem
                icon={<Trash size={16} />}
                label="Delete view"
                danger
                onClick={() => {
                  deleteView(dbId, view.id);
                  menu.close();
                }}
              />
            )}
          </Menu>
        </Popover>
      )}
    </>
  );
}

export function ViewTabs({ dbId, views, activeId }: { dbId: ID; views: DatabaseView[]; activeId: ID }) {
  const add = usePopover();
  return (
    <div className="view-tabs">
      {views.map((v) => (
        <ViewTab key={v.id} dbId={dbId} view={v} active={v.id === activeId} canDelete={views.length > 1} />
      ))}
      <button type="button" className="icon-btn sm" title="Add a view" onClick={(e) => add.toggle(e.currentTarget)}>
        <Plus size={15} />
      </button>
      {add.anchor && (
        <Popover anchor={add.anchor} onClose={add.close}>
          <Menu width={200}>
            <MenuLabel>Add a view</MenuLabel>
            {VIEW_TYPES.map((t) => (
              <MenuItem
                key={t.type}
                icon={<ViewIcon type={t.type} />}
                label={t.label}
                onClick={() => {
                  addView(dbId, t.type);
                  add.close();
                }}
              />
            ))}
          </Menu>
        </Popover>
      )}
    </div>
  );
}

// ------------------------------------------------------------ filters ----

function FilterValue({ filter, schema, onChange }: { filter: Filter; schema: DatabaseSchema; onChange: (v: any) => void }) {
  const prop = schema.properties.find((p) => p.id === filter.propertyId);
  const pages = useApp((s) => (prop?.type === "relation" ? s.pages : null));
  if (!prop || !opNeedsValue(filter.op)) return null;
  if (prop.type === "select" || prop.type === "status" || prop.type === "multi_select") {
    return (
      <select className="fsel" value={filter.value || ""} onChange={(e) => onChange(e.target.value || undefined)}>
        <option value="">Select…</option>
        {(prop.options || []).map((o) => (
          <option key={o.id} value={o.id}>
            {o.name}
          </option>
        ))}
      </select>
    );
  }
  if (prop.type === "relation") {
    const rows = Object.values(pages || {}).filter((p) => p.parentId === prop.relationDatabaseId && p.isRow && !p.trashed);
    return (
      <select className="fsel" value={filter.value || ""} onChange={(e) => onChange(e.target.value || undefined)}>
        <option value="">Select…</option>
        {rows.map((r) => (
          <option key={r.id} value={r.id}>
            {pageTitle(r)}
          </option>
        ))}
      </select>
    );
  }
  if (prop.type === "date" || prop.type === "created_time" || prop.type === "last_edited_time") {
    return <input className="fsel" type="date" value={filter.value || ""} onChange={(e) => onChange(e.target.value)} />;
  }
  return (
    <input
      className="fsel"
      type={prop.type === "number" ? "number" : "text"}
      placeholder="Value"
      value={filter.value ?? ""}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={(e) => e.stopPropagation()}
    />
  );
}

function FilterPanel({ dbId, view, schema }: { dbId: ID; view: DatabaseView; schema: DatabaseSchema }) {
  const set = (filters: Filter[]) => updateView(dbId, view.id, { filters });
  return (
    <div className="panel" style={{ width: 520 }}>
      {view.filters.length === 0 && <div className="menu-hint">No filters. Show only the rows you need.</div>}
      {view.filters.map((f) => {
        const prop = schema.properties.find((p) => p.id === f.propertyId);
        return (
          <div className="panel-row" key={f.id}>
            <select
              className="fsel"
              value={f.propertyId}
              onChange={(e) => {
                const np = schema.properties.find((p) => p.id === e.target.value)!;
                set(view.filters.map((x) => (x.id === f.id ? { ...x, propertyId: np.id, op: opsFor(np.type)[0].op, value: undefined } : x)));
              }}
            >
              {schema.properties.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            <select
              className="fsel"
              value={f.op}
              onChange={(e) => set(view.filters.map((x) => (x.id === f.id ? { ...x, op: e.target.value as Filter["op"] } : x)))}
            >
              {opsFor(prop?.type || "text").map((o) => (
                <option key={o.op} value={o.op}>
                  {o.label}
                </option>
              ))}
            </select>
            <FilterValue
              filter={f}
              schema={schema}
              onChange={(v) => set(view.filters.map((x) => (x.id === f.id ? { ...x, value: v } : x)))}
            />
            <span style={{ flex: 1 }} />
            <button type="button" className="icon-btn sm" title="Remove filter" onClick={() => set(view.filters.filter((x) => x.id !== f.id))}>
              <X size={15} />
            </button>
          </div>
        );
      })}
      <button
        type="button"
        className="btn-text add-row"
        onClick={() => {
          const p = schema.properties[0];
          set([...view.filters, { id: uid(), propertyId: p.id, op: opsFor(p.type)[0].op }]);
        }}
      >
        <Plus size={14} /> Add a filter
      </button>
    </div>
  );
}

function SortPanel({ dbId, view, schema }: { dbId: ID; view: DatabaseView; schema: DatabaseSchema }) {
  const set = (sorts: DatabaseView["sorts"]) => updateView(dbId, view.id, { sorts });
  return (
    <div className="panel" style={{ width: 380 }}>
      {view.sorts.length === 0 && <div className="menu-hint">No sorts. Rows keep the order you drag them in.</div>}
      {view.sorts.map((s) => (
        <div className="panel-row" key={s.id}>
          <select
            className="fsel"
            value={s.propertyId}
            onChange={(e) => set(view.sorts.map((x) => (x.id === s.id ? { ...x, propertyId: e.target.value } : x)))}
          >
            {schema.properties.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <select
            className="fsel"
            value={s.dir}
            onChange={(e) => set(view.sorts.map((x) => (x.id === s.id ? { ...x, dir: e.target.value as "asc" | "desc" } : x)))}
          >
            <option value="asc">Ascending</option>
            <option value="desc">Descending</option>
          </select>
          <span style={{ flex: 1 }} />
          <button type="button" className="icon-btn sm" title="Remove sort" onClick={() => set(view.sorts.filter((x) => x.id !== s.id))}>
            <X size={15} />
          </button>
        </div>
      ))}
      <button
        type="button"
        className="btn-text add-row"
        onClick={() => set([...view.sorts, { id: uid(), propertyId: schema.properties[0].id, dir: "asc" }])}
      >
        <Plus size={14} /> Add a sort
      </button>
    </div>
  );
}

function PropertiesPanel({ dbId, view, schema }: { dbId: ID; view: DatabaseView; schema: DatabaseSchema }) {
  const hidden = new Set(view.hidden || []);
  const [adding, setAdding] = useState<HTMLElement | null>(null);
  return (
    <Menu width={260}>
      <MenuLabel>Properties shown in this view</MenuLabel>
      {schema.properties.map((p) => (
        <MenuItem
          key={p.id}
          icon={<PropIcon type={p.type} />}
          label={p.name}
          disabled={p.type === "title"}
          right={p.type === "title" ? undefined : hidden.has(p.id) ? <EyeOff size={15} /> : <Eye size={15} />}
          onClick={() => {
            const next = hidden.has(p.id) ? (view.hidden || []).filter((h) => h !== p.id) : [...(view.hidden || []), p.id];
            updateView(dbId, view.id, { hidden: next });
          }}
        />
      ))}
      <MenuSep />
      <MenuItem icon={<Plus size={16} />} label="New property" onClick={(e) => setAdding(e.currentTarget)} />
      {adding && (
        <Popover anchor={adding} onClose={() => setAdding(null)} placement="right-start">
          <AddPropertyMenu dbId={dbId} onDone={() => setAdding(null)} />
        </Popover>
      )}
    </Menu>
  );
}

function SettingsPanel({ dbId, view, schema, db }: { dbId: ID; view: DatabaseView; schema: DatabaseSchema; db: Page }) {
  const groupable = schema.properties.filter((p) => p.type === "select" || p.type === "status");
  const dates = schema.properties.filter((p) => p.type === "date");
  return (
    <Menu width={280}>
      <MenuLabel>View settings</MenuLabel>
      <div className="menu-pad">
        <input
          className="menu-input"
          defaultValue={view.name}
          onBlur={(e) => e.target.value.trim() && updateView(dbId, view.id, { name: e.target.value.trim() })}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === "Enter") (e.target as HTMLInputElement).blur();
          }}
        />
      </div>
      <div className="settings-grid">
        <label>Layout</label>
        <select
          className="fsel"
          value={view.type}
          onChange={(e) => {
            const t = e.target.value as ViewType;
            const patch: Partial<DatabaseView> = { type: t };
            if (t === "board" && !view.groupBy) patch.groupBy = groupable[0]?.id ?? null;
            if ((t === "calendar" || t === "timeline") && !view.dateProperty) patch.dateProperty = dates[0]?.id ?? null;
            updateView(dbId, view.id, patch);
          }}
        >
          {VIEW_TYPES.map((t) => (
            <option key={t.type} value={t.type}>
              {t.label}
            </option>
          ))}
        </select>
        {view.type === "board" && (
          <>
            <label>Group by</label>
            <select className="fsel" value={view.groupBy || ""} onChange={(e) => updateView(dbId, view.id, { groupBy: e.target.value || null })}>
              <option value="">None</option>
              {groupable.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </>
        )}
        {(view.type === "calendar" || view.type === "timeline") && (
          <>
            <label>Show by</label>
            <select className="fsel" value={view.dateProperty || ""} onChange={(e) => updateView(dbId, view.id, { dateProperty: e.target.value || null })}>
              <option value="">Choose a date property</option>
              {dates.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </>
        )}
        {view.type === "gallery" && (
          <>
            <label>Card preview</label>
            <select className="fsel" value={view.cardPreview || "cover"} onChange={(e) => updateView(dbId, view.id, { cardPreview: e.target.value as any })}>
              <option value="cover">Page cover / first image</option>
              <option value="content">Page content</option>
              <option value="none">None</option>
            </select>
            <label>Card size</label>
            <select className="fsel" value={view.cardSize || "medium"} onChange={(e) => updateView(dbId, view.id, { cardSize: e.target.value as any })}>
              <option value="small">Small</option>
              <option value="medium">Medium</option>
              <option value="large">Large</option>
            </select>
          </>
        )}
      </div>
      <MenuSep />
      <MenuItem
        icon={<FileText size={16} />}
        label="Template for new pages…"
        onClick={() => window.dispatchEvent(new CustomEvent("fn:edit-template", { detail: { dbId } }))}
      />
      <MenuItem icon={<Copy size={16} />} label="Duplicate view" onClick={() => duplicateView(dbId, view.id)} />
      {schema.views.length > 1 && (
        <MenuItem icon={<Trash size={16} />} label="Delete view" danger onClick={() => deleteView(dbId, view.id)} />
      )}
      <div className="menu-hint">{pageTitle(db)} · {schema.rowOrder.length} rows</div>
    </Menu>
  );
}

// ------------------------------------------------------------ toolbar ----

export function DbToolbar({
  db,
  view,
  search,
  setSearch,
  onNew,
  readOnly,
}: {
  db: Page;
  view: DatabaseView;
  search: string;
  setSearch: (s: string) => void;
  onNew: () => void;
  readOnly?: boolean;
}) {
  const schema = db.db!;
  const [open, setOpen] = useState<null | { kind: "filter" | "sort" | "props" | "settings"; el: HTMLElement }>(null);
  const [searching, setSearching] = useState(!!search);
  const filterBtn = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const onOpen = (e: Event) => {
      const d = (e as CustomEvent).detail;
      if (d?.dbId === db.id && filterBtn.current) setOpen({ kind: "filter", el: filterBtn.current });
    };
    window.addEventListener("fn:open-filters", onOpen);
    return () => window.removeEventListener("fn:open-filters", onOpen);
  }, [db.id]);

  const btn = (kind: "filter" | "sort" | "props" | "settings", icon: React.ReactNode, label: string, count = 0, ref?: React.Ref<HTMLButtonElement>) => (
    <button
      ref={ref}
      type="button"
      className={cx("tb-btn", count > 0 && "on")}
      title={label}
      onClick={(e) => setOpen(open?.kind === kind ? null : { kind, el: e.currentTarget })}
    >
      {icon}
      <span className="tb-label">{count > 0 ? `${label} (${count})` : label}</span>
    </button>
  );

  return (
    <div className="db-toolbar">
      {btn("filter", <Funnel size={15} />, "Filter", view.filters.length, filterBtn)}
      {btn("sort", <ArrowUpDown size={15} />, "Sort", view.sorts.length)}
      {btn("props", <Eye size={15} />, "Properties")}
      {searching ? (
        <input
          className="db-search"
          autoFocus
          placeholder="Search…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onBlur={() => !search && setSearching(false)}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === "Escape") {
              setSearch("");
              setSearching(false);
            }
          }}
        />
      ) : (
        <button type="button" className="tb-btn" title="Search" onClick={() => setSearching(true)}>
          <Search size={15} />
        </button>
      )}
      {btn("settings", <SlidersHorizontal size={15} />, "")}
      {!readOnly && (
        <button type="button" className="btn-primary sm" onClick={onNew}>
          New <ChevronDown size={13} style={{ opacity: 0 }} />
        </button>
      )}
      {open && (
        <Popover anchor={open.el} onClose={() => setOpen(null)} placement="bottom-end">
          {open.kind === "filter" && <FilterPanel dbId={db.id} view={view} schema={schema} />}
          {open.kind === "sort" && <SortPanel dbId={db.id} view={view} schema={schema} />}
          {open.kind === "props" && <PropertiesPanel dbId={db.id} view={view} schema={schema} />}
          {open.kind === "settings" && <SettingsPanel dbId={db.id} view={view} schema={schema} db={db} />}
        </Popover>
      )}
    </div>
  );
}
