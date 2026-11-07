import { Plus } from "lucide-react";
import { visibleProps } from "../../lib/db";
import { addRow, openPeek, useApp } from "../../lib/store";
import type { DatabaseView, Page } from "../../lib/types";
import { blocksToText, cx, firstImage, pageTitle } from "../../lib/utils";
import { PageIcon } from "../Sidebar";
import { CardProps } from "./BoardView";
import { ValueView } from "./PropertyCell";
import { defaultsFromFilters } from "./shared";

export function ListView({ db, view, rows, readOnly }: { db: Page; view: DatabaseView; rows: Page[]; readOnly?: boolean }) {
  const schema = db.db!;
  const props = visibleProps(schema, view).filter((p) => p.type !== "title");
  const create = () => {
    const id = addRow(db.id, defaultsFromFilters(view, schema));
    openPeek(id);
    useApp.setState({ focusTitle: id });
  };
  return (
    <div className="list-view">
      {rows.map((r) => (
        <div key={r.id} className="list-row" onClick={() => openPeek(r.id)}>
          <PageIcon icon={r.icon} type="page" size={18} />
          <span className="list-title">{pageTitle(r)}</span>
          <span style={{ flex: 1 }} />
          <span className="list-props">
            {props.map((p) => (
              <span key={p.id} className="list-prop">
                <ValueView row={r} prop={p} compact />
              </span>
            ))}
          </span>
        </div>
      ))}
      {rows.length === 0 && <div className="db-none">No pages to show</div>}
      {!readOnly && (
        <div className="table-new" onClick={create}>
          <Plus size={15} /> New
        </div>
      )}
    </div>
  );
}

function isImageCover(c?: string | null) {
  return !!c && !c.startsWith("linear-gradient") && !c.startsWith("#");
}

export function GalleryView({ db, view, rows, readOnly }: { db: Page; view: DatabaseView; rows: Page[]; readOnly?: boolean }) {
  const schema = db.db!;
  const props = visibleProps(schema, view).filter((p) => p.type !== "title");
  const size = view.cardSize || "medium";
  const preview = view.cardPreview || "cover";
  const create = () => {
    const id = addRow(db.id, defaultsFromFilters(view, schema));
    openPeek(id);
    useApp.setState({ focusTitle: id });
  };
  return (
    <div className={cx("gallery", `size-${size}`)}>
      {rows.map((r) => {
        const img = preview === "cover" ? (isImageCover(r.cover) ? r.cover : firstImage(r.content)) : null;
        const gradient = preview === "cover" && r.cover && !isImageCover(r.cover) ? r.cover : null;
        return (
          <div key={r.id} className="gallery-card" onClick={() => openPeek(r.id)}>
            {preview !== "none" && (
              <div
                className={cx("gallery-preview", !img && !gradient && preview === "cover" && "blank")}
                style={img ? { backgroundImage: `url("${img}")` } : gradient ? { background: gradient } : undefined}
              >
                {preview === "content" && <div className="gallery-text">{blocksToText(r.content).slice(0, 400)}</div>}
                {preview === "cover" && !img && !gradient && r.icon && <span className="gallery-icon">{r.icon}</span>}
              </div>
            )}
            <div className="gallery-body">
              <div className="card-title">
                {r.icon && <PageIcon icon={r.icon} size={16} />}
                <span>{pageTitle(r)}</span>
              </div>
              <CardProps row={r} props={props} dbId={db.id} />
            </div>
          </div>
        );
      })}
      {!readOnly && (
        <div className="gallery-card new" onClick={create}>
          <Plus size={16} /> New
        </div>
      )}
    </div>
  );
}
