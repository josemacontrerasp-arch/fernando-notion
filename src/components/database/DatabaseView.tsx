import { useMemo, useState } from "react";
import { viewRows } from "../../lib/db";
import { addRow, openPeek, setActiveView, useApp } from "../../lib/store";
import type { ID, Page } from "../../lib/types";
import { BoardView } from "./BoardView";
import { CalendarView } from "./CalendarView";
import { GalleryView, ListView } from "./CardViews";
import { TableView } from "./TableView";
import { TimelineView } from "./TimelineView";
import { DbToolbar, ViewTabs } from "./Toolbar";
import { defaultsFromFilters } from "./shared";

/** Renders a database (tabs, toolbar and the active view). */
export function DatabaseView({ dbId, inline, header }: { dbId: ID; inline?: boolean; header?: React.ReactNode }) {
  const db = useApp((s) => s.pages[dbId]) as Page | undefined;
  const pages = useApp((s) => s.pages);
  const activeId = useApp((s) => s.activeViews[dbId]);
  const weekStartsOn = useApp((s) => s.meta.settings.weekStartsOn);
  const [search, setSearch] = useState("");
  const schema = db?.db;
  const view = schema?.views.find((v) => v.id === activeId) || schema?.views[0];
  const readOnly = !!db?.locked;

  const rows = useMemo(
    () => (db && view ? viewRows(db, view, pages, { search, weekStartsOn }) : []),
    [db, view, pages, search, weekStartsOn],
  );

  if (!db || !schema || !view) return <div className="db-missing">This database was deleted.</div>;

  const onNew = () => {
    const id = addRow(db.id, defaultsFromFilters(view, schema));
    openPeek(id);
    useApp.setState({ focusTitle: id });
  };

  return (
    <div className={inline ? "database inline" : "database"}>
      {header}
      <div className="db-bar">
        <ViewTabs dbId={db.id} views={schema.views} activeId={view.id} />
        <DbToolbar db={db} view={view} search={search} setSearch={setSearch} onNew={onNew} readOnly={readOnly} />
      </div>
      <div className="db-body">
        {view.type === "table" && <TableView db={db} view={view} rows={rows} readOnly={readOnly} />}
        {view.type === "board" && <BoardView db={db} view={view} rows={rows} readOnly={readOnly} />}
        {view.type === "calendar" && <CalendarView db={db} view={view} rows={rows} readOnly={readOnly} />}
        {view.type === "timeline" && <TimelineView db={db} view={view} rows={rows} readOnly={readOnly} />}
        {view.type === "list" && <ListView db={db} view={view} rows={rows} readOnly={readOnly} />}
        {view.type === "gallery" && <GalleryView db={db} view={view} rows={rows} readOnly={readOnly} />}
      </div>
    </div>
  );
}

export { setActiveView };
