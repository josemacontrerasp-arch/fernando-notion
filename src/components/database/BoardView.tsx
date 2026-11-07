import { Ellipsis, Plus } from "lucide-react";
import { useRef, useState } from "react";
import { isEmptyValue, optionById, visibleProps } from "../../lib/db";
import {
  addOption,
  addProperty,
  addRow,
  deleteOption,
  moveRow,
  openPeek,
  setRowProp,
  updateOption,
  updateView,
} from "../../lib/store";
import type { DatabaseView, ID, Page, PropertyDef, SelectOption } from "../../lib/types";
import { COLORS } from "../../lib/types";
import { COLOR_LABEL, cx, pageTitle } from "../../lib/utils";
import { PageIcon } from "../Sidebar";
import { ColorDot, InlineInput, Menu, MenuItem, MenuLabel, MenuSep, Popover, Tag, usePopover } from "../ui";
import { PropertyCell, ValueView } from "./PropertyCell";
import { defaultsFromFilters, getDraggedRow, ROW_MIME, setDraggedRow } from "./shared";

export function CardProps({ row, props, dbId }: { row: Page; props: PropertyDef[]; dbId: ID }) {
  return (
    <div className="card-props">
      {props.map((p) =>
        p.type === "checkbox" ? (
          <div key={p.id} className="card-prop checkbox-prop">
            <PropertyCell row={row} prop={p} dbId={dbId} />
            <span className="muted">{p.name}</span>
          </div>
        ) : isEmptyValue(row.props?.[p.id]) && p.type !== "created_time" && p.type !== "last_edited_time" ? null : (
          <div key={p.id} className="card-prop" title={p.name}>
            <ValueView row={row} prop={p} compact />
          </div>
        ),
      )}
    </div>
  );
}

function Card({
  row,
  dbId,
  props,
  editing,
  onEdited,
  draggable,
}: {
  row: Page;
  dbId: ID;
  props: PropertyDef[];
  editing: boolean;
  onEdited: () => void;
  draggable: boolean;
}) {
  return (
    <div
      className="board-card"
      data-row-id={row.id}
      draggable={draggable && !editing}
      onDragStart={(e) => {
        setDraggedRow(row.id);
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData(ROW_MIME, row.id);
        (e.currentTarget as HTMLElement).classList.add("dragging");
      }}
      onDragEnd={(e) => {
        setDraggedRow(null);
        (e.currentTarget as HTMLElement).classList.remove("dragging");
      }}
      onClick={() => !editing && openPeek(row.id)}
    >
      {row.cover && !row.cover.startsWith("linear") && !row.cover.startsWith("#") && (
        <div className="card-cover" style={{ backgroundImage: `url("${row.cover}")` }} />
      )}
      <div className="card-title">
        {row.icon && <PageIcon icon={row.icon} size={16} />}
        {editing ? (
          <InlineInput
            value={row.title}
            placeholder="Type a name…"
            onCommit={(v) => {
              setRowProp(row.id, "title", v);
              onEdited();
            }}
          />
        ) : (
          <span>{pageTitle(row)}</span>
        )}
      </div>
      <CardProps row={row} props={props} dbId={dbId} />
    </div>
  );
}

function GroupMenu({ dbId, prop, option, anchor, onClose }: { dbId: ID; prop: PropertyDef; option: SelectOption; anchor: HTMLElement; onClose: () => void }) {
  const [name, setName] = useState(option.name);
  return (
    <Popover anchor={anchor} onClose={onClose}>
      <Menu width={210}>
        <div className="menu-pad">
          <input
            className="menu-input"
            value={name}
            autoFocus
            onChange={(e) => setName(e.target.value)}
            onBlur={() => name.trim() && updateOption(dbId, prop.id, option.id, { name: name.trim() })}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === "Enter") onClose();
            }}
          />
        </div>
        <MenuLabel>Color</MenuLabel>
        {COLORS.map((c) => (
          <MenuItem
            key={c}
            icon={<ColorDot color={c} />}
            label={COLOR_LABEL[c]}
            right={option.color === c ? "✓" : undefined}
            onClick={() => updateOption(dbId, prop.id, option.id, { color: c })}
          />
        ))}
        <MenuSep />
        <MenuItem
          label="Delete group"
          danger
          onClick={() => {
            if (confirm(`Delete “${option.name}”? Cards in it will move to “No ${prop.name}”.`)) {
              deleteOption(dbId, prop.id, option.id);
              onClose();
            }
          }}
        />
      </Menu>
    </Popover>
  );
}

function Column({
  db,
  view,
  prop,
  option,
  rows,
  cardProps,
  canReorder,
  readOnly,
}: {
  db: Page;
  view: DatabaseView;
  prop: PropertyDef;
  option: SelectOption | null;
  rows: Page[];
  cardProps: PropertyDef[];
  canReorder: boolean;
  readOnly?: boolean;
}) {
  const [dropIndex, setDropIndex] = useState<number | null>(null);
  const [editing, setEditing] = useState<ID | null>(null);
  const [menuEl, setMenuEl] = useState<HTMLElement | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const value = option ? option.id : null;

  const indexAt = (y: number) => {
    const cards = Array.from(listRef.current?.querySelectorAll<HTMLElement>(".board-card") || []);
    for (let i = 0; i < cards.length; i++) {
      const r = cards[i].getBoundingClientRect();
      if (y < r.top + r.height / 2) return i;
    }
    return cards.length;
  };

  const create = () => {
    const id = addRow(db.id, { ...defaultsFromFilters(view, db.db!), [prop.id]: value });
    setEditing(id);
  };

  return (
    <div className="board-col">
      <div className="board-col-head">
        {option ? (
          <Tag color={option.color} className={prop.type === "status" ? "status" : undefined}>
            {prop.type === "status" && <span className={cx("status-dot", `c-${option.color}`)} />}
            {option.name}
          </Tag>
        ) : (
          <span className="muted no-group">No {prop.name}</span>
        )}
        <span className="count">{rows.length}</span>
        <span style={{ flex: 1 }} />
        {option && !readOnly && (
          <button type="button" className="icon-btn sm" onClick={(e) => setMenuEl(e.currentTarget)}>
            <Ellipsis size={15} />
          </button>
        )}
        {!readOnly && (
          <button type="button" className="icon-btn sm" title="New" onClick={create}>
            <Plus size={15} />
          </button>
        )}
      </div>
      <div
        ref={listRef}
        className={cx("board-list", dropIndex !== null && "drop-active")}
        onDragOver={(e) => {
          if (!getDraggedRow() || readOnly) return;
          e.preventDefault();
          setDropIndex(indexAt(e.clientY));
        }}
        onDragLeave={(e) => {
          if (!listRef.current?.contains(e.relatedTarget as Node)) setDropIndex(null);
        }}
        onDrop={(e) => {
          e.preventDefault();
          const id = getDraggedRow();
          const idx = dropIndex ?? rows.length;
          setDropIndex(null);
          setDraggedRow(null);
          if (!id) return;
          setRowProp(id, prop.id, value);
          if (canReorder) {
            const others = rows.filter((r) => r.id !== id);
            const draggedIdx = rows.findIndex((r) => r.id === id);
            const insertIdx = draggedIdx >= 0 && draggedIdx < idx ? idx - 1 : idx;
            const before = others[insertIdx];
            moveRow(db.id, id, before ? before.id : null);
          }
        }}
      >
        {rows.map((r, i) => (
          <div key={r.id}>
            {dropIndex === i && <div className="drop-line" />}
            <Card
              row={r}
              dbId={db.id}
              props={cardProps}
              editing={editing === r.id}
              onEdited={() => setEditing(null)}
              draggable={!readOnly}
            />
          </div>
        ))}
        {dropIndex === rows.length && <div className="drop-line" />}
        {!readOnly && (
          <button type="button" className="board-new" onClick={create}>
            <Plus size={14} /> New
          </button>
        )}
      </div>
      {menuEl && option && <GroupMenu dbId={db.id} prop={prop} option={option} anchor={menuEl} onClose={() => setMenuEl(null)} />}
    </div>
  );
}

export function BoardView({ db, view, rows, readOnly }: { db: Page; view: DatabaseView; rows: Page[]; readOnly?: boolean }) {
  const schema = db.db!;
  const prop = schema.properties.find((p) => p.id === view.groupBy && (p.type === "select" || p.type === "status"));
  const [adding, setAdding] = useState(false);
  const pick = usePopover();

  if (!prop) {
    const candidates = schema.properties.filter((p) => p.type === "select" || p.type === "status");
    return (
      <div className="db-empty">
        <p>A board groups cards by a Select or Status property.</p>
        {candidates.map((c) => (
          <button key={c.id} type="button" className="btn" onClick={() => updateView(db.id, view.id, { groupBy: c.id })}>
            Group by {c.name}
          </button>
        ))}
        {!readOnly && (
          <button
            type="button"
            className="btn-primary"
            onClick={() => {
              const id = addProperty(db.id, "status", "Status");
              updateView(db.id, view.id, { groupBy: id });
            }}
          >
            Add a Status property
          </button>
        )}
        {pick.anchor && null}
      </div>
    );
  }

  const cardProps = visibleProps(schema, view).filter((p) => p.type !== "title" && p.id !== prop.id);
  const options = prop.options || [];
  const groups: { option: SelectOption | null; rows: Page[] }[] = [
    { option: null, rows: rows.filter((r) => !optionById(prop, r.props?.[prop.id])) },
    ...options.map((o) => ({ option: o, rows: rows.filter((r) => r.props?.[prop.id] === o.id) })),
  ];
  const canReorder = view.sorts.length === 0;

  return (
    <div className="board-scroll">
      <div className="board">
        {groups
          .filter((g) => g.option || g.rows.length > 0)
          .map((g) => (
            <Column
              key={g.option?.id || "none"}
              db={db}
              view={view}
              prop={prop}
              option={g.option}
              rows={g.rows}
              cardProps={cardProps}
              canReorder={canReorder}
              readOnly={readOnly}
            />
          ))}
        {!readOnly && (
          <div className="board-add-group">
            {adding ? (
              <InlineInput
                value=""
                placeholder="Group name"
                onCommit={(v) => {
                  if (v.trim()) addOption(db.id, prop.id, v.trim());
                  setAdding(false);
                }}
              />
            ) : (
              <button type="button" className="btn-text" onClick={() => setAdding(true)}>
                <Plus size={14} /> Add group
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
