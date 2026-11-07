import { format } from "date-fns";
import type { DatabaseView, ID, PropertyValue, DatabaseSchema } from "../../lib/types";

/** Values a new row should get so it shows up in a filtered view. */
export function defaultsFromFilters(view: DatabaseView, schema: DatabaseSchema): Record<ID, PropertyValue> {
  const out: Record<ID, PropertyValue> = {};
  for (const f of view.filters) {
    const prop = schema.properties.find((p) => p.id === f.propertyId);
    if (!prop || prop.type === "title") continue;
    if ((prop.type === "select" || prop.type === "status") && f.op === "is" && f.value) out[prop.id] = f.value;
    else if (prop.type === "multi_select" && f.op === "contains" && f.value) out[prop.id] = [f.value];
    else if (prop.type === "relation" && f.op === "contains" && f.value) out[prop.id] = [f.value];
    else if (prop.type === "checkbox" && f.op === "checked") out[prop.id] = true;
    else if (prop.type === "date" && (f.op === "today" || f.op === "this_week" || f.op === "next_7_days" || f.op === "future"))
      out[prop.id] = { start: format(new Date(), "yyyy-MM-dd") };
    else if (prop.type === "date" && f.op === "on" && f.value) out[prop.id] = { start: f.value };
  }
  return out;
}

/** Drag & drop payload type used inside databases (never text/plain, so the editor ignores it). */
export const ROW_MIME = "application/x-fn-row";
let draggedRow: ID | null = null;
export const setDraggedRow = (id: ID | null) => {
  draggedRow = id;
};
export const getDraggedRow = () => draggedRow;
