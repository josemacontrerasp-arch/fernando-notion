import { ArrowDown, ArrowUp, ChevronRight, EyeOff, Funnel, Trash } from "lucide-react";
import { useState } from "react";
import { PROPERTY_TYPES, opsFor, typeLabel } from "../../lib/db";
import {
  addProperty,
  changePropertyType,
  deleteProperty,
  updateProperty,
  updateView,
  useApp,
} from "../../lib/store";
import type { DatabaseView, ID, NumberFormat, PropertyDef, PropertyType } from "../../lib/types";
import { pageTitle, uid } from "../../lib/utils";
import { PageIcon } from "../Sidebar";
import { Menu, MenuItem, MenuLabel, MenuSep, Popover } from "../ui";
import { PropIcon } from "./PropertyCell";

export function PropertyTypeList({ onPick, current }: { onPick: (t: PropertyType) => void; current?: PropertyType }) {
  return (
    <>
      {PROPERTY_TYPES.map((t) => (
        <MenuItem
          key={t.type}
          icon={<PropIcon type={t.type} />}
          label={t.label}
          right={current === t.type ? "✓" : undefined}
          onClick={() => onPick(t.type)}
        />
      ))}
    </>
  );
}

/** Menu to create a new property: name + type. */
export function AddPropertyMenu({ dbId, onDone, index }: { dbId: ID; onDone: (id?: ID) => void; index?: number }) {
  const [name, setName] = useState("");
  return (
    <Menu width={240}>
      <div className="menu-pad">
        <input
          className="menu-input"
          placeholder="Property name"
          value={name}
          autoFocus
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === "Enter") onDone(addProperty(dbId, "text", name.trim() || undefined, index));
          }}
        />
      </div>
      <MenuLabel>Type</MenuLabel>
      <PropertyTypeList onPick={(t) => onDone(addProperty(dbId, t, name.trim() || undefined, index))} />
    </Menu>
  );
}

export function PropertyMenu({
  dbId,
  prop,
  view,
  anchor,
  onClose,
}: {
  dbId: ID;
  prop: PropertyDef;
  view?: DatabaseView;
  anchor: HTMLElement;
  onClose: () => void;
}) {
  const [name, setName] = useState(prop.name);
  const [sub, setSub] = useState<null | { kind: "type" | "format" | "relation"; el: HTMLElement }>(null);
  const pages = useApp((s) => s.pages);
  const commitName = () => {
    if (name.trim() && name.trim() !== prop.name) updateProperty(dbId, prop.id, { name: name.trim() });
  };
  const isTitle = prop.type === "title";
  const dbs = Object.values(pages).filter((p) => p.type === "database" && !p.trashed);

  return (
    <Popover anchor={anchor} onClose={() => (commitName(), onClose())}>
      <Menu width={250}>
        <div className="menu-pad">
          <input
            className="menu-input"
            value={name}
            autoFocus
            onChange={(e) => setName(e.target.value)}
            onBlur={commitName}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === "Enter") {
                commitName();
                onClose();
              }
            }}
          />
        </div>
        {!isTitle && (
          <MenuItem
            icon={<PropIcon type={prop.type} />}
            label="Type"
            right={
              <>
                {typeLabel(prop.type)} <ChevronRight size={14} />
              </>
            }
            onClick={(e) => setSub({ kind: "type", el: e.currentTarget })}
          />
        )}
        {prop.type === "number" && (
          <MenuItem
            label="Number format"
            right={
              <>
                {prop.numberFormat || "number"} <ChevronRight size={14} />
              </>
            }
            onClick={(e) => setSub({ kind: "format", el: e.currentTarget })}
          />
        )}
        {prop.type === "relation" && (
          <MenuItem
            label="Related database"
            right={
              <>
                {prop.relationDatabaseId ? pageTitle(pages[prop.relationDatabaseId]) : "None"} <ChevronRight size={14} />
              </>
            }
            onClick={(e) => setSub({ kind: "relation", el: e.currentTarget })}
          />
        )}
        {view && (
          <>
            <MenuSep />
            <MenuItem
              icon={<ArrowUp size={16} />}
              label="Sort ascending"
              onClick={() => {
                updateView(dbId, view.id, { sorts: [{ id: uid(), propertyId: prop.id, dir: "asc" }] });
                onClose();
              }}
            />
            <MenuItem
              icon={<ArrowDown size={16} />}
              label="Sort descending"
              onClick={() => {
                updateView(dbId, view.id, { sorts: [{ id: uid(), propertyId: prop.id, dir: "desc" }] });
                onClose();
              }}
            />
            <MenuItem
              icon={<Funnel size={16} />}
              label="Filter"
              onClick={() => {
                const op = opsFor(prop.type)[0].op;
                updateView(dbId, view.id, { filters: [...view.filters, { id: uid(), propertyId: prop.id, op }] });
                onClose();
                window.dispatchEvent(new CustomEvent("fn:open-filters", { detail: { dbId } }));
              }}
            />
            {!isTitle && (
              <MenuItem
                icon={<EyeOff size={16} />}
                label="Hide in view"
                onClick={() => {
                  updateView(dbId, view.id, { hidden: [...(view.hidden || []), prop.id] });
                  onClose();
                }}
              />
            )}
          </>
        )}
        {!isTitle && (
          <>
            <MenuSep />
            <MenuItem
              icon={<Trash size={16} />}
              label="Delete property"
              danger
              onClick={() => {
                if (confirm(`Delete the property “${prop.name}”? Its values will be removed from every row.`)) {
                  deleteProperty(dbId, prop.id);
                  onClose();
                }
              }}
            />
          </>
        )}
      </Menu>
      {sub?.kind === "type" && (
        <Popover anchor={sub.el} onClose={() => setSub(null)} placement="right-start">
          <Menu width={220}>
            <PropertyTypeList
              current={prop.type}
              onPick={(t) => {
                changePropertyType(dbId, prop.id, t);
                setSub(null);
                onClose();
              }}
            />
          </Menu>
        </Popover>
      )}
      {sub?.kind === "format" && (
        <Popover anchor={sub.el} onClose={() => setSub(null)} placement="right-start">
          <Menu width={180}>
            {(["number", "percent", "dollar", "euro", "pound"] as NumberFormat[]).map((f) => (
              <MenuItem
                key={f}
                label={f[0].toUpperCase() + f.slice(1)}
                right={prop.numberFormat === f ? "✓" : undefined}
                onClick={() => {
                  updateProperty(dbId, prop.id, { numberFormat: f });
                  setSub(null);
                }}
              />
            ))}
          </Menu>
        </Popover>
      )}
      {sub?.kind === "relation" && (
        <Popover anchor={sub.el} onClose={() => setSub(null)} placement="right-start">
          <Menu width={240}>
            {dbs.map((d) => (
              <MenuItem
                key={d.id}
                icon={<PageIcon icon={d.icon} type="database" size={16} />}
                label={pageTitle(d)}
                right={prop.relationDatabaseId === d.id ? "✓" : undefined}
                onClick={() => {
                  updateProperty(dbId, prop.id, { relationDatabaseId: d.id });
                  setSub(null);
                }}
              />
            ))}
          </Menu>
        </Popover>
      )}
    </Popover>
  );
}
