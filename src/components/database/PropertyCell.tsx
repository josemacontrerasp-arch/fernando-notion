import {
  ArrowUpRight,
  AtSign,
  CalendarDays,
  CircleChevronDown,
  CircleDot,
  Clock,
  Ellipsis,
  Hash,
  Link,
  List,
  Phone,
  SquareCheck,
  TextAlignStart,
  Trash,
  Type,
  User,
} from "lucide-react";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { formatNumber, getValue, isEmptyValue, optionById } from "../../lib/db";
import { openExternal } from "../../lib/storage";
import {
  addOption,
  addRow,
  deleteOption,
  isAlive,
  openPeek,
  setRowProp,
  updateOption,
  updateProperty,
  useApp,
} from "../../lib/store";
import { COLORS, type Color, type DateValue, type ID, type Page, type PropertyDef, type PropertyType, type SelectOption } from "../../lib/types";
import { COLOR_LABEL, cx, formatDateValue, normalize, pageTitle } from "../../lib/utils";
import { DatePicker } from "../DatePicker";
import { PageIcon } from "../Sidebar";
import { ColorDot, Menu, MenuItem, MenuLabel, MenuSep, Popover, Tag, usePopover } from "../ui";

export function PropIcon({ type, size = 15 }: { type: PropertyType; size?: number }) {
  const p = { size, strokeWidth: 1.8 };
  switch (type) {
    case "title":
      return <Type {...p} />;
    case "text":
      return <TextAlignStart {...p} />;
    case "number":
      return <Hash {...p} />;
    case "select":
      return <CircleChevronDown {...p} />;
    case "multi_select":
      return <List {...p} />;
    case "status":
      return <CircleDot {...p} />;
    case "date":
      return <CalendarDays {...p} />;
    case "checkbox":
      return <SquareCheck {...p} />;
    case "url":
      return <Link {...p} />;
    case "email":
      return <AtSign {...p} />;
    case "phone":
      return <Phone {...p} />;
    case "person":
      return <User {...p} />;
    case "relation":
      return <ArrowUpRight {...p} />;
    case "created_time":
    case "last_edited_time":
      return <Clock {...p} />;
  }
}

export function Checkbox({ checked, onChange, disabled }: { checked: boolean; onChange?: (v: boolean) => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      className={cx("checkbox", checked && "checked")}
      disabled={disabled}
      onClick={(e) => {
        e.stopPropagation();
        onChange?.(!checked);
      }}
      aria-checked={checked}
      role="checkbox"
    >
      {checked && (
        <svg viewBox="0 0 14 14" width="12" height="12">
          <path d="M3 7.5l2.5 2.5L11 4.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )}
    </button>
  );
}

// ------------------------------------------------------------ display ----

export function ValueView({ row, prop, compact }: { row: Page; prop: PropertyDef; compact?: boolean }) {
  const pages = useApp((s) => (prop.type === "relation" ? s.pages : null));
  const v = getValue(row, prop);
  if (isEmptyValue(v) && prop.type !== "checkbox") return null;
  switch (prop.type) {
    case "title":
      return <span>{pageTitle(row)}</span>;
    case "number":
      return <span className="num">{formatNumber(v as number, prop.numberFormat)}</span>;
    case "select":
    case "status": {
      const o = optionById(prop, v);
      if (!o) return null;
      return (
        <Tag color={o.color} className={prop.type === "status" ? "status" : undefined}>
          {prop.type === "status" && <span className={cx("status-dot", `c-${o.color}`)} />}
          {o.name}
        </Tag>
      );
    }
    case "multi_select":
      return (
        <span className="tags">
          {(v as string[]).map((id) => {
            const o = optionById(prop, id);
            return o ? (
              <Tag key={id} color={o.color}>
                {o.name}
              </Tag>
            ) : null;
          })}
        </span>
      );
    case "date":
      return <span className="date-val">{formatDateValue(v as DateValue)}</span>;
    case "checkbox":
      return <Checkbox checked={!!v} onChange={(nv) => setRowProp(row.id, prop.id, nv)} />;
    case "url":
      return (
        <a
          className="link-val"
          href={String(v)}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            const s = String(v);
            openExternal(/^https?:\/\//i.test(s) ? s : `https://${s}`);
          }}
        >
          {compact ? String(v).replace(/^https?:\/\/(www\.)?/, "") : String(v)}
        </a>
      );
    case "email":
      return (
        <a
          className="link-val"
          href={`mailto:${v}`}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            openExternal(`mailto:${v}`);
          }}
        >
          {String(v)}
        </a>
      );
    case "phone":
      return <span>{String(v)}</span>;
    case "person":
      return (
        <span className="person">
          <span className="person-avatar">{String(v).trim().charAt(0).toUpperCase()}</span>
          {String(v)}
        </span>
      );
    case "relation":
      return (
        <span className="relations">
          {(v as string[]).map((id) => {
            const p = pages?.[id];
            if (!p || !isAlive(pages!, id)) return null;
            return (
              <span
                key={id}
                className="relation-chip"
                onClick={(e) => {
                  e.stopPropagation();
                  openPeek(id);
                }}
              >
                <PageIcon icon={p.icon} type={p.type} size={14} />
                {pageTitle(p)}
              </span>
            );
          })}
        </span>
      );
    case "created_time":
    case "last_edited_time":
      return <span className="muted">{new Date(v as number).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}</span>;
    default:
      return <span className="text-val">{String(v)}</span>;
  }
}

// ------------------------------------------------------------ editors ----

function OptionMenu({
  dbId,
  prop,
  option,
  onClose,
  anchor,
}: {
  dbId: ID;
  prop: PropertyDef;
  option: SelectOption;
  onClose: () => void;
  anchor: HTMLElement;
}) {
  const [name, setName] = useState(option.name);
  return (
    <Popover anchor={anchor} onClose={onClose} placement="right-start">
      <Menu width={220}>
        <div className="menu-pad">
          <input
            className="menu-input"
            value={name}
            autoFocus
            onChange={(e) => setName(e.target.value)}
            onBlur={() => name.trim() && updateOption(dbId, prop.id, option.id, { name: name.trim() })}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === "Enter") {
                if (name.trim()) updateOption(dbId, prop.id, option.id, { name: name.trim() });
                onClose();
              }
            }}
          />
        </div>
        <MenuItem
          icon={<Trash size={16} />}
          label="Delete"
          danger
          onClick={() => {
            deleteOption(dbId, prop.id, option.id);
            onClose();
          }}
        />
        {prop.type === "status" && (
          <>
            <MenuSep />
            <MenuLabel>Group</MenuLabel>
            {(["todo", "in_progress", "complete"] as const).map((g) => (
              <MenuItem
                key={g}
                label={{ todo: "To-do", in_progress: "In progress", complete: "Complete" }[g]}
                active={option.group === g}
                right={option.group === g ? "✓" : undefined}
                onClick={() => updateOption(dbId, prop.id, option.id, { group: g })}
              />
            ))}
          </>
        )}
        <MenuSep />
        <MenuLabel>Colors</MenuLabel>
        {COLORS.map((c) => (
          <MenuItem
            key={c}
            icon={<ColorDot color={c} />}
            label={COLOR_LABEL[c]}
            right={option.color === c ? "✓" : undefined}
            onClick={() => updateOption(dbId, prop.id, option.id, { color: c as Color })}
          />
        ))}
      </Menu>
    </Popover>
  );
}

export function OptionsEditor({
  dbId,
  prop,
  value,
  onChange,
  onDone,
}: {
  dbId: ID;
  prop: PropertyDef;
  value: unknown;
  onChange: (v: string | string[] | null) => void;
  onDone?: () => void;
}) {
  const multi = prop.type === "multi_select";
  const [q, setQ] = useState("");
  const [optMenu, setOptMenu] = useState<{ opt: SelectOption; el: HTMLElement } | null>(null);
  const [sel, setSel] = useState(0);
  // Read the latest options from the store so newly created ones show immediately.
  const liveProp = useApp((s) => s.pages[dbId]?.db?.properties.find((p) => p.id === prop.id)) || prop;
  const options = liveProp.options || [];
  const selected: string[] = multi ? ((value as string[]) || []) : value ? [value as string] : [];
  const nq = normalize(q.trim());
  const filtered = options.filter((o) => !nq || normalize(o.name).includes(nq));
  const exact = options.find((o) => normalize(o.name) === nq);
  const canCreate = !!q.trim() && !exact;

  const choose = (id: string) => {
    if (multi) onChange(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]);
    else {
      onChange(selected[0] === id ? null : id);
      onDone?.();
    }
    setQ("");
  };
  const create = () => {
    const o = addOption(dbId, prop.id, q.trim());
    choose(o.id);
  };

  const groups =
    liveProp.type === "status"
      ? (["todo", "in_progress", "complete"] as const).map((g) => ({
          label: { todo: "To-do", in_progress: "In progress", complete: "Complete" }[g],
          items: filtered.filter((o) => (o.group || "todo") === g),
        }))
      : [{ label: multi || liveProp.type === "select" ? "Select an option or create one" : "", items: filtered }];
  const flat = groups.flatMap((g) => g.items);

  return (
    <div className="opt-editor" onMouseDown={(e) => e.stopPropagation()}>
      <div className="opt-input-row">
        {selected.map((id) => {
          const o = optionById(liveProp, id);
          return o ? (
            <Tag key={id} color={o.color} onRemove={() => onChange(multi ? selected.filter((x) => x !== id) : null)}>
              {o.name}
            </Tag>
          ) : null;
        })}
        <input
          autoFocus
          className="opt-input"
          value={q}
          placeholder={selected.length ? "" : "Search or create…"}
          onChange={(e) => {
            setQ(e.target.value);
            setSel(0);
          }}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === "Enter") {
              e.preventDefault();
              if (canCreate && sel >= flat.length) create();
              else if (flat[sel]) choose(flat[sel].id);
              else if (canCreate) create();
            } else if (e.key === "ArrowDown") {
              e.preventDefault();
              setSel((s) => Math.min(flat.length - (canCreate ? 0 : 1), s + 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setSel((s) => Math.max(0, s - 1));
            } else if (e.key === "Backspace" && !q && selected.length) {
              onChange(multi ? selected.slice(0, -1) : null);
            } else if (e.key === "Escape") {
              onDone?.();
            }
          }}
        />
      </div>
      <div className="opt-list">
        {groups.map((g) => (
          <React.Fragment key={g.label}>
            {g.label && <div className="menu-heading">{g.label}</div>}
            {g.items.map((o) => {
              const idx = flat.indexOf(o);
              return (
                <div
                  key={o.id}
                  className={cx("opt-row", idx === sel && "hl")}
                  onMouseEnter={() => setSel(idx)}
                  onClick={() => choose(o.id)}
                >
                  <Tag color={o.color}>{o.name}</Tag>
                  <span style={{ flex: 1 }} />
                  {selected.includes(o.id) && <span className="check">✓</span>}
                  <button
                    type="button"
                    className="icon-btn sm opt-more"
                    onClick={(e) => {
                      e.stopPropagation();
                      setOptMenu({ opt: o, el: e.currentTarget });
                    }}
                  >
                    <Ellipsis size={14} />
                  </button>
                </div>
              );
            })}
          </React.Fragment>
        ))}
        {canCreate && (
          <div className={cx("opt-row", sel >= flat.length && "hl")} onClick={create}>
            <span className="muted">Create</span>
            <Tag color="default">{q.trim()}</Tag>
          </div>
        )}
        {!options.length && !q && <div className="menu-hint">Type to create the first option</div>}
      </div>
      {optMenu && (
        <OptionMenu
          dbId={dbId}
          prop={liveProp}
          option={optionById(liveProp, optMenu.opt.id) || optMenu.opt}
          anchor={optMenu.el}
          onClose={() => setOptMenu(null)}
        />
      )}
    </div>
  );
}

function RelationEditor({ dbId, prop, value, onChange }: { dbId: ID; prop: PropertyDef; value: unknown; onChange: (v: string[]) => void }) {
  const pages = useApp((s) => s.pages);
  const [q, setQ] = useState("");
  const selected = (value as string[]) || [];
  const target = prop.relationDatabaseId ? pages[prop.relationDatabaseId] : null;
  if (!target) {
    const dbs = Object.values(pages).filter((p) => p.type === "database" && isAlive(pages, p.id));
    return (
      <Menu width={260}>
        <MenuLabel>Relate to which database?</MenuLabel>
        {dbs.map((d) => (
          <MenuItem
            key={d.id}
            icon={<PageIcon icon={d.icon} type="database" size={16} />}
            label={pageTitle(d)}
            onClick={() => updateProperty(dbId, prop.id, { relationDatabaseId: d.id })}
          />
        ))}
        {!dbs.length && <div className="menu-hint">No databases yet</div>}
      </Menu>
    );
  }
  const nq = normalize(q.trim());
  const rows = Object.values(pages)
    .filter((p) => p.parentId === target.id && p.isRow && !p.trashed)
    .filter((p) => !nq || normalize(pageTitle(p)).includes(nq))
    .slice(0, 60);
  return (
    <div className="opt-editor" style={{ width: 300 }} onMouseDown={(e) => e.stopPropagation()}>
      <div className="opt-input-row">
        <input
          autoFocus
          className="opt-input"
          placeholder={`Link a page from ${pageTitle(target)}…`}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => e.stopPropagation()}
        />
      </div>
      <div className="opt-list">
        {rows.map((r) => (
          <div
            key={r.id}
            className="opt-row"
            onClick={() => onChange(selected.includes(r.id) ? selected.filter((x) => x !== r.id) : [...selected, r.id])}
          >
            <PageIcon icon={r.icon} type="page" size={16} />
            <span className="opt-name">{pageTitle(r)}</span>
            <span style={{ flex: 1 }} />
            {selected.includes(r.id) && <span className="check">✓</span>}
          </div>
        ))}
        {q.trim() && (
          <div
            className="opt-row"
            onClick={() => {
              const id = addRow(target.id, {}, { title: q.trim() });
              onChange([...selected, id]);
              setQ("");
            }}
          >
            <span className="muted">+ New page</span> {q.trim()}
          </div>
        )}
        {!rows.length && !q && <div className="menu-hint">No pages in {pageTitle(target)}</div>}
      </div>
    </div>
  );
}

function TextEditorInput({
  initial,
  type,
  multiline,
  onCommit,
}: {
  initial: string;
  type: string;
  multiline: boolean;
  onCommit: (v: string, nav?: "next") => void;
}) {
  const [v, setV] = useState(initial);
  const ref = useRef<HTMLTextAreaElement & HTMLInputElement>(null);
  const done = useRef(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.focus();
    const len = el.value.length;
    try {
      el.setSelectionRange(len, len);
    } catch {
      /* number inputs */
    }
    if (multiline) {
      el.style.height = "auto";
      el.style.height = `${el.scrollHeight}px`;
    }
  }, [multiline]);
  const commit = (nav?: "next") => {
    if (done.current) return;
    done.current = true;
    onCommit(v, nav);
  };
  const common = {
    ref,
    value: v,
    className: "cell-input",
    onBlur: () => commit(),
    onKeyDown: (e: React.KeyboardEvent) => {
      e.stopPropagation();
      if (e.key === "Enter" && !(multiline && e.shiftKey)) {
        e.preventDefault();
        commit("next");
      } else if (e.key === "Escape") {
        done.current = true;
        onCommit(initial);
      }
    },
  };
  if (multiline)
    return (
      <textarea
        {...common}
        rows={1}
        onChange={(e) => {
          setV(e.target.value);
          e.target.style.height = "auto";
          e.target.style.height = `${e.target.scrollHeight}px`;
        }}
      />
    );
  return <input {...common} type={type} onChange={(e) => setV(e.target.value)} />;
}

const TEXT_TYPES: PropertyType[] = ["title", "text", "number", "url", "email", "phone", "person"];

/** A property value that can be clicked to edit (used in tables, cards and the page properties panel). */
export function PropertyCell({
  row,
  prop,
  dbId,
  variant = "table",
  readOnly,
  onTitleCommit,
  startEditing,
}: {
  row: Page;
  prop: PropertyDef;
  dbId: ID;
  variant?: "table" | "panel";
  readOnly?: boolean;
  onTitleCommit?: () => void;
  startEditing?: boolean;
}) {
  const [editing, setEditing] = useState(!!startEditing);
  const ref = useRef<HTMLDivElement>(null);
  const value = getValue(row, prop);
  const ro = readOnly || prop.type === "created_time" || prop.type === "last_edited_time";
  const isText = TEXT_TYPES.includes(prop.type);
  const empty = isEmptyValue(value);

  const commitText = (s: string) => {
    setEditing(false);
    if (prop.type === "number") {
      const n = s.trim() === "" ? null : Number(s);
      setRowProp(row.id, prop.id, n === null || Number.isNaN(n) ? null : n);
    } else setRowProp(row.id, prop.id, prop.type === "title" ? s : s.trim() || null);
    if (prop.type === "title") onTitleCommit?.();
  };

  const editor = useMemo(() => {
    if (!editing || isText) return null;
    switch (prop.type) {
      case "select":
      case "status":
      case "multi_select":
        return (
          <OptionsEditor
            dbId={dbId}
            prop={prop}
            value={value}
            onChange={(v) => setRowProp(row.id, prop.id, v)}
            onDone={() => setEditing(false)}
          />
        );
      case "date":
        return <DatePicker value={value as DateValue} onChange={(v) => setRowProp(row.id, prop.id, v)} />;
      case "relation":
        return <RelationEditor dbId={dbId} prop={prop} value={value} onChange={(v) => setRowProp(row.id, prop.id, v)} />;
      default:
        return null;
    }
  }, [editing, isText, prop, dbId, value, row.id]);

  if (prop.type === "checkbox") {
    return (
      <div className={cx("cell", "cell-checkbox", variant)}>
        <Checkbox checked={!!value} disabled={readOnly} onChange={(v) => setRowProp(row.id, prop.id, v)} />
      </div>
    );
  }

  return (
    <div
      ref={ref}
      className={cx("cell", `cell-${prop.type}`, variant, editing && "editing", ro && "readonly")}
      onClick={() => !ro && !editing && setEditing(true)}
    >
      {editing && isText ? (
        <TextEditorInput
          initial={value === null || value === undefined ? "" : String(value)}
          type={prop.type === "number" ? "number" : prop.type === "email" ? "email" : "text"}
          multiline={prop.type === "text" || prop.type === "title"}
          onCommit={commitText}
        />
      ) : empty ? (
        variant === "panel" ? <span className="empty-val">Empty</span> : null
      ) : (
        <ValueView row={row} prop={prop} compact={variant === "table"} />
      )}
      {editing && !isText && editor && (
        <Popover anchor={ref.current} onClose={() => setEditing(false)} placement="bottom-start" offset={2}>
          {editor}
        </Popover>
      )}
    </div>
  );
}
