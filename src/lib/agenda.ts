// Collects every dated row across all databases (for Home's agenda and the global calendar).
import { startOfDay } from "date-fns";
import { firstDateProp, isRowDone, completionProp } from "./db";
import { isAlive } from "./store";
import type { Color, DateValue, ID, Page, PropertyDef } from "./types";

const CAL_COLORS: Color[] = ["blue", "green", "orange", "purple", "pink", "red", "yellow", "brown", "gray"];

/** A distinct colour per calendar (database), stable by creation order. */
export function calendarColors(pages: Record<ID, Page>): Record<ID, Color> {
  const out: Record<ID, Color> = {};
  datedDatabases(pages).forEach(({ db }, i) => (out[db.id] = CAL_COLORS[i % CAL_COLORS.length]));
  return out;
}
import { isDateValue, parseDateStr } from "./utils";

export interface AgendaItem {
  row: Page;
  db: Page;
  prop: PropertyDef;
  value: DateValue;
  start: Date;
  end: Date;
  timed: boolean;
  done: boolean;
  hasCompletion: boolean;
}

export function datedDatabases(pages: Record<ID, Page>) {
  return Object.values(pages)
    .filter((p) => p.type === "database" && p.db && isAlive(pages, p.id))
    .sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id))
    .map((db) => ({ db, prop: firstDateProp(db.db!) }))
    .filter((x): x is { db: Page; prop: PropertyDef } => !!x.prop);
}

export function collectAgenda(pages: Record<ID, Page>, hidden: ID[] = []): AgendaItem[] {
  const out: AgendaItem[] = [];
  const hiddenSet = new Set(hidden);
  for (const { db, prop } of datedDatabases(pages)) {
    if (hiddenSet.has(db.id)) continue;
    const schema = db.db!;
    const hasCompletion = !!completionProp(schema);
    for (const row of Object.values(pages)) {
      if (row.parentId !== db.id || !row.isRow || row.trashed) continue;
      const v = row.props?.[prop.id];
      if (!isDateValue(v) || !v.start) continue;
      const start = parseDateStr(v.start);
      if (!start) continue;
      const end = parseDateStr(v.end) || start;
      out.push({
        row,
        db,
        prop,
        value: v,
        start,
        end,
        timed: v.start.includes("T"),
        done: isRowDone(row, schema),
        hasCompletion,
      });
    }
  }
  return out.sort((a, b) => a.start.getTime() - b.start.getTime());
}

export function overlapsDay(item: AgendaItem, day: Date) {
  const d = startOfDay(day).getTime();
  return startOfDay(item.start).getTime() <= d && startOfDay(item.end).getTime() >= d;
}
