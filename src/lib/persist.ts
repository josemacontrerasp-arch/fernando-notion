// Auto-save: watches the store, works out which pages changed and writes only
// those (debounced). Also flushes everything when the window closes.

import type { ID, Page } from "./types";
import { fnApi, loadWorkspace, saveChanges, saveChangesSync, type SavePayload } from "./storage";
import { repairWorkspace, useApp, type AppState } from "./store";

const dirtyPages = new Set<ID>();
const deletedPages = new Set<ID>();
let metaDirty = false;
let timer: ReturnType<typeof setTimeout> | null = null;
let firstDirtyAt = 0;
let saving: Promise<void> | null = null;

// Editors keep unsaved keystrokes for a few hundred ms; they register a
// flusher so we can grab their latest content before writing to disk.
const flushers = new Set<() => void>();
export function registerFlusher(fn: () => void) {
  flushers.add(fn);
  return () => flushers.delete(fn);
}
export function flushEditors() {
  for (const f of flushers) {
    try {
      f();
    } catch (err) {
      console.error(err);
    }
  }
}

function takePayload(): SavePayload | null {
  if (!dirtyPages.size && !deletedPages.size && !metaDirty) return null;
  const s = useApp.getState();
  const pages: Page[] = [];
  for (const id of dirtyPages) if (s.pages[id]) pages.push(s.pages[id]);
  const payload: SavePayload = { pages, deletes: [...deletedPages], meta: metaDirty ? s.meta : undefined };
  dirtyPages.clear();
  deletedPages.clear();
  metaDirty = false;
  return payload;
}

function restore(payload: SavePayload) {
  // A save failed: mark everything dirty again so the next attempt retries it.
  for (const p of payload.pages) dirtyPages.add(p.id);
  for (const d of payload.deletes) deletedPages.add(d);
  if (payload.meta) metaDirty = true;
}

export async function flushNow(): Promise<void> {
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
  if (saving) await saving;
  const payload = takePayload();
  if (!payload) {
    if (useApp.getState().saveStatus !== "saved") useApp.setState({ saveStatus: "saved" });
    return;
  }
  useApp.setState({ saveStatus: "saving" });
  saving = (async () => {
    try {
      await saveChanges(payload);
      firstDirtyAt = 0;
      const pending = dirtyPages.size || deletedPages.size || metaDirty;
      useApp.setState({ saveStatus: pending ? "saving" : "saved" });
    } catch (err) {
      console.error("Save failed", err);
      restore(payload);
      useApp.setState({ saveStatus: "error" });
      schedule(3000);
    } finally {
      saving = null;
    }
  })();
  await saving;
}

function schedule(delay = 450) {
  if (!firstDirtyAt) firstDirtyAt = Date.now();
  // Never wait more than ~2s while the user keeps typing.
  const wait = Math.max(0, Math.min(delay, 2000 - (Date.now() - firstDirtyAt)));
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    timer = null;
    void flushNow();
  }, wait);
  if (useApp.getState().saveStatus === "saved") useApp.setState({ saveStatus: "saving" });
}

function onChange(s: AppState, prev: AppState) {
  if (!s.loaded || !prev.loaded) return;
  let changed = false;
  if (s.pages !== prev.pages) {
    for (const id in s.pages) {
      if (s.pages[id] !== prev.pages[id]) {
        dirtyPages.add(id);
        deletedPages.delete(id);
        changed = true;
      }
    }
    for (const id in prev.pages) {
      if (!s.pages[id]) {
        deletedPages.add(id);
        dirtyPages.delete(id);
        changed = true;
      }
    }
  }
  if (s.meta !== prev.meta) {
    metaDirty = true;
    changed = true;
  }
  if (changed) schedule();
}

/** Synchronous last-chance save (page reload / window closing). */
export function flushSync() {
  flushEditors();
  const payload = takePayload();
  if (payload) saveChangesSync(payload);
}

let started = false;

export async function boot(seed: () => void) {
  if (started) return;
  started = true;
  const data = await loadWorkspace();
  const map: Record<ID, Page> = {};
  for (const p of data.pages) if (p?.id) map[p.id] = p;
  const { pages, meta } = repairWorkspace(map, data.meta);
  const lr = meta.lastRoute;
  const route =
    lr && (lr.kind !== "page" || (pages[lr.id] && !pages[lr.id].trashed)) ? lr : ({ kind: "home" } as const);
  useApp.setState({ pages, meta, route, loaded: true, loadErrors: (data as any).errors || [] });

  useApp.subscribe(onChange);

  const isFresh = Object.keys(pages).length === 0 && !meta.settings.onboarded;
  if (isFresh) seed();
  // The repaired data might differ from disk (e.g. first launch): write it.
  if (!data.meta) {
    metaDirty = true;
    schedule(50);
  }

  window.addEventListener("beforeunload", () => flushSync());
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") {
      flushEditors();
      void flushNow();
    }
  });
  fnApi?.onFlush(async () => {
    flushEditors();
    await flushNow();
  });
}
