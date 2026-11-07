import { formatDistanceToNow } from "date-fns";
import { RotateCcw, Trash as TrashIcon } from "lucide-react";
import { useState } from "react";
import { deletePermanently, emptyTrash, openPage, restorePage, useApp } from "../lib/store";
import { normalize, pageTitle } from "../lib/utils";
import { PageIcon } from "./Sidebar";

export function TrashView() {
  const pages = useApp((s) => s.pages);
  const [q, setQ] = useState("");
  const trashed = Object.values(pages)
    .filter((p) => p.trashed)
    .filter((p) => !q.trim() || normalize(pageTitle(p)).includes(normalize(q.trim())))
    .sort((a, b) => (b.trashedAt || 0) - (a.trashedAt || 0));
  return (
    <div className="simple-page">
      <h1 className="sp-title">Trash</h1>
      <p className="muted">Pages in the Trash stay here until you delete them permanently.</p>
      <div className="sp-toolbar">
        <input className="sp-search" placeholder="Search pages in Trash…" value={q} onChange={(e) => setQ(e.target.value)} />
        <span style={{ flex: 1 }} />
        {trashed.length > 0 && (
          <button
            type="button"
            className="btn danger"
            onClick={() => confirm("Permanently delete everything in the Trash? This cannot be undone.") && emptyTrash()}
          >
            Empty Trash
          </button>
        )}
      </div>
      <div className="trash-list">
        {trashed.length === 0 && <div className="agenda-empty">The Trash is empty.</div>}
        {trashed.map((p) => {
          const parent = p.parentId ? pages[p.parentId] : null;
          return (
            <div key={p.id} className="trash-item">
              <span className="trash-main" onClick={() => openPage(p.id)}>
                <PageIcon icon={p.icon} type={p.type} size={18} />
                <span className="trash-title">{pageTitle(p)}</span>
                {parent && <span className="muted small">in {pageTitle(parent)}</span>}
              </span>
              <span className="muted small">{p.trashedAt ? formatDistanceToNow(p.trashedAt, { addSuffix: true }) : ""}</span>
              <button type="button" className="icon-btn" title="Restore" onClick={() => restorePage(p.id)}>
                <RotateCcw size={16} />
              </button>
              <button
                type="button"
                className="icon-btn"
                title="Delete permanently"
                onClick={() => confirm(`Permanently delete “${pageTitle(p)}”?`) && deletePermanently(p.id)}
              >
                <TrashIcon size={16} />
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
