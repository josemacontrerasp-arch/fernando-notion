// Central application state (zustand) and every action that changes it.
// Persistence (persist.ts) watches this store and writes changed pages to disk.

import { create } from "zustand";
import type {
  DatabaseSchema,
  DatabaseView,
  ID,
  Meta,
  Page,
  PropertyDef,
  PropertyType,
  PropertyValue,
  Route,
  SelectOption,
  Settings,
  ViewType,
  WorkspaceData,
  Color,
} from "./types";
import { newDatabaseSchema, newProperty, newView, optionById, valueToText } from "./db";
import { colorForString, isDateValue, uid } from "./utils";

export interface Toast {
  id: string;
  message: string;
  action?: { label: string; run: () => void };
}

export interface AppState {
  loaded: boolean;
  loadErrors: string[];
  pages: Record<ID, Page>;
  meta: Meta;
  route: Route;
  backStack: Route[];
  fwdStack: Route[];
  peekId: ID | null;
  quickFind: boolean;
  saveStatus: "saved" | "saving" | "error";
  toasts: Toast[];
  activeViews: Record<ID, ID>;
  /** Page id whose title input should grab focus once rendered. */
  focusTitle: ID | null;
}

export const defaultSettings = (): Settings => ({
  theme: "system",
  workspaceName: "Fernando's Workspace",
  userName: "Fernando",
  weekStartsOn: 1,
  sidebarWidth: 260,
  sidebarCollapsed: false,
  defaultTaskDb: null,
  defaultEventDb: null,
  hiddenCalendars: [],
  onboarded: false,
});

export const defaultMeta = (): Meta => ({
  version: 1,
  rootOrder: [],
  favorites: [],
  recent: [],
  settings: defaultSettings(),
});

function readActiveViews(): Record<ID, ID> {
  try {
    return JSON.parse(localStorage.getItem("fn.activeViews") || "{}");
  } catch {
    return {};
  }
}

export const useApp = create<AppState>(() => ({
  loaded: false,
  loadErrors: [],
  pages: {},
  meta: defaultMeta(),
  route: { kind: "home" },
  backStack: [],
  fwdStack: [],
  peekId: null,
  quickFind: false,
  saveStatus: "saved",
  toasts: [],
  activeViews: readActiveViews(),
  focusTitle: null,
}));

const get = useApp.getState;
const set = useApp.setState;

// ------------------------------------------------------------ helpers ----

const now = () => Date.now();

function insertAt<T>(arr: T[], item: T, index?: number): T[] {
  const copy = arr.filter((x) => x !== item);
  if (index === undefined || index < 0 || index > copy.length) copy.push(item);
  else copy.splice(index, 0, item);
  return copy;
}

function stripIds(blocks: any[]): any[] {
  return (blocks || []).map((b) => {
    const { id: _id, children, ...rest } = b;
    return { ...rest, ...(children?.length ? { children: stripIds(children) } : {}) };
  });
}

export function cloneBlocks(blocks: any[] | null | undefined): any[] {
  return stripIds(JSON.parse(JSON.stringify(blocks || [])));
}

/** Update one page immutably. */
function patch(id: ID, fn: (p: Page) => Partial<Page>, touch = true) {
  set((s) => {
    const page = s.pages[id];
    if (!page) return {};
    const next = { ...page, ...fn(page), ...(touch ? { updatedAt: now() } : {}) };
    return { pages: { ...s.pages, [id]: next } };
  });
}

function patchDb(dbId: ID, fn: (schema: DatabaseSchema) => DatabaseSchema) {
  patch(dbId, (p) => (p.db ? { db: fn(p.db) } : {}));
}

export function isDescendant(pages: Record<ID, Page>, id: ID, ancestorId: ID): boolean {
  let cur = pages[id];
  let guard = 0;
  while (cur && cur.parentId && guard++ < 200) {
    if (cur.parentId === ancestorId) return true;
    cur = pages[cur.parentId];
  }
  return false;
}

/** A page is visible if neither it nor any ancestor is in the trash. */
export function isAlive(pages: Record<ID, Page>, id: ID): boolean {
  let cur: Page | undefined = pages[id];
  let guard = 0;
  while (cur && guard++ < 200) {
    if (cur.trashed) return false;
    if (!cur.parentId) return true;
    cur = pages[cur.parentId];
  }
  return !!cur;
}

export function ancestors(pages: Record<ID, Page>, id: ID): Page[] {
  const out: Page[] = [];
  let cur = pages[id];
  let guard = 0;
  while (cur?.parentId && guard++ < 200) {
    const parent = pages[cur.parentId];
    if (!parent) break;
    out.unshift(parent);
    cur = parent;
  }
  return out;
}

/** All descendants of a page (sub-pages, inline databases and database rows). */
export function descendants(pages: Record<ID, Page>, id: ID): ID[] {
  const byParent = new Map<ID, ID[]>();
  for (const p of Object.values(pages)) {
    if (!p.parentId) continue;
    const list = byParent.get(p.parentId) || [];
    list.push(p.id);
    byParent.set(p.parentId, list);
  }
  const out: ID[] = [];
  const stack = [...(byParent.get(id) || [])];
  while (stack.length) {
    const cur = stack.pop()!;
    out.push(cur);
    stack.push(...(byParent.get(cur) || []));
  }
  return out;
}

// --------------------------------------------------------- integrity ----

function normalizePage(p: Page): Page {
  return {
    ...p,
    title: p.title ?? "",
    children: Array.isArray(p.children) ? p.children : [],
    content: Array.isArray(p.content) ? p.content : [],
    type: p.type === "database" ? "database" : "page",
    createdAt: p.createdAt || now(),
    updatedAt: p.updatedAt || now(),
  };
}

/** Repairs references so the tree is always consistent after loading. */
export function repairWorkspace(pagesIn: Record<ID, Page>, metaIn: Meta | null) {
  const pages: Record<ID, Page> = {};
  for (const [id, p] of Object.entries(pagesIn)) pages[id] = normalizePage({ ...p, id });
  const base = defaultMeta();
  const meta: Meta = {
    ...base,
    ...(metaIn || {}),
    settings: { ...base.settings, ...(metaIn?.settings || {}) },
  };

  // Orphans (parent missing) become root pages.
  for (const p of Object.values(pages)) {
    if (p.parentId && !pages[p.parentId]) {
      pages[p.id] = { ...p, parentId: null, isRow: false };
    }
  }
  // Children lists only contain real, non-row children; missing ones are appended.
  for (const p of Object.values(pages)) {
    const real = Object.values(pages)
      .filter((c) => c.parentId === p.id && !c.isRow)
      .map((c) => c.id);
    const realSet = new Set(real);
    const kept = p.children.filter((c) => realSet.has(c));
    const missing = real.filter((c) => !kept.includes(c));
    if (kept.length !== p.children.length || missing.length) pages[p.id] = { ...pages[p.id], children: [...kept, ...missing] };
    if (p.type === "database") {
      const db = p.db || newDatabaseSchema();
      const rows = Object.values(pages).filter((c) => c.parentId === p.id && c.isRow).map((c) => c.id);
      const rowSet = new Set(rows);
      const order = db.rowOrder.filter((r) => rowSet.has(r));
      for (const r of rows) if (!order.includes(r)) order.push(r);
      if (!db.views.length) db.views = [newView("table", db, "Table")];
      if (!db.properties.find((x) => x.type === "title")) db.properties.unshift({ id: "title", name: "Name", type: "title" });
      pages[p.id] = { ...pages[p.id], db: { ...db, rowOrder: order } };
    }
  }
  const roots = Object.values(pages)
    .filter((p) => !p.parentId)
    .map((p) => p.id);
  const rootSet = new Set(roots);
  const rootOrder = meta.rootOrder.filter((id) => rootSet.has(id));
  for (const r of roots.sort((a, b) => pages[a].createdAt - pages[b].createdAt)) if (!rootOrder.includes(r)) rootOrder.push(r);
  meta.rootOrder = rootOrder;
  meta.favorites = meta.favorites.filter((id) => pages[id]);
  meta.recent = meta.recent.filter((id) => pages[id]);
  return { pages, meta };
}

// ------------------------------------------------------------- toasts ----

export function toast(message: string, action?: Toast["action"]) {
  const t: Toast = { id: uid(), message, action };
  set((s) => ({ toasts: [...s.toasts, t] }));
  setTimeout(() => set((s) => ({ toasts: s.toasts.filter((x) => x.id !== t.id) })), action ? 6000 : 3000);
}

// --------------------------------------------------------- navigation ----

function sameRoute(a: Route, b: Route) {
  return a.kind === b.kind && (a.kind !== "page" || (b.kind === "page" && a.id === b.id));
}

export function navigate(route: Route) {
  const s = get();
  if (sameRoute(s.route, route)) return;
  const meta = { ...s.meta, lastRoute: route };
  if (route.kind === "page") {
    meta.recent = [route.id, ...s.meta.recent.filter((x) => x !== route.id)].slice(0, 24);
  }
  set({
    route,
    backStack: [...s.backStack, s.route].slice(-60),
    fwdStack: [],
    meta,
    peekId: route.kind === "page" && s.peekId === route.id ? null : s.peekId,
  });
}

export const openPage = (id: ID) => navigate({ kind: "page", id });

export function goBack() {
  const s = get();
  const prev = s.backStack[s.backStack.length - 1];
  if (!prev) return;
  set({ route: prev, backStack: s.backStack.slice(0, -1), fwdStack: [s.route, ...s.fwdStack], meta: { ...s.meta, lastRoute: prev } });
}

export function goForward() {
  const s = get();
  const next = s.fwdStack[0];
  if (!next) return;
  set({ route: next, fwdStack: s.fwdStack.slice(1), backStack: [...s.backStack, s.route], meta: { ...s.meta, lastRoute: next } });
}

export const openPeek = (id: ID | null) => set({ peekId: id });
export const setQuickFind = (open: boolean) => set({ quickFind: open });

export function setActiveView(dbId: ID, viewId: ID) {
  const activeViews = { ...get().activeViews, [dbId]: viewId };
  set({ activeViews });
  try {
    localStorage.setItem("fn.activeViews", JSON.stringify(activeViews));
  } catch {
    /* ignore */
  }
}

// ---------------------------------------------------------- settings ----

export function updateSettings(p: Partial<Settings>) {
  set((s) => ({ meta: { ...s.meta, settings: { ...s.meta.settings, ...p } } }));
}

export function toggleFavorite(id: ID) {
  set((s) => {
    const fav = s.meta.favorites.includes(id)
      ? s.meta.favorites.filter((x) => x !== id)
      : [...s.meta.favorites, id];
    return { meta: { ...s.meta, favorites: fav } };
  });
}

export function reorderFavorites(order: ID[]) {
  set((s) => ({ meta: { ...s.meta, favorites: order } }));
}

// -------------------------------------------------------------- pages ----

export interface CreatePageOpts {
  parentId?: ID | null;
  title?: string;
  icon?: string | null;
  cover?: string | null;
  type?: "page" | "database";
  inline?: boolean;
  content?: any[];
  db?: DatabaseSchema;
  index?: number;
  isRow?: boolean;
  props?: Record<ID, PropertyValue>;
  fullWidth?: boolean;
}

export function createPage(opts: CreatePageOpts = {}): ID {
  const id = uid();
  const t = now();
  const type = opts.type || "page";
  const page: Page = {
    id,
    title: opts.title ?? "",
    icon: opts.icon ?? null,
    cover: opts.cover ?? null,
    parentId: opts.parentId ?? null,
    children: [],
    type,
    inline: opts.inline,
    content: opts.content ? cloneBlocks(opts.content) : [],
    db: type === "database" ? opts.db || newDatabaseSchema() : undefined,
    isRow: opts.isRow,
    props: opts.isRow ? opts.props || {} : undefined,
    createdAt: t,
    updatedAt: t,
    rev: 0,
    fullWidth: opts.fullWidth ?? (type === "database" ? true : undefined),
  };
  set((s) => {
    const pages = { ...s.pages, [id]: page };
    let meta = s.meta;
    const parent = page.parentId ? pages[page.parentId] : null;
    if (parent && page.isRow && parent.db) {
      pages[parent.id] = { ...parent, db: { ...parent.db, rowOrder: insertAt(parent.db.rowOrder, id, opts.index) } };
    } else if (parent) {
      pages[parent.id] = { ...parent, children: insertAt(parent.children, id, opts.index) };
    } else {
      meta = { ...meta, rootOrder: insertAt(meta.rootOrder, id, opts.index) };
    }
    return { pages, meta };
  });
  return id;
}

export function newPageAndOpen(parentId: ID | null = null) {
  const id = createPage({ parentId });
  openPage(id);
  set({ focusTitle: id });
  return id;
}

export function updatePage(id: ID, p: Partial<Page>, touch = true) {
  patch(id, () => p, touch);
}

export const setTitle = (id: ID, title: string) => updatePage(id, { title });

export function setContent(id: ID, content: any[]) {
  patch(id, () => ({ content }));
}

/** Replace page content programmatically (forces open editors to reload). */
export function replaceContent(id: ID, content: any[]) {
  patch(id, (p) => ({ content: cloneBlocks(content), rev: (p.rev || 0) + 1 }));
}

export function movePage(id: ID, newParentId: ID | null, index?: number) {
  const s = get();
  const page = s.pages[id];
  if (!page || page.isRow) return;
  if (newParentId === id || (newParentId && isDescendant(s.pages, newParentId, id))) return;
  const newParent = newParentId ? s.pages[newParentId] : null;
  if (newParent && newParent.type === "database") return;
  set((st) => {
    const pages = { ...st.pages };
    let meta = st.meta;
    // remove from old location
    if (page.parentId && pages[page.parentId]) {
      const op = pages[page.parentId];
      pages[op.id] = { ...op, children: op.children.filter((c) => c !== id) };
    } else {
      meta = { ...meta, rootOrder: meta.rootOrder.filter((c) => c !== id) };
    }
    // insert in new location
    if (newParentId && pages[newParentId]) {
      const np = pages[newParentId];
      pages[np.id] = { ...np, children: insertAt(np.children, id, index) };
    } else {
      meta = { ...meta, rootOrder: insertAt(meta.rootOrder, id, index) };
    }
    pages[id] = { ...pages[id], parentId: newParentId, inline: newParentId === page.parentId ? page.inline : false };
    return { pages, meta };
  });
}

/** Deep-copies pages (with all descendants), remapping every internal id. */
function copySubtrees(source: Record<ID, Page>, rootIds: ID[]) {
  const ids = new Set<ID>();
  for (const r of rootIds) {
    ids.add(r);
    for (const d of descendants(source, r)) ids.add(d);
  }
  const map = new Map<ID, ID>();
  for (const id of ids) map.set(id, uid());
  const remap = (txt: string) => {
    let out = txt;
    for (const [a, b] of map) out = out.split(a).join(b);
    return out;
  };
  const copies: Page[] = [];
  const t = now();
  for (const id of ids) {
    const src = source[id];
    if (!src) continue;
    const json = remap(JSON.stringify(src));
    const c = JSON.parse(json) as Page;
    c.createdAt = t;
    c.updatedAt = t;
    c.rev = 0;
    copies.push(c);
  }
  return { copies, map };
}

export function duplicatePage(id: ID): ID | null {
  const s = get();
  const page = s.pages[id];
  if (!page) return null;
  const { copies, map } = copySubtrees(s.pages, [id]);
  const newId = map.get(id)!;
  set((st) => {
    const pages = { ...st.pages };
    for (const c of copies) pages[c.id] = c;
    const root = pages[newId];
    root.title = page.title ? `${page.title} (copy)` : "";
    let meta = st.meta;
    if (page.parentId && pages[page.parentId]) {
      const parent = pages[page.parentId];
      if (page.isRow && parent.db) {
        const idx = parent.db.rowOrder.indexOf(id);
        pages[parent.id] = { ...parent, db: { ...parent.db, rowOrder: insertAt(parent.db.rowOrder, newId, idx + 1) } };
      } else {
        const idx = parent.children.indexOf(id);
        pages[parent.id] = { ...parent, children: insertAt(parent.children, newId, idx + 1) };
      }
    } else {
      const idx = meta.rootOrder.indexOf(id);
      meta = { ...meta, rootOrder: insertAt(meta.rootOrder, newId, idx + 1) };
    }
    return { pages, meta };
  });
  return newId;
}

export function trashPage(id: ID) {
  const s = get();
  const page = s.pages[id];
  if (!page) return;
  patch(id, () => ({ trashed: true, trashedAt: now() }), false);
  const st = get();
  if (st.route.kind === "page" && (st.route.id === id || isDescendant(st.pages, st.route.id, id))) {
    const parent = page.parentId && isAlive(st.pages, page.parentId) ? page.parentId : null;
    navigate(parent ? { kind: "page", id: parent } : { kind: "home" });
  }
  if (st.peekId && (st.peekId === id || isDescendant(st.pages, st.peekId, id))) set({ peekId: null });
  toast(`Moved “${page.title || "Untitled"}” to Trash`, { label: "Undo", run: () => restorePage(id) });
}

export function restorePage(id: ID) {
  const s = get();
  const page = s.pages[id];
  if (!page) return;
  const parentOk = !page.parentId || (s.pages[page.parentId] && isAlive(s.pages, page.parentId));
  patch(id, () => ({ trashed: false, trashedAt: undefined }), false);
  if (!parentOk && !page.isRow) movePage(id, null);
}

export function deletePermanently(id: ID) {
  const s = get();
  const page = s.pages[id];
  if (!page) return;
  const all = [id, ...descendants(s.pages, id)];
  const del = new Set(all);
  set((st) => {
    const pages = { ...st.pages };
    for (const d of all) delete pages[d];
    if (page.parentId && pages[page.parentId]) {
      const parent = pages[page.parentId];
      pages[parent.id] = {
        ...parent,
        children: parent.children.filter((c) => !del.has(c)),
        ...(parent.db ? { db: { ...parent.db, rowOrder: parent.db.rowOrder.filter((r) => !del.has(r)) } } : {}),
      };
    }
    const meta = {
      ...st.meta,
      rootOrder: st.meta.rootOrder.filter((r) => !del.has(r)),
      favorites: st.meta.favorites.filter((r) => !del.has(r)),
      recent: st.meta.recent.filter((r) => !del.has(r)),
    };
    return { pages, meta, peekId: st.peekId && del.has(st.peekId) ? null : st.peekId };
  });
}

export function emptyTrash() {
  const s = get();
  for (const p of Object.values(s.pages)) if (p.trashed && get().pages[p.id]) deletePermanently(p.id);
}

// ----------------------------------------------------------- database ----

export function createDatabase(opts: {
  parentId?: ID | null;
  title?: string;
  icon?: string | null;
  inline?: boolean;
  viewType?: ViewType;
  index?: number;
}): ID {
  const schema = newDatabaseSchema();
  const extra: PropertyDef[] = [];
  if (opts.viewType === "board") extra.push(newProperty("status", "Status"));
  if (opts.viewType === "calendar" || opts.viewType === "timeline") extra.push(newProperty("date", "Date"));
  if (opts.viewType === "timeline") extra.push(newProperty("status", "Status"));
  schema.properties.push(...extra);
  if (opts.viewType && opts.viewType !== "table") {
    schema.views = [newView(opts.viewType, schema), newView("table", schema, "Table")];
  }
  const id = createPage({
    parentId: opts.parentId ?? null,
    title: opts.title ?? "",
    icon: opts.icon ?? null,
    type: "database",
    inline: opts.inline,
    db: schema,
    index: opts.index,
  });
  return id;
}

export function addRow(
  dbId: ID,
  props: Record<ID, PropertyValue> = {},
  opts: { title?: string; index?: number; icon?: string | null; content?: any[] } = {},
): ID {
  const db = get().pages[dbId];
  return createPage({
    parentId: dbId,
    isRow: true,
    props,
    title: opts.title ?? "",
    icon: opts.icon ?? null,
    index: opts.index,
    content: opts.content ?? db?.db?.template ?? undefined,
  });
}

export function setRowProp(rowId: ID, propId: ID, value: PropertyValue) {
  if (propId === "title") {
    setTitle(rowId, String(value ?? ""));
    return;
  }
  patch(rowId, (p) => ({ props: { ...(p.props || {}), [propId]: value } }));
}

export function setRowOrder(dbId: ID, rowOrder: ID[]) {
  patchDb(dbId, (db) => ({ ...db, rowOrder }));
}

/** Move a row before another row (or to the end when beforeId is null). */
export function moveRow(dbId: ID, rowId: ID, beforeId: ID | null) {
  patchDb(dbId, (db) => {
    const order = db.rowOrder.filter((r) => r !== rowId);
    const idx = beforeId ? order.indexOf(beforeId) : -1;
    if (idx < 0) order.push(rowId);
    else order.splice(idx, 0, rowId);
    return { ...db, rowOrder: order };
  });
}

export function addProperty(dbId: ID, type: PropertyType, name?: string, index?: number): ID {
  const prop = newProperty(type, name);
  patchDb(dbId, (db) => {
    const properties = [...db.properties];
    if (index === undefined) properties.push(prop);
    else properties.splice(index, 0, prop);
    return { ...db, properties };
  });
  return prop.id;
}

export function updateProperty(dbId: ID, propId: ID, p: Partial<PropertyDef>) {
  patchDb(dbId, (db) => ({
    ...db,
    properties: db.properties.map((x) => (x.id === propId ? { ...x, ...p } : x)),
  }));
}

/** Change a property's type, converting existing values where it makes sense. */
export function changePropertyType(dbId: ID, propId: ID, type: PropertyType) {
  const s = get();
  const dbPage = s.pages[dbId];
  const prop = dbPage?.db?.properties.find((x) => x.id === propId);
  if (!dbPage?.db || !prop || prop.type === type || prop.type === "title") return;
  const rows = Object.values(s.pages).filter((r) => r.parentId === dbId && r.isRow);
  const next: PropertyDef = { ...newProperty(type, prop.name), id: prop.id };
  const options: SelectOption[] = [];
  const optFor = (name: string): string => {
    let o = options.find((x) => x.name.toLowerCase() === name.toLowerCase());
    if (!o) {
      o = { id: uid(), name, color: colorForString(name) };
      options.push(o);
    }
    return o.id;
  };
  const isSelectish = (t: PropertyType) => t === "select" || t === "status" || t === "multi_select";
  if (isSelectish(type) && isSelectish(prop.type)) {
    options.push(...(prop.options || []).map((o) => ({ ...o })));
  }
  const converted: Record<ID, PropertyValue> = {};
  for (const r of rows) {
    const v = r.props?.[propId];
    if (v === undefined || v === null || v === "") continue;
    let nv: PropertyValue = null;
    const text = valueToText(r, prop, s.pages);
    switch (type) {
      case "text":
      case "url":
      case "email":
      case "phone":
      case "person":
        nv = text;
        break;
      case "number": {
        const n = parseFloat(String(text).replace(/[^0-9.-]/g, ""));
        nv = Number.isNaN(n) ? null : n;
        break;
      }
      case "checkbox":
        nv = v === true || /^(yes|true|1|x|done)$/i.test(text);
        break;
      case "select":
      case "status":
        if (Array.isArray(v)) nv = v[0] ?? null;
        else if (isSelectish(prop.type)) nv = v as string;
        else nv = text ? optFor(text.split(",")[0].trim()) : null;
        break;
      case "multi_select":
        if (Array.isArray(v)) nv = v;
        else if (isSelectish(prop.type)) nv = [v as string];
        else nv = text.split(",").map((t) => t.trim()).filter(Boolean).map(optFor);
        break;
      case "date": {
        if (isDateValue(v)) nv = v;
        else {
          const d = new Date(text);
          nv = Number.isNaN(d.getTime()) ? null : { start: d.toISOString().slice(0, 10) };
        }
        break;
      }
      default:
        nv = null;
    }
    converted[r.id] = nv;
  }
  if (isSelectish(type)) {
    if (type === "status" && options.length === 0) next.options = next.options || [];
    else next.options = options.map((o) => (type === "status" ? { ...o, group: o.group || "todo" } : o));
  }
  set((st) => {
    const pages = { ...st.pages };
    for (const r of rows) {
      const props = { ...(r.props || {}) };
      if (r.id in converted) props[propId] = converted[r.id];
      else delete props[propId];
      pages[r.id] = { ...r, props };
    }
    const db = pages[dbId].db!;
    pages[dbId] = {
      ...pages[dbId],
      updatedAt: now(),
      db: {
        ...db,
        properties: db.properties.map((x) => (x.id === propId ? next : x)),
        views: db.views.map((v) => ({
          ...v,
          filters: v.filters.filter((f) => f.propertyId !== propId),
          groupBy: v.groupBy === propId && !(type === "select" || type === "status") ? null : v.groupBy,
          dateProperty: v.dateProperty === propId && type !== "date" ? null : v.dateProperty,
        })),
      },
    };
    return { pages };
  });
}

export function deleteProperty(dbId: ID, propId: ID) {
  if (propId === "title") return;
  set((st) => {
    const pages = { ...st.pages };
    const dbPage = pages[dbId];
    if (!dbPage?.db) return {};
    const db = dbPage.db;
    pages[dbId] = {
      ...dbPage,
      updatedAt: now(),
      db: {
        ...db,
        properties: db.properties.filter((p) => p.id !== propId),
        views: db.views.map((v) => ({
          ...v,
          filters: v.filters.filter((f) => f.propertyId !== propId),
          sorts: v.sorts.filter((f) => f.propertyId !== propId),
          hidden: (v.hidden || []).filter((h) => h !== propId),
          groupBy: v.groupBy === propId ? null : v.groupBy,
          dateProperty: v.dateProperty === propId ? null : v.dateProperty,
        })),
      },
    };
    for (const r of Object.values(pages)) {
      if (r.parentId === dbId && r.isRow && r.props && propId in r.props) {
        const props = { ...r.props };
        delete props[propId];
        pages[r.id] = { ...r, props };
      }
    }
    return { pages };
  });
}

export function addOption(dbId: ID, propId: ID, name: string, color?: Color): SelectOption {
  const db = get().pages[dbId]?.db;
  const prop = db?.properties.find((p) => p.id === propId);
  const existing = prop?.options?.find((o) => o.name.toLowerCase() === name.toLowerCase());
  if (existing) return existing;
  const opt: SelectOption = {
    id: uid(),
    name,
    color: color || colorForString(name + (prop?.options?.length || 0)),
    ...(prop?.type === "status" ? { group: "todo" as const } : {}),
  };
  updateProperty(dbId, propId, { options: [...(prop?.options || []), opt] });
  return opt;
}

export function updateOption(dbId: ID, propId: ID, optId: ID, p: Partial<SelectOption>) {
  const prop = get().pages[dbId]?.db?.properties.find((x) => x.id === propId);
  if (!prop) return;
  updateProperty(dbId, propId, { options: (prop.options || []).map((o) => (o.id === optId ? { ...o, ...p } : o)) });
}

export function reorderOptions(dbId: ID, propId: ID, options: SelectOption[]) {
  updateProperty(dbId, propId, { options });
}

export function deleteOption(dbId: ID, propId: ID, optId: ID) {
  const s = get();
  const prop = s.pages[dbId]?.db?.properties.find((x) => x.id === propId);
  if (!prop) return;
  updateProperty(dbId, propId, { options: (prop.options || []).filter((o) => o.id !== optId) });
  set((st) => {
    const pages = { ...st.pages };
    for (const r of Object.values(pages)) {
      if (r.parentId !== dbId || !r.isRow || !r.props) continue;
      const v = r.props[propId];
      if (v === optId) pages[r.id] = { ...r, props: { ...r.props, [propId]: null } };
      else if (Array.isArray(v) && v.includes(optId))
        pages[r.id] = { ...r, props: { ...r.props, [propId]: v.filter((x) => x !== optId) } };
    }
    return { pages };
  });
}

export function addView(dbId: ID, type: ViewType, name?: string): ID {
  const dbPage = get().pages[dbId];
  if (!dbPage?.db) return "";
  const view = newView(type, dbPage.db, name);
  patchDb(dbId, (db) => ({ ...db, views: [...db.views, view] }));
  setActiveView(dbId, view.id);
  return view.id;
}

export function updateView(dbId: ID, viewId: ID, p: Partial<DatabaseView>) {
  patchDb(dbId, (db) => ({ ...db, views: db.views.map((v) => (v.id === viewId ? { ...v, ...p } : v)) }));
}

export function duplicateView(dbId: ID, viewId: ID) {
  const view = get().pages[dbId]?.db?.views.find((v) => v.id === viewId);
  if (!view) return;
  const copy: DatabaseView = { ...JSON.parse(JSON.stringify(view)), id: uid(), name: `${view.name} (copy)` };
  patchDb(dbId, (db) => {
    const views = [...db.views];
    views.splice(views.findIndex((v) => v.id === viewId) + 1, 0, copy);
    return { ...db, views };
  });
  setActiveView(dbId, copy.id);
}

export function deleteView(dbId: ID, viewId: ID) {
  patchDb(dbId, (db) => (db.views.length <= 1 ? db : { ...db, views: db.views.filter((v) => v.id !== viewId) }));
}

export function setDbTemplate(dbId: ID, template: any[] | null) {
  patchDb(dbId, (db) => ({ ...db, template }));
}

// --------------------------------------------------- comments (simple) ----

export function addComment(pageId: ID, text: string) {
  patch(pageId, (p) => ({ comments: [...(p.comments || []), { id: uid(), text, createdAt: now() }] }), false);
}

export function deleteComment(pageId: ID, commentId: ID) {
  patch(pageId, (p) => ({ comments: (p.comments || []).filter((c) => c.id !== commentId) }), false);
}

// ---------------------------------------------- import / restore data ----

/** Replace the entire workspace (used when restoring a backup). */
export function replaceWorkspace(data: WorkspaceData) {
  const map: Record<ID, Page> = {};
  for (const p of data.pages || []) if (p?.id) map[p.id] = p;
  const { pages, meta } = repairWorkspace(map, data.meta);
  meta.settings.onboarded = true;
  set({ pages, meta, route: { kind: "home" }, backStack: [], fwdStack: [], peekId: null });
}

/** Add pages from an export into the current workspace (ids are remapped). */
export function mergeWorkspace(data: WorkspaceData): number {
  const map: Record<ID, Page> = {};
  for (const p of data.pages || []) if (p?.id) map[p.id] = p;
  const repaired = repairWorkspace(map, data.meta);
  const roots = repaired.meta.rootOrder;
  const { copies, map: idMap } = copySubtrees(repaired.pages, roots);
  set((st) => {
    const pages = { ...st.pages };
    for (const c of copies) pages[c.id] = c;
    const rootOrder = [...st.meta.rootOrder, ...roots.map((r) => idMap.get(r)!).filter(Boolean)];
    return { pages, meta: { ...st.meta, rootOrder } };
  });
  return copies.length;
}

export function exportWorkspace(): WorkspaceData {
  const s = get();
  return { meta: s.meta, pages: Object.values(s.pages) };
}

/** Does a row's select/status value exist? (used to clean stale values) */
export function optionExists(prop: PropertyDef, value: unknown) {
  return !!optionById(prop, value);
}
