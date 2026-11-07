// Fernando Notion — Electron main process.
// Responsible for the window, the menu and for reading/writing the workspace
// on disk. Every page is stored as its own JSON file so a problem with one
// file can never wipe the whole workspace.

const {
  app,
  BrowserWindow,
  ipcMain,
  dialog,
  shell,
  protocol,
  net,
  Menu,
  nativeTheme,
  screen,
} = require("electron");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const { pathToFileURL } = require("url");

const APP_NAME = "Fernando Notion";
const DEV_URL = process.env.VITE_DEV_SERVER_URL;
const isMac = process.platform === "darwin";

app.setName(APP_NAME);
if (process.env.FN_USER_DATA) app.setPath("userData", path.resolve(process.env.FN_USER_DATA));

// Custom protocol used to show images/files saved inside the data folder.
protocol.registerSchemesAsPrivileged([
  {
    scheme: "fnasset",
    privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true, bypassCSP: true },
  },
]);

// ---------------------------------------------------------------- config ---

let config = {};
const configPath = () => path.join(app.getPath("userData"), "config.json");

function loadConfig() {
  try {
    config = JSON.parse(fs.readFileSync(configPath(), "utf8"));
  } catch {
    config = {};
  }
}

function saveConfig() {
  try {
    fs.mkdirSync(path.dirname(configPath()), { recursive: true });
    fs.writeFileSync(configPath(), JSON.stringify(config, null, 2));
  } catch (err) {
    console.error("Could not save config", err);
  }
}

// Used for the rest of this session when the configured folder can't be written.
let sessionDataDir = null;

function dataDir() {
  // FN_DATA_DIR lets you run a separate/portable workspace (also used by tests).
  if (process.env.FN_DATA_DIR) return path.resolve(process.env.FN_DATA_DIR);
  if (sessionDataDir) return sessionDataDir;
  return config.dataDir || path.join(app.getPath("documents"), APP_NAME);
}

function ensureDataDirs(dir = dataDir()) {
  for (const sub of ["", "pages", "assets", "backups"]) {
    fs.mkdirSync(path.join(dir, sub), { recursive: true });
  }
}

function isWritable(dir) {
  try {
    ensureDataDirs(dir);
    const probe = path.join(dir, `.write-test-${process.pid}`);
    fs.writeFileSync(probe, "ok");
    fs.unlinkSync(probe);
    return true;
  } catch (err) {
    console.error("Data folder is not writable:", dir, err && err.message);
    return false;
  }
}

/**
 * Makes sure pages can actually be saved. If the folder can't be written
 * (e.g. macOS access to Documents was denied, or a OneDrive/USB folder is
 * missing) we switch to a safe folder instead of silently losing edits.
 * Returns false if the user chose to quit.
 */
async function checkDataDir() {
  if (process.env.FN_DATA_DIR) {
    ensureDataDirs();
    return true;
  }
  const dir = dataDir();
  if (isWritable(dir)) return true;
  const fallback = path.join(app.getPath("userData"), "Workspace");
  const custom = !!config.dataDir;
  const macTip = isMac
    ? "\n\nTo save in Documents instead, allow access in System Settings › Privacy & Security › Files and Folders, then pick the folder again in Settings."
    : "";
  // FN_TEST_DIALOG_RESPONSE lets automated tests answer this dialog.
  const testResponse = process.env.FN_TEST_DIALOG_RESPONSE;
  const { response } = testResponse != null ? { response: Number(testResponse) } : await dialog.showMessageBox({
    type: "warning",
    buttons: custom ? ["Use a safe folder for now", "Quit"] : ["OK"],
    defaultId: 0,
    cancelId: custom ? 1 : 0,
    message: custom ? "Your Fernando Notion folder isn't available." : "Fernando Notion can't save in your Documents folder.",
    detail: `Couldn't write to:\n${dir}\n\nPages will be saved in:\n${fallback}\n\nYou can choose another folder any time in Settings › Your data.${macTip}`,
  });
  if (custom && response === 1) {
    app.quit();
    return false;
  }
  if (custom) {
    sessionDataDir = fallback; // try the user's folder again next time
  } else {
    config.dataDir = fallback;
    saveConfig();
  }
  ensureDataDirs(fallback);
  return true;
}

// ------------------------------------------------------------- file utils ---

function writeFileAtomic(file, data) {
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, data);
  try {
    fs.renameSync(tmp, file);
  } catch {
    // Some sync tools (OneDrive, Dropbox) can briefly lock files: fall back.
    fs.writeFileSync(file, data);
    try {
      fs.unlinkSync(tmp);
    } catch {}
  }
}

const safeId = (id) => String(id).replace(/[^a-zA-Z0-9_-]/g, "");
const pageFile = (id, dir = dataDir()) => path.join(dir, "pages", `${safeId(id)}.json`);

function readWorkspace(dir = dataDir()) {
  ensureDataDirs(dir);
  let meta = null;
  const errors = [];
  try {
    meta = JSON.parse(fs.readFileSync(path.join(dir, "workspace.json"), "utf8"));
  } catch (err) {
    if (err.code !== "ENOENT") errors.push(`workspace.json: ${err.message}`);
  }
  const pages = [];
  for (const name of fs.readdirSync(path.join(dir, "pages"))) {
    if (!name.endsWith(".json")) continue;
    try {
      pages.push(JSON.parse(fs.readFileSync(path.join(dir, "pages", name), "utf8")));
    } catch (err) {
      errors.push(`${name}: ${err.message}`);
    }
  }
  return { meta, pages, errors, dataDir: dir };
}

function writeChanges({ pages = [], deletes = [], meta } = {}) {
  ensureDataDirs();
  for (const page of pages) {
    if (page && page.id) writeFileAtomic(pageFile(page.id), JSON.stringify(page));
  }
  for (const id of deletes) {
    try {
      fs.unlinkSync(pageFile(id));
    } catch {}
  }
  if (meta) writeFileAtomic(path.join(dataDir(), "workspace.json"), JSON.stringify(meta, null, 2));
}

// Serialise async saves so writes never interleave.
let saveChain = Promise.resolve();
function queueSave(payload) {
  saveChain = saveChain.then(() => writeChanges(payload)).catch((err) => {
    console.error("Save failed", err);
    throw err;
  });
  return saveChain;
}

// ---------------------------------------------------------------- backups ---

const today = () => new Date().toISOString().slice(0, 10);

function backupNow(label = today()) {
  const ws = readWorkspace();
  if (!ws.meta && ws.pages.length === 0) return null;
  const file = path.join(dataDir(), "backups", `backup-${label}.json`);
  writeFileAtomic(file, JSON.stringify({ app: APP_NAME, createdAt: Date.now(), meta: ws.meta, pages: ws.pages }));
  pruneBackups();
  return file;
}

function pruneBackups(keep = 30) {
  const dir = path.join(dataDir(), "backups");
  const files = fs
    .readdirSync(dir)
    .filter((f) => f.startsWith("backup-") && f.endsWith(".json"))
    .sort();
  for (const f of files.slice(0, Math.max(0, files.length - keep))) {
    try {
      fs.unlinkSync(path.join(dir, f));
    } catch {}
  }
}

function dailyBackup() {
  try {
    const file = path.join(dataDir(), "backups", `backup-${today()}.json`);
    if (!fs.existsSync(file)) backupNow();
  } catch (err) {
    console.error("Backup failed", err);
  }
}

// ------------------------------------------------------------------- IPC ---

function registerIpc() {
  ipcMain.handle("ws:load", () => readWorkspace());
  ipcMain.handle("ws:save", (_e, payload) => queueSave(payload).then(() => true));
  ipcMain.on("ws:saveSync", (e, payload) => {
    try {
      writeChanges(payload);
      e.returnValue = true;
    } catch (err) {
      console.error(err);
      e.returnValue = false;
    }
  });

  ipcMain.handle("asset:save", (_e, { name, data }) => {
    ensureDataDirs();
    const clean = String(name || "file").replace(/[^a-zA-Z0-9._-]+/g, "-").slice(-80) || "file";
    const fileName = `${crypto.randomUUID().slice(0, 8)}-${clean}`;
    fs.writeFileSync(path.join(dataDir(), "assets", fileName), Buffer.from(data));
    return `fnasset://local/${encodeURIComponent(fileName)}`;
  });

  ipcMain.handle("asset:read", (_e, url) => {
    // Used when exporting: turn an fnasset:// url into a data: url.
    try {
      const u = new URL(url);
      const file = resolveAsset(u);
      if (!file) return null;
      const ext = path.extname(file).slice(1).toLowerCase();
      const mime =
        { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", webp: "image/webp", svg: "image/svg+xml" }[ext] ||
        "application/octet-stream";
      return `data:${mime};base64,${fs.readFileSync(file).toString("base64")}`;
    } catch {
      return null;
    }
  });

  ipcMain.handle("app:info", () => ({
    version: app.getVersion(),
    platform: process.platform,
    dataDir: dataDir(),
    isPackaged: app.isPackaged,
  }));

  ipcMain.handle("dir:open", () => shell.openPath(dataDir()));

  ipcMain.handle("dir:choose", async (e) => {
    const win = BrowserWindow.fromWebContents(e.sender);
    const res = await dialog.showOpenDialog(win, {
      title: "Choose where Fernando Notion keeps your pages",
      properties: ["openDirectory", "createDirectory"],
    });
    if (res.canceled || !res.filePaths[0]) return null;
    const target = res.filePaths[0];
    if (path.resolve(target) === path.resolve(dataDir())) return null;
    const hasWorkspace = fs.existsSync(path.join(target, "workspace.json"));
    if (hasWorkspace) {
      const { response } = await dialog.showMessageBox(win, {
        type: "question",
        buttons: ["Open that workspace", "Cancel"],
        defaultId: 0,
        cancelId: 1,
        message: "This folder already contains a Fernando Notion workspace.",
        detail: "Switch to the workspace in that folder? Your current folder is left untouched.",
      });
      if (response !== 0) return null;
    } else {
      // Copy the current workspace into the new folder.
      ensureDataDirs(target);
      for (const sub of ["pages", "assets"]) {
        const from = path.join(dataDir(), sub);
        if (!fs.existsSync(from)) continue;
        for (const f of fs.readdirSync(from)) {
          fs.copyFileSync(path.join(from, f), path.join(target, sub, f));
        }
      }
      const metaFile = path.join(dataDir(), "workspace.json");
      if (fs.existsSync(metaFile)) fs.copyFileSync(metaFile, path.join(target, "workspace.json"));
    }
    config.dataDir = target;
    sessionDataDir = null;
    saveConfig();
    return target;
  });

  ipcMain.handle("file:export", async (e, { defaultName, content, filters, encoding }) => {
    const win = BrowserWindow.fromWebContents(e.sender);
    const res = await dialog.showSaveDialog(win, {
      defaultPath: path.join(app.getPath("downloads"), defaultName || "export.txt"),
      filters: filters || [{ name: "All files", extensions: ["*"] }],
    });
    if (res.canceled || !res.filePath) return null;
    fs.writeFileSync(res.filePath, encoding === "base64" ? Buffer.from(content, "base64") : content);
    return res.filePath;
  });

  ipcMain.handle("file:exportPdf", async (e, { defaultName }) => {
    const win = BrowserWindow.fromWebContents(e.sender);
    const res = await dialog.showSaveDialog(win, {
      defaultPath: path.join(app.getPath("downloads"), defaultName || "page.pdf"),
      filters: [{ name: "PDF", extensions: ["pdf"] }],
    });
    if (res.canceled || !res.filePath) return null;
    const pdf = await e.sender.printToPDF({ printBackground: true, pageSize: "A4", margins: { marginType: "default" } });
    fs.writeFileSync(res.filePath, pdf);
    shell.openPath(res.filePath);
    return res.filePath;
  });

  ipcMain.handle("file:import", async (e, { filters, multiple }) => {
    const win = BrowserWindow.fromWebContents(e.sender);
    const res = await dialog.showOpenDialog(win, {
      properties: multiple ? ["openFile", "multiSelections"] : ["openFile"],
      filters: filters || [{ name: "All files", extensions: ["*"] }],
    });
    if (res.canceled) return [];
    return res.filePaths.map((p) => ({ name: path.basename(p), content: fs.readFileSync(p, "utf8") }));
  });

  ipcMain.handle("backup:list", () => {
    const dir = path.join(dataDir(), "backups");
    ensureDataDirs();
    return fs
      .readdirSync(dir)
      .filter((f) => f.endsWith(".json"))
      .map((f) => ({ name: f, size: fs.statSync(path.join(dir, f)).size, mtime: fs.statSync(path.join(dir, f)).mtimeMs }))
      .sort((a, b) => b.mtime - a.mtime);
  });

  ipcMain.handle("backup:read", (_e, name) => {
    const file = path.join(dataDir(), "backups", path.basename(name));
    return JSON.parse(fs.readFileSync(file, "utf8"));
  });

  ipcMain.handle("backup:now", () => {
    const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
    return backupNow(stamp);
  });

  ipcMain.handle("shell:openExternal", (_e, url) => {
    if (/^(https?:|mailto:|tel:)/i.test(url)) return shell.openExternal(url);
    return false;
  });
}

function resolveAsset(u) {
  const base = path.join(dataDir(), "assets");
  const name = decodeURIComponent(u.pathname.replace(/^\/+/, ""));
  const file = path.normalize(path.join(base, name));
  if (!file.startsWith(base)) return null;
  return fs.existsSync(file) ? file : null;
}

// ---------------------------------------------------------------- window ---

let mainWindow = null;
let quitting = false;
app.on("before-quit", () => {
  quitting = true;
});

function windowBounds() {
  const b = config.bounds;
  const fallback = { width: 1320, height: 860 };
  if (!b) return fallback;
  const visible = screen.getAllDisplays().some((d) => {
    const a = d.workArea;
    return b.x >= a.x - 50 && b.y >= a.y - 50 && b.x < a.x + a.width - 100 && b.y < a.y + a.height - 100;
  });
  return visible ? b : { width: b.width || fallback.width, height: b.height || fallback.height };
}

function createWindow() {
  const bounds = windowBounds();
  const iconPath = path.join(__dirname, "..", "build", "icon.png");
  mainWindow = new BrowserWindow({
    ...bounds,
    minWidth: 720,
    minHeight: 480,
    title: APP_NAME,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: nativeTheme.shouldUseDarkColors ? "#191919" : "#ffffff",
    icon: fs.existsSync(iconPath) ? iconPath : undefined,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: true,
    },
  });

  if (config.maximized) mainWindow.maximize();
  mainWindow.once("ready-to-show", () => mainWindow.show());

  if (DEV_URL) mainWindow.loadURL(DEV_URL);
  else mainWindow.loadFile(path.join(__dirname, "..", "dist", "index.html"));

  // Open web links in the normal browser, never inside the app.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^(https?:|mailto:|tel:)/i.test(url)) shell.openExternal(url);
    return { action: "deny" };
  });
  mainWindow.webContents.on("will-navigate", (e, url) => {
    const current = mainWindow.webContents.getURL();
    if (url.split("#")[0] !== current.split("#")[0]) {
      e.preventDefault();
      if (/^(https?:|mailto:|tel:)/i.test(url)) shell.openExternal(url);
    }
  });

  // Right-click menu with spelling suggestions.
  mainWindow.webContents.on("context-menu", (_e, params) => {
    const items = [];
    for (const s of (params.dictionarySuggestions || []).slice(0, 6)) {
      items.push({ label: s, click: () => mainWindow.webContents.replaceMisspelling(s) });
    }
    if (params.misspelledWord) {
      items.push({
        label: "Add to dictionary",
        click: () => mainWindow.webContents.session.addWordToSpellCheckerDictionary(params.misspelledWord),
      });
      items.push({ type: "separator" });
    }
    if (params.linkURL && /^https?:/i.test(params.linkURL)) {
      items.push({ label: "Open link in browser", click: () => shell.openExternal(params.linkURL) });
      items.push({ type: "separator" });
    }
    if (params.isEditable) {
      items.push({ role: "cut" }, { role: "copy" }, { role: "paste" }, { type: "separator" }, { role: "selectAll" });
    } else if (params.selectionText) {
      items.push({ role: "copy" });
    }
    if (items.length) Menu.buildFromTemplate(items).popup({ window: mainWindow });
  });

  // Make sure the last edits are written before the window closes.
  let allowClose = false;
  mainWindow.on("close", (e) => {
    try {
      config.maximized = mainWindow.isMaximized();
      if (!config.maximized) config.bounds = mainWindow.getBounds();
      saveConfig();
    } catch {}
    if (allowClose) return;
    e.preventDefault();
    const done = () => {
      allowClose = true;
      clearTimeout(timer);
      ipcMain.removeListener("app:flushed", done);
      dailyBackup();
      if (mainWindow && !mainWindow.isDestroyed()) mainWindow.close();
      if (quitting) app.quit();
    };
    const timer = setTimeout(done, 4000);
    ipcMain.once("app:flushed", done);
    mainWindow.webContents.send("app:flush");
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

function buildMenu() {
  const send = (action) => mainWindow && mainWindow.webContents.send("menu", action);
  const template = [
    ...(isMac
      ? [
          {
            label: APP_NAME,
            submenu: [
              { role: "about" },
              { type: "separator" },
              { label: "Settings…", accelerator: "Cmd+,", click: () => send("settings") },
              { type: "separator" },
              { role: "services" },
              { type: "separator" },
              { role: "hide" },
              { role: "hideOthers" },
              { role: "unhide" },
              { type: "separator" },
              { role: "quit" },
            ],
          },
        ]
      : []),
    {
      label: "File",
      submenu: [
        { label: "New Page", click: () => send("new-page") },
        { label: "Search…", click: () => send("search") },
        { type: "separator" },
        { label: "Open Data Folder", click: () => shell.openPath(dataDir()) },
        ...(isMac ? [] : [{ label: "Settings", click: () => send("settings") }]),
        { type: "separator" },
        isMac ? { role: "close" } : { role: "quit" },
      ],
    },
    { role: "editMenu" },
    {
      label: "View",
      submenu: [
        { label: "Toggle Sidebar", click: () => send("toggle-sidebar") },
        { label: "Toggle Dark Mode", click: () => send("toggle-theme") },
        { type: "separator" },
        { role: "resetZoom" },
        { role: "zoomIn" },
        { role: "zoomOut" },
        { type: "separator" },
        { role: "togglefullscreen" },
        { type: "separator" },
        { role: "reload" },
        { role: "toggleDevTools" },
      ],
    },
    { role: "windowMenu" },
    {
      role: "help",
      submenu: [{ label: "Open Data Folder", click: () => shell.openPath(dataDir()) }],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

// ------------------------------------------------------------------- boot ---

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.whenReady().then(async () => {
    loadConfig();
    if (!(await checkDataDir())) return;
    dailyBackup();

    protocol.handle("fnasset", (request) => {
      const file = resolveAsset(new URL(request.url));
      if (!file) return new Response("Not found", { status: 404 });
      return net.fetch(pathToFileURL(file).toString());
    });

    registerIpc();
    buildMenu();
    createWindow();

    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });

  app.on("window-all-closed", () => {
    if (!isMac) app.quit();
  });
}
