// Desktop end-to-end test: opens the real app, writes pages, opens a project in the
// side panel, closes and quits the app the way a person would, and checks the files
// on disk after each step.
//
//   npm run test:e2e                 test the app from source (builds the UI first)
//   node tests/e2e.mjs --packaged    test the build in release/ (the release workflow does this)
//
// Screenshots are saved in test-results/.
import { _electron as electron } from "playwright-core";
import electronPath from "electron";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SHOTS = path.join(ROOT, "test-results");
const isMac = process.platform === "darwin";
const MOD = isMac ? "Meta" : "Control";
const packaged = process.argv.includes("--packaged");

function packagedExe() {
  const release = (...p) => path.join(ROOT, "release", ...p);
  if (isMac) {
    const dir = process.arch === "arm64" ? "mac-arm64" : "mac";
    return release(dir, "Fernando Notion.app", "Contents", "MacOS", "Fernando Notion");
  }
  if (process.platform === "win32") return release("win-unpacked", "Fernando Notion.exe");
  return release("linux-unpacked", "fernando-notion");
}

const EXE = packaged ? packagedExe() : electronPath;
const ARGS = packaged ? [] : [ROOT];
if (!fs.existsSync(EXE)) {
  console.error(`App not found: ${EXE}`);
  process.exit(1);
}
if (!packaged && !fs.existsSync(path.join(ROOT, "dist", "index.html"))) {
  console.error("Build the UI first: npm run build");
  process.exit(1);
}

const WORK = fs.mkdtempSync(path.join(os.tmpdir(), "fn-e2e-"));
const DATA = path.join(WORK, "data");
const USER = path.join(WORK, "userdata");
fs.rmSync(SHOTS, { recursive: true, force: true });
fs.mkdirSync(SHOTS, { recursive: true });

const env = { ...process.env, FN_DATA_DIR: DATA, FN_USER_DATA: USER };
delete env.VITE_DEV_SERVER_URL;
delete env.ELECTRON_RUN_AS_NODE;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log("•", ...a);
let failures = 0;
const check = (ok, msg) => {
  console.log(ok ? "  PASS" : "  FAIL", msg);
  if (!ok) failures++;
};

/** Retries fn until it returns something truthy or time runs out (cloud machines can be slow). */
async function until(fn, ms = 10000) {
  const end = Date.now() + ms;
  for (;;) {
    const v = await Promise.resolve().then(fn).catch(() => false);
    if (v || Date.now() > end) return v;
    await sleep(200);
  }
}

function readPages() {
  const dir = path.join(DATA, "pages");
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).flatMap((f) => {
    try {
      return [JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"))];
    } catch {
      return [];
    }
  });
}
const savedPage = (title, text) =>
  readPages().find((p) => p.title === title && (!text || JSON.stringify(p.content || []).includes(text)));

let app = null;
let win = null;

async function launch() {
  app = await electron.launch({ executablePath: EXE, args: ARGS, env, timeout: 60000 });
  win = await app.firstWindow();
  win.on("console", (m) => m.type() === "error" && console.log("   [renderer error]", m.text().slice(0, 300)));
  win.on("pageerror", (e) => console.log("   [page error]", e.message));
  await win.waitForSelector(".sidebar", { timeout: 30000 });
  // Bring the window to the front: CI machines start apps in the background.
  await app
    .evaluate(({ app, BrowserWindow }) => {
      BrowserWindow.getAllWindows()[0]?.focus();
      app.focus({ steal: true });
    })
    .catch(() => {});
}

const exited = () => new Promise((r) => app.process().once("exit", () => r(true)));
const within = (p, ms) => Promise.race([p, sleep(ms).then(() => false)]);
const gone = (sel) => win.waitForSelector(sel, { state: "detached", timeout: 5000 }).then(() => true, () => false);

/** Closes the window like a person would. On a Mac the app keeps running with no windows, so quit it after. */
async function closeWindow() {
  const exit = exited();
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].close());
  if (isMac) {
    await until(() => app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length === 0));
    await app.evaluate(({ app }) => app.quit()).catch(() => {});
  }
  return within(exit, 15000);
}

/** Quits with the window still open: ⌘Q on a Mac, File → Quit on Windows. */
async function quitApp() {
  const exit = exited();
  await app.evaluate(({ app }) => app.quit()).catch(() => {});
  return within(exit, 15000);
}

async function run() {
  // ----------------------------------------------------------------- run 1 ---
  log(`Run 1: first launch (${packaged ? "packaged app" : "from source"}, ${process.platform})`);
  await launch();
  check(await until(() => readPages().length >= 10, 20000), `example pages written to disk (${readPages().length} files)`);
  check(fs.existsSync(path.join(DATA, "workspace.json")), "workspace.json written");
  await win.screenshot({ path: path.join(SHOTS, "1-welcome.png") });

  log("Create a page and type in it");
  await win.click(".sidebar-foot .nav-item:has-text('New page')");
  await win.waitForFunction(() => document.activeElement?.matches("textarea.page-title"));
  await win.keyboard.type("E2E Test Page");
  await win.keyboard.press("Enter");
  await sleep(300);
  await win.keyboard.type("Hello from the desktop app");
  check(!!(await until(() => savedPage("E2E Test Page", "Hello from the desktop app"))), "typed text saved to disk while the app is open");

  log("Type, then close the window right away");
  await win.keyboard.press("Enter");
  await win.keyboard.type("Last words before closing");
  check(await closeWindow(), "app exits after its window is closed");
  check(!!savedPage("E2E Test Page", "Last words before closing"), "text typed just before closing was saved");
  const backups = fs.existsSync(path.join(DATA, "backups")) ? fs.readdirSync(path.join(DATA, "backups")) : [];
  check(backups.length >= 1, `daily backup created (${backups.join(", ")})`);

  // ----------------------------------------------------------------- run 2 ---
  log("Run 2: reopen the app");
  await launch();
  await win.waitForSelector("textarea.page-title");
  check(await until(async () => (await win.inputValue("textarea.page-title")) === "E2E Test Page"), "reopens on the last page");
  check(
    await until(async () => {
      const text = await win.textContent(".bn-editor");
      return text.includes("Hello from the desktop app") && text.includes("Last words before closing");
    }),
    "editor shows the saved text after reopening",
  );

  log(`${isMac ? "⌘K" : "Ctrl+K"} opens search`);
  await win.click(".page-title");
  await win.keyboard.press("Escape");
  await win.keyboard.press(`${MOD}+K`);
  check(await win.waitForSelector(".quickfind", { timeout: 5000 }).then(() => true, () => false), "quick search opens");
  await win.keyboard.press("Escape");

  log("Add a card on the Tasks board");
  await win.click(".tree-row:has-text('Tasks')");
  await win.waitForSelector(".board-card");
  await win.click(".board-col:first-child .board-new");
  await win.keyboard.type("Card from E2E");
  await win.keyboard.press("Enter");
  check(
    !!(await until(() => {
      const tasks = readPages().find((p) => p.type === "database" && p.title === "Tasks");
      const card = savedPage("Card from E2E");
      return card && card.isRow && card.parentId === tasks?.id;
    })),
    "new board card saved as a row of Tasks",
  );
  await win.screenshot({ path: path.join(SHOTS, "2-tasks.png") });

  log("Open a project in the side panel");
  await win.click(".tree-row:has-text('Projects')");
  const card = ".board-card:has-text('Website redesign')";
  await win.waitForSelector(card);
  await win.click(card);
  await win.waitForSelector(".peek-panel .bn-editor");
  const panel = await win.evaluate(() => {
    const btn = document.querySelector(".peek-bar .icon-btn");
    const b = btn.getBoundingClientRect();
    return {
      closeOnTop: document.elementFromPoint(b.x + b.width / 2, b.y + b.height / 2)?.closest(".icon-btn") === btn,
      pagePosition: getComputedStyle(document.querySelector(".peek-panel .page")).position,
    };
  });
  check(panel.closeOnTop && panel.pagePosition !== "fixed", "the panel's close button is visible and clickable");
  await win.click(".peek-panel .editor-tail");
  for (let i = 1; i <= 14; i++) {
    await win.keyboard.type(`Panel line ${i}`);
    await win.keyboard.press("Enter");
  }
  await win.keyboard.type("Panel last line");
  check(!!(await until(() => savedPage("Website redesign", "Panel last line"))), "text typed in the panel saved to disk");
  const box = await win.locator(".peek-scroll").boundingBox();
  await win.evaluate(() => (document.querySelector(".peek-scroll").scrollTop = 0));
  await win.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await win.mouse.wheel(0, 800);
  const moved = await until(() => win.evaluate(() => document.querySelector(".peek-scroll").scrollTop), 3000);
  check(moved > 0, `the panel scrolls with the mouse wheel or trackpad (moved ${Math.round(moved || 0)}px)`);
  await win.screenshot({ path: path.join(SHOTS, "3-project-panel.png") });
  await win.click(".peek-bar .icon-btn[title^='Close']");
  check(await gone(".peek-panel"), "the close button closes the panel");
  await win.click(card);
  await win.waitForSelector(".peek-panel");
  const main = await win.locator(".main").boundingBox();
  await win.mouse.click(main.x + 24, main.y + main.height - 24);
  check(await gone(".peek-panel"), "clicking the page behind the panel closes it");
  await win.click(card);
  await win.waitForSelector(".peek-panel");
  await win.keyboard.press("Escape");
  check(await gone(".peek-panel"), "Esc closes the panel");

  log("Home and Calendar open");
  await win.click(".nav-item:has-text('Home')");
  await win.waitForSelector(".agenda");
  await win.screenshot({ path: path.join(SHOTS, "4-home.png") });
  await win.click(".nav-item:has-text('Calendar')");
  await win.waitForSelector(".fc");
  await sleep(500);
  await win.screenshot({ path: path.join(SHOTS, "5-calendar.png") });

  log("Settings shows the data folder");
  await win.click(".nav-item:has-text('Settings')");
  await win.waitForSelector("code.path");
  const shown = (await win.textContent("code.path")).trim();
  check(path.resolve(shown) === path.resolve(DATA), `data folder shown in Settings (${shown})`);

  log(`Type, then quit right away (${isMac ? "⌘Q" : "File → Quit"})`);
  await win.click(".tree-row:has-text('E2E Test Page')");
  await win.waitForSelector(".main .bn-editor");
  await win.click(".main .editor-tail");
  await win.keyboard.type("Typed right before quitting");
  check(await quitApp(), "app quits");
  check(!!savedPage("E2E Test Page", "Typed right before quitting"), "text typed just before quitting was saved");
}

const watchdog = setTimeout(() => {
  console.log("\nTIMED OUT after 5 minutes");
  try {
    app?.process().kill();
  } catch {}
  process.exit(1);
}, 5 * 60 * 1000);

try {
  await run();
} catch (err) {
  failures++;
  console.log("  FAIL", err?.message || err);
  await win?.screenshot({ path: path.join(SHOTS, "failure.png") }).catch(() => {});
} finally {
  clearTimeout(watchdog);
  try {
    app?.process().kill();
  } catch {}
}

if (failures) console.log(`\n${failures} check(s) FAILED. The app's data is in ${DATA}`);
else {
  console.log("\nALL CHECKS PASSED");
  fs.rmSync(WORK, { recursive: true, force: true, maxRetries: 5, retryDelay: 500 });
}
process.exit(failures ? 1 : 0);
