// Database helpers: property defaults, filtering, sorting and grouping rows.

import { addDays, endOfWeek, isSameDay, startOfDay, startOfWeek } from "date-fns";
import type {
  DatabaseSchema,
  DatabaseView,
  DateValue,
  Filter,
  FilterOp,
  Page,
  PropertyDef,
  PropertyType,
  PropertyValue,
  SelectOption,
  ViewType,
} from "./types";
import { formatDateValue, isDateValue, normalize, pageTitle, parseDateStr, uid } from "./utils";

export const PROPERTY_TYPES: { type: PropertyType; label: string }[] = [
  { type: "text", label: "Text" },
  { type: "number", label: "Number" },
  { type: "select", label: "Select" },
  { type: "multi_select", label: "Multi-select" },
  { type: "status", label: "Status" },
  { type: "date", label: "Date" },
  { type: "checkbox", label: "Checkbox" },
  { type: "person", label: "Person" },
  { type: "url", label: "URL" },
  { type: "email", label: "Email" },
  { type: "phone", label: "Phone" },
  { type: "relation", label: "Relation" },
  { type: "created_time", label: "Created time" },
  { type: "last_edited_time", label: "Last edited time" },
];

export const VIEW_TYPES: { type: ViewType; label: string }[] = [
  { type: "table", label: "Table" },
  { type: "board", label: "Board" },
  { type: "calendar", label: "Calendar" },
  { type: "timeline", label: "Timeline" },
  { type: "list", label: "List" },
  { type: "gallery", label: "Gallery" },
];

export function typeLabel(t: PropertyType) {
  if (t === "title") return "Title";
  return PROPERTY_TYPES.find((x) => x.type === t)?.label || t;
}

export const defaultStatusOptions = (): SelectOption[] => [
  { id: uid(), name: "Not started", color: "gray", group: "todo" },
  { id: uid(), name: "In progress", color: "blue", group: "in_progress" },
  { id: uid(), name: "Done", color: "green", group: "complete" },
];

export function newProperty(type: PropertyType, name?: string): PropertyDef {
  const prop: PropertyDef = { id: uid(), name: name || typeLabel(type), type };
  if (type === "select" || type === "multi_select") prop.options = [];
  if (type === "status") prop.options = defaultStatusOptions();
  if (type === "number") prop.numberFormat = "number";
  if (type === "relation") prop.relationDatabaseId = null;
  return prop;
}

export function newView(type: ViewType, schema: DatabaseSchema, name?: string): DatabaseView {
  const view: DatabaseView = {
    id: uid(),
    name: name || VIEW_TYPES.find((v) => v.type === type)?.label || "View",
    type,
    filters: [],
    sorts: [],
  };
  if (type === "board") {
    const g = schema.properties.find((p) => p.type === "status") || schema.properties.find((p) => p.type === "select");
    view.groupBy = g?.id ?? null;
  }
  if (type === "calendar" || type === "timeline") {
    view.dateProperty = schema.properties.find((p) => p.type === "date")?.id ?? null;
  }
  if (type === "calendar") view.calendarMode = "month";
  if (type === "timeline") view.timelineScale = "week";
  if (type === "gallery") {
    view.cardPreview = "cover";
    view.cardSize = "medium";
  }
  return view;
}

export function newDatabaseSchema(): DatabaseSchema {
  const title: PropertyDef = { id: "title", name: "Name", type: "title" };
  const schema: DatabaseSchema = { properties: [title], views: [], rowOrder: [] };
  schema.views.push(newView("table", schema, "Table"));
  return schema;
}

// -------------------------------------------------------------- values ----

export function getValue(row: Page, prop: PropertyDef): PropertyValue {
  switch (prop.type) {
    case "title":
      return row.title;
    case "created_time":
      return row.createdAt;
    case "last_edited_time":
      return row.updatedAt;
    default:
      return row.props?.[prop.id];
  }
}

export function isEmptyValue(v: PropertyValue): boolean {
  if (v === null || v === undefined || v === "") return true;
  if (Array.isArray(v)) return v.length === 0;
  if (isDateValue(v)) return !v.start;
  return false;
}

export function optionById(prop: PropertyDef, id: unknown): SelectOption | undefined {
  return prop.options?.find((o) => o.id === id);
}

export function formatNumber(n: number, fmt: PropertyDef["numberFormat"] = "number") {
  if (typeof n !== "number" || Number.isNaN(n)) return "";
  switch (fmt) {
    case "percent":
      return `${n}%`;
    case "dollar":
      return n.toLocaleString(undefined, { style: "currency", currency: "USD" });
    case "euro":
      return n.toLocaleString(undefined, { style: "currency", currency: "EUR" });
    case "pound":
      return n.toLocaleString(undefined, { style: "currency", currency: "GBP" });
    default:
      return n.toLocaleString();
  }
}

/** Text representation used for searching, sorting and exports. */
export function valueToText(row: Page, prop: PropertyDef, pages?: Record<string, Page>): string {
  const v = getValue(row, prop);
  if (isEmptyValue(v)) return "";
  switch (prop.type) {
    case "select":
    case "status":
      return optionById(prop, v)?.name || "";
    case "multi_select":
      return (v as string[]).map((id) => optionById(prop, id)?.name || "").filter(Boolean).join(", ");
    case "date":
      return formatDateValue(v as DateValue);
    case "checkbox":
      return v ? "Yes" : "No";
    case "number":
      return formatNumber(v as number, prop.numberFormat);
    case "relation":
      return (v as string[]).map((id) => pageTitle(pages?.[id])).join(", ");
    case "created_time":
    case "last_edited_time":
      return new Date(v as number).toLocaleString();
    default:
      return String(v);
  }
}

// ------------------------------------------------------------- filters ----

export function opsFor(type: PropertyType): { op: FilterOp; label: string }[] {
  switch (type) {
    case "number":
      return [
        { op: "is", label: "=" },
        { op: "is_not", label: "≠" },
        { op: "gt", label: ">" },
        { op: "lt", label: "<" },
        { op: "is_empty", label: "Is empty" },
        { op: "is_not_empty", label: "Is not empty" },
      ];
    case "select":
    case "status":
      return [
        { op: "is", label: "Is" },
        { op: "is_not", label: "Is not" },
        { op: "is_empty", label: "Is empty" },
        { op: "is_not_empty", label: "Is not empty" },
      ];
    case "multi_select":
    case "relation":
      return [
        { op: "contains", label: "Contains" },
        { op: "not_contains", label: "Does not contain" },
        { op: "is_empty", label: "Is empty" },
        { op: "is_not_empty", label: "Is not empty" },
      ];
    case "checkbox":
      return [
        { op: "checked", label: "Is checked" },
        { op: "unchecked", label: "Is not checked" },
      ];
    case "date":
    case "created_time":
    case "last_edited_time":
      return [
        { op: "today", label: "Is today" },
        { op: "this_week", label: "Is this week" },
        { op: "next_7_days", label: "Within next 7 days" },
        { op: "past", label: "Is in the past" },
        { op: "future", label: "Is today or later" },
        { op: "on", label: "Is on" },
        { op: "before", label: "Is before" },
        { op: "after", label: "Is after" },
        { op: "is_empty", label: "Is empty" },
        { op: "is_not_empty", label: "Is not empty" },
      ];
    default:
      return [
        { op: "contains", label: "Contains" },
        { op: "not_contains", label: "Does not contain" },
        { op: "is", label: "Is" },
        { op: "is_not", label: "Is not" },
        { op: "is_empty", label: "Is empty" },
        { op: "is_not_empty", label: "Is not empty" },
      ];
  }
}

export function opNeedsValue(op: FilterOp) {
  return !["is_empty", "is_not_empty", "checked", "unchecked", "today", "this_week", "next_7_days", "past", "future"].includes(op);
}

function dateOf(v: PropertyValue): Date | null {
  if (typeof v === "number") return new Date(v);
  if (isDateValue(v)) return parseDateStr(v.start);
  return null;
}

function dateEndOf(v: PropertyValue): Date | null {
  if (isDateValue(v) && v.end) return parseDateStr(v.end);
  return dateOf(v);
}

export function matchesFilter(row: Page, prop: PropertyDef, f: Filter, weekStartsOn: 0 | 1 = 1): boolean {
  const v = getValue(row, prop);
  const empty = isEmptyValue(v);
  switch (f.op) {
    case "is_empty":
      return empty;
    case "is_not_empty":
      return !empty;
    case "checked":
      return v === true;
    case "unchecked":
      return v !== true;
  }
  if (prop.type === "date" || prop.type === "created_time" || prop.type === "last_edited_time") {
    const d = dateOf(v);
    const dEnd = dateEndOf(v);
    if (!d || !dEnd) return false;
    const today = startOfDay(new Date());
    const s = startOfDay(d);
    const e = startOfDay(dEnd);
    switch (f.op) {
      case "today":
        return s <= today && e >= today;
      case "this_week": {
        const ws = startOfWeek(today, { weekStartsOn });
        const we = endOfWeek(today, { weekStartsOn });
        return e >= ws && s <= we;
      }
      case "next_7_days":
        return e >= today && s <= addDays(today, 7);
      case "past":
        return e < today;
      case "future":
        return e >= today;
      case "on": {
        const t = parseDateStr(f.value);
        return !!t && isSameDay(s, t);
      }
      case "before": {
        const t = parseDateStr(f.value);
        return !!t && s < startOfDay(t);
      }
      case "after": {
        const t = parseDateStr(f.value);
        return !!t && s > startOfDay(t);
      }
    }
    return true;
  }
  if (prop.type === "number") {
    const n = typeof v === "number" ? v : NaN;
    const t = Number(f.value);
    if (f.value === undefined || f.value === "" || Number.isNaN(t)) return true;
    switch (f.op) {
      case "is":
        return n === t;
      case "is_not":
        return n !== t;
      case "gt":
        return n > t;
      case "lt":
        return n < t;
    }
    return true;
  }
  if (prop.type === "select" || prop.type === "status") {
    if (!f.value) return true;
    if (f.op === "is") return v === f.value;
    if (f.op === "is_not") return v !== f.value;
    return true;
  }
  if (prop.type === "multi_select" || prop.type === "relation") {
    if (!f.value) return true;
    const arr = Array.isArray(v) ? v : [];
    if (f.op === "contains") return arr.includes(f.value);
    if (f.op === "not_contains") return !arr.includes(f.value);
    return true;
  }
  // text-like
  const text = normalize(String(v ?? ""));
  const q = normalize(String(f.value ?? ""));
  if (!q) return true;
  switch (f.op) {
    case "contains":
      return text.includes(q);
    case "not_contains":
      return !text.includes(q);
    case "is":
      return text === q;
    case "is_not":
      return text !== q;
  }
  return true;
}

// --------------------------------------------------------------- sorts ----

function sortKey(row: Page, prop: PropertyDef): string | number | null {
  const v = getValue(row, prop);
  if (isEmptyValue(v)) return null;
  switch (prop.type) {
    case "number":
    case "created_time":
    case "last_edited_time":
      return v as number;
    case "checkbox":
      return v ? 1 : 0;
    case "date":
      return (v as DateValue).start;
    case "select":
    case "status": {
      const idx = prop.options?.findIndex((o) => o.id === v) ?? -1;
      return idx;
    }
    default:
      return normalize(String(valueToText(row, prop)));
  }
}

export function compareRows(a: Page, b: Page, prop: PropertyDef, dir: "asc" | "desc") {
  const ka = sortKey(a, prop);
  const kb = sortKey(b, prop);
  if (ka === null && kb === null) return 0;
  if (ka === null) return 1; // empty values always last
  if (kb === null) return -1;
  const r = ka < kb ? -1 : ka > kb ? 1 : 0;
  return dir === "asc" ? r : -r;
}

/** Rows of a database for a given view: filtered, sorted, ordered. */
export function viewRows(
  db: Page,
  view: DatabaseView,
  pages: Record<string, Page>,
  opts: { search?: string; weekStartsOn?: 0 | 1 } = {},
): Page[] {
  const schema = db.db!;
  const order = new Map(schema.rowOrder.map((id, i) => [id, i]));
  let rows = Object.values(pages).filter((p) => p.parentId === db.id && p.isRow && !p.trashed);
  rows.sort((a, b) => (order.get(a.id) ?? 1e9) - (order.get(b.id) ?? 1e9) || a.createdAt - b.createdAt);
  for (const f of view.filters) {
    const prop = schema.properties.find((p) => p.id === f.propertyId);
    if (prop) rows = rows.filter((r) => matchesFilter(r, prop, f, opts.weekStartsOn));
  }
  if (opts.search) {
    const q = normalize(opts.search);
    rows = rows.filter((r) =>
      schema.properties.some((p) => normalize(valueToText(r, p, pages)).includes(q)),
    );
  }
  const sorts = view.sorts
    .map((s) => ({ s, prop: schema.properties.find((p) => p.id === s.propertyId) }))
    .filter((x) => x.prop);
  if (sorts.length) {
    rows = [...rows].sort((a, b) => {
      for (const { s, prop } of sorts) {
        const r = compareRows(a, b, prop!, s.dir);
        if (r !== 0) return r;
      }
      return 0;
    });
  }
  return rows;
}

export function visibleProps(schema: DatabaseSchema, view: DatabaseView): PropertyDef[] {
  const hidden = new Set(view.hidden || []);
  return schema.properties.filter((p) => !hidden.has(p.id));
}

/** Is a row "done"? Used by the agenda checkboxes. */
export function completionProp(schema: DatabaseSchema): PropertyDef | undefined {
  return (
    schema.properties.find((p) => p.type === "status") ||
    schema.properties.find((p) => p.type === "checkbox")
  );
}

export function isRowDone(row: Page, schema: DatabaseSchema): boolean {
  const prop = completionProp(schema);
  if (!prop) return false;
  const v = row.props?.[prop.id];
  if (prop.type === "checkbox") return v === true;
  return optionById(prop, v)?.group === "complete";
}

export function doneValue(schema: DatabaseSchema, done: boolean): { propId: string; value: PropertyValue } | null {
  const prop = completionProp(schema);
  if (!prop) return null;
  if (prop.type === "checkbox") return { propId: prop.id, value: done };
  const opt = prop.options?.find((o) => o.group === (done ? "complete" : "todo")) || prop.options?.[0];
  return { propId: prop.id, value: opt?.id ?? null };
}

export function firstDateProp(schema: DatabaseSchema): PropertyDef | undefined {
  const cal = schema.views.find((v) => (v.type === "calendar" || v.type === "timeline") && v.dateProperty);
  return (
    (cal && schema.properties.find((p) => p.id === cal.dateProperty)) ||
    schema.properties.find((p) => p.type === "date")
  );
}
