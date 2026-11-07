// Storage adapters. In the desktop app every page is written to disk through
// Electron; in a plain browser (dev / web version) IndexedDB is used instead.

import type { ID, Meta, Page, WorkspaceData } from "./types";

export interface SavePayload {
  pages: Page[];
  deletes: ID[];
  meta?: Meta;
}

export interface FnApi {
  isElectron: true;
  load(): Promise<WorkspaceData & { errors: string[]; dataDir: string }>;
  save(p: SavePayload): Promise<boolean>;
  saveSync(p: SavePayload): boolean;
  saveAsset(name: string, data: ArrayBuffer): Promise<string>;
  readAsset(url: string): Promise<string | null>;
  info(): Promise<{ version: string; platform: string; dataDir: string; isPackaged: boolean }>;
  openDataDir(): Promise<void>;
  chooseDataDir(): Promise<string | null>;
  exportFile(o: {
    defaultName: string;
    content: string;
    filters?: { name: string; extensions: string[] }[];
    encoding?: "utf8" | "base64";
  }): Promise<string | null>;
  exportPdf(o: { defaultName: string }): Promise<string | null>;
  importFile(o?: {
    filters?: { name: string; extensions: string[] }[];
    multiple?: boolean;
  }): Promise<{ name: string; content: string }[]>;
  listBackups(): Promise<{ name: string; size: number; mtime: number }[]>;
  readBackup(name: string): Promise<WorkspaceData>;
  backupNow(): Promise<string | null>;
  openExternal(url: string): Promise<void>;
  onFlush(cb: () => Promise<void> | void): void;
  onMenu(cb: (action: string) => void): void;
}

declare global {
  interface Window {
    fnApi?: FnApi;
  }
}

export const fnApi: FnApi | undefined = typeof window !== "undefined" ? window.fnApi : undefined;
export const isElectron = !!fnApi?.isElectron;

// ---------------------------------------------------------------- IndexedDB

const DB_NAME = "fernando-notion";
let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains("pages")) db.createObjectStore("pages", { keyPath: "id" });
      if (!db.objectStoreNames.contains("meta")) db.createObjectStore("meta");
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

async function idbLoad(): Promise<WorkspaceData> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(["pages", "meta"], "readonly");
    const pagesReq = tx.objectStore("pages").getAll();
    const metaReq = tx.objectStore("meta").get("meta");
    tx.oncomplete = () => resolve({ pages: pagesReq.result || [], meta: metaReq.result || null });
    tx.onerror = () => reject(tx.error);
  });
}

async function idbSave(p: SavePayload): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(["pages", "meta"], "readwrite");
    const pages = tx.objectStore("pages");
    for (const page of p.pages) pages.put(page);
    for (const id of p.deletes) pages.delete(id);
    if (p.meta) tx.objectStore("meta").put(p.meta, "meta");
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// ------------------------------------------------------------------ public

export async function loadWorkspace(): Promise<WorkspaceData & { errors?: string[] }> {
  if (fnApi) return fnApi.load();
  if (navigator.storage?.persist) {
    try {
      await navigator.storage.persist();
    } catch {
      /* ignore */
    }
  }
  return idbLoad();
}

export async function saveChanges(p: SavePayload): Promise<void> {
  if (fnApi) {
    await fnApi.save(p);
    return;
  }
  await idbSave(p);
}

/** Last-chance synchronous save (window closing / reload). */
export function saveChangesSync(p: SavePayload): void {
  if (fnApi) {
    fnApi.saveSync(p);
    return;
  }
  // IndexedDB has no sync API; fire and hope (the browser usually completes it).
  void idbSave(p);
}

function readAsDataUrl(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });
}

export async function saveAsset(file: File): Promise<string> {
  if (fnApi) return fnApi.saveAsset(file.name, await file.arrayBuffer());
  return readAsDataUrl(file);
}

/** Converts app-local asset urls into portable data: urls (for exports). */
export async function assetToPortable(url: string): Promise<string> {
  if (fnApi && url.startsWith("fnasset:")) return (await fnApi.readAsset(url)) || url;
  return url;
}

export function downloadInBrowser(name: string, content: string | Blob, mime = "text/plain") {
  const blob = typeof content === "string" ? new Blob([content], { type: mime }) : content;
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export async function saveTextFile(
  name: string,
  content: string,
  filters?: { name: string; extensions: string[] }[],
): Promise<string | null> {
  if (fnApi) return fnApi.exportFile({ defaultName: name, content, filters });
  const mime = name.endsWith(".json") ? "application/json" : name.endsWith(".html") ? "text/html" : "text/markdown";
  downloadInBrowser(name, content, mime);
  return name;
}

export function pickTextFiles(accept: string, multiple = false): Promise<{ name: string; content: string }[]> {
  if (fnApi) {
    const exts = accept
      .split(",")
      .map((s) => s.trim().replace(/^\./, ""))
      .filter(Boolean);
    return fnApi.importFile({ filters: [{ name: "Files", extensions: exts }], multiple });
  }
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = accept;
    input.multiple = multiple;
    input.onchange = async () => {
      const files = Array.from(input.files || []);
      resolve(await Promise.all(files.map(async (f) => ({ name: f.name, content: await f.text() }))));
    };
    input.click();
  });
}

export function openExternal(url: string) {
  if (fnApi) void fnApi.openExternal(url);
  else window.open(url, "_blank", "noopener");
}
