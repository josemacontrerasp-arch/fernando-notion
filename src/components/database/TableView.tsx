import { GripVertical, Maximize2, Plus } from "lucide-react";
import { useRef, useState } from "react";
import { visibleProps } from "../../lib/db";
import { addRow, deletePermanently, duplicatePage, moveRow, openPeek, trashPage, updateView } from "../../lib/store";
import type { DatabaseView, ID, Page, PropertyDef } from "../../lib/types";
import { cx, pageTitle } from "../../lib/utils";
import { PageIcon } from "../Sidebar";
import { Menu, MenuItem, MenuSep, Popover, pointAnchor, usePopover } from "../ui";
import { PropertyCell, PropIcon } from "./PropertyCell";
import { AddPropertyMenu, PropertyMenu } from "./PropertyMenu";
import { defaultsFromFilters, getDraggedRow, ROW_MIME, setDraggedRow } from "./shared";

const defaultWidth = (p: PropertyDef) => (p.type === "title" ? 280 : p.type === "checkbox" ? 110 : 180);

function HeaderCell({ dbId, prop, view, width, readOnly }: { dbId: ID; prop: PropertyDef; view: DatabaseView; width: number; readOnly?: boolean }) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const startResize = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    let w = width;
    const move = (ev: MouseEvent) => {
      w = Math.max(80, width + ev.clientX - startX);
      if (ref.current) ref.current.style.width = `${w}px`;
      document.querySelectorAll<HTMLElement>(`[data-col="${dbId}-${prop.id}"]`).forEach((el) => (el.style.width = `${w}px`));
    };
    const up = () => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
      updateView(dbId, view.id, { widths: { ...(view.widths || {}), [prop.id]: w } });
    };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
  };
  return (
    <div ref={ref} className="th" style={{ width }} onClick={(e) => !readOnly && setAnchor(e.currentTarget)}>
      <PropIcon type={prop.type} />
      <span className="th-name">{prop.name}</span>
      <span className="col-resizer" onMouseDown={startResize} onClick={(e) => e.stopPropagation()} />
      {anchor && <PropertyMenu dbId={dbId} prop={prop} view={view} anchor={anchor} onClose={() => setAnchor(null)} />}
    </div>
  );
}

function TableRow({
  row,
  dbId,
  props,
  view,
  widthOf,
  canDrag,
  editTitle,
  onTitleDone,
  readOnly,
}: {
  row: Page;
  dbId: ID;
  props: PropertyDef[];
  view: DatabaseView;
  widthOf: (p: PropertyDef) => number;
  canDrag: boolean;
  editTitle: boolean;
  onTitleDone: () => void;
  readOnly?: boolean;
}) {
  const [drop, setDrop] = useState<"before" | "after" | null>(null);
  const menu = usePopover();
  const ref = useRef<HTMLDivElement>(null);
  return (
    <div
      ref={ref}
      className={cx("tr", drop && `drop-${drop}`)}
      onDragOver={(e) => {
        const dragged = getDraggedRow();
        if (!canDrag || !dragged || dragged === row.id) return;
        e.preventDefault();
        const rect = ref.current!.getBoundingClientRect();
        setDrop(e.clientY - rect.top < rect.height / 2 ? "before" : "after");
      }}
      onDragLeave={() => setDrop(null)}
      onDrop={(e) => {
        e.preventDefault();
        const dragged = getDraggedRow();
        const pos = drop;
        setDrop(null);
        setDraggedRow(null);
        if (!dragged || dragged === row.id || !pos) return;
        if (pos === "before") moveRow(dbId, dragged, row.id);
        else {
          // insert after: find the next row in the db order
          const el = ref.current?.nextElementSibling as HTMLElement | null;
          moveRow(dbId, dragged, el?.dataset.rowId || null);
        }
      }}
      data-row-id={row.id}
      onContextMenu={(e) => {
        if (readOnly) return;
        e.preventDefault();
        menu.open(pointAnchor(e.clientX, e.clientY));
      }}
    >
      {!readOnly && (
        <div className="row-handle-wrap">
          <span
            className={cx("row-handle", !canDrag && "disabled")}
            draggable={canDrag}
            title={canDrag ? "Drag to move · click for options" : "Remove sorting to reorder rows"}
            onDragStart={(e) => {
              setDraggedRow(row.id);
              e.dataTransfer.effectAllowed = "move";
              e.dataTransfer.setData(ROW_MIME, row.id);
              e.dataTransfer.setDragImage(ref.current!, 20, 16);
            }}
            onDragEnd={() => setDraggedRow(null)}
            onClick={(e) => menu.toggle(e.currentTarget as HTMLElement)}
          >
            <GripVertical size={14} />
          </span>
        </div>
      )}
      {props.map((p) =>
        p.type === "title" ? (
          <div key={p.id} className="td td-title" style={{ width: widthOf(p) }} data-col={`${dbId}-${p.id}`}>
            <span className="td-icon" onClick={() => openPeek(row.id)}>
              <PageIcon icon={row.icon} type="page" size={16} />
            </span>
            <PropertyCell row={row} prop={p} dbId={dbId} readOnly={readOnly} startEditing={editTitle} onTitleCommit={onTitleDone} />
            <button type="button" className="open-btn" onClick={() => openPeek(row.id)}>
              <Maximize2 size={12} /> Open
            </button>
          </div>
        ) : (
          <div key={p.id} className="td" style={{ width: widthOf(p) }} data-col={`${dbId}-${p.id}`}>
            <PropertyCell row={row} prop={p} dbId={dbId} readOnly={readOnly} />
          </div>
        ),
      )}
      {menu.anchor && (
        <Popover anchor={menu.anchor} onClose={menu.close}>
          <Menu width={200}>
            <MenuItem label="Open in side peek" onClick={() => (menu.close(), openPeek(row.id))} />
            <MenuItem label="Duplicate" onClick={() => (menu.close(), duplicatePage(row.id))} />
            <MenuSep />
            <MenuItem label="Move to Trash" danger onClick={() => (menu.close(), trashPage(row.id))} />
            <MenuItem
              label="Delete permanently"
              danger
              onClick={() => {
                menu.close();
                if (confirm("Delete this row permanently?")) deletePermanently(row.id);
              }}
            />
          </Menu>
        </Popover>
      )}
    </div>
  );
}

export function TableView({ db, view, rows, readOnly }: { db: Page; view: DatabaseView; rows: Page[]; readOnly?: boolean }) {
  const schema = db.db!;
  const props = visibleProps(schema, view);
  const widthOf = (p: PropertyDef) => view.widths?.[p.id] ?? defaultWidth(p);
  const [editId, setEditId] = useState<ID | null>(null);
  const add = usePopover();
  const total = props.reduce((s, p) => s + widthOf(p), 0) + 40;
  const canDrag = view.sorts.length === 0 && !readOnly;

  const newRow = () => {
    const id = addRow(db.id, defaultsFromFilters(view, schema));
    setEditId(id);
  };

  return (
    <div className="table-scroll">
      <div className="table" style={{ minWidth: total }}>
        <div className="thead">
          <div className="row-handle-wrap" />
          {props.map((p) => (
            <HeaderCell key={p.id} dbId={db.id} prop={p} view={view} width={widthOf(p)} readOnly={readOnly} />
          ))}
          {!readOnly && (
            <div className="th th-add" onClick={(e) => add.toggle(e.currentTarget)} title="Add a property">
              <Plus size={15} />
            </div>
          )}
          {add.anchor && (
            <Popover anchor={add.anchor} onClose={add.close}>
              <AddPropertyMenu dbId={db.id} onDone={() => add.close()} />
            </Popover>
          )}
        </div>
        {rows.map((r) => (
          <TableRow
            key={r.id}
            row={r}
            dbId={db.id}
            props={props}
            view={view}
            widthOf={widthOf}
            canDrag={canDrag}
            editTitle={editId === r.id}
            onTitleDone={() => setEditId(null)}
            readOnly={readOnly}
          />
        ))}
        {!readOnly && (
          <div className="table-new" onClick={newRow}>
            <Plus size={15} /> New
          </div>
        )}
        <div className="table-foot">
          <span className="muted">Count</span> {rows.length}
        </div>
      </div>
    </div>
  );
}
