import { Maximize2 } from "lucide-react";
import { openPage, setTitle, useApp } from "../../lib/store";
import { PageIcon } from "../Sidebar";
import { DatabaseView } from "./DatabaseView";

/** A database embedded in a page through the editor's "database" block. */
export default function InlineDatabase({ dbId }: { dbId: string }) {
  const db = useApp((s) => s.pages[dbId]);
  if (!db || db.type !== "database") return <div className="db-missing">This database no longer exists.</div>;
  if (db.trashed) return <div className="db-missing">This database is in the Trash.</div>;
  const header = (
    <div className="inline-db-head">
      <span className="inline-db-icon" onClick={() => openPage(dbId)}>
        <PageIcon icon={db.icon} type="database" size={20} />
      </span>
      <input
        className="inline-db-title"
        value={db.title}
        placeholder="Untitled database"
        readOnly={db.locked}
        onChange={(e) => setTitle(dbId, e.target.value)}
        onKeyDown={(e) => e.stopPropagation()}
      />
      <button type="button" className="icon-btn sm" title="Open as full page" onClick={() => openPage(dbId)}>
        <Maximize2 size={14} />
      </button>
    </div>
  );
  return <DatabaseView dbId={dbId} inline header={header} />;
}
