import { format } from "date-fns";
import { useEffect, useState } from "react";
import { datedDatabases } from "../lib/agenda";
import { exportWorkspaceJson, importJsonFiles, importMarkdownFiles } from "../lib/export";
import { flushEditors, flushNow } from "../lib/persist";
import { fnApi, isElectron } from "../lib/storage";
import { isAlive, openPage, replaceWorkspace, toast, updateSettings, useApp } from "../lib/store";
import { cx, pageTitle } from "../lib/utils";

function Row({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="set-row">
      <div className="set-label">
        <div>{label}</div>
        {hint && <div className="set-hint">{hint}</div>}
      </div>
      <div className="set-control">{children}</div>
    </div>
  );
}

function DataSection() {
  const [info, setInfo] = useState<{ version: string; dataDir: string } | null>(null);
  const [backups, setBackups] = useState<{ name: string; size: number; mtime: number }[]>([]);
  const refresh = () => {
    if (!fnApi) return;
    void fnApi.info().then(setInfo);
    void fnApi.listBackups().then(setBackups);
  };
  useEffect(refresh, []);

  if (!isElectron || !fnApi) {
    return (
      <section className="set-section">
        <h2>Your data</h2>
        <p className="muted">
          You're using the browser version: pages are saved automatically in this browser's storage. Use “Export everything”
          regularly to keep a backup file, or install the desktop app to save pages as files on your computer.
        </p>
      </section>
    );
  }

  return (
    <section className="set-section">
      <h2>Your data</h2>
      <Row label="Data folder" hint="Every page is saved here as a file, automatically, as you type.">
        <code className="path">{info?.dataDir}</code>
        <div className="btn-row">
          <button type="button" className="btn" onClick={() => fnApi!.openDataDir()}>
            Open folder
          </button>
          <button
            type="button"
            className="btn"
            onClick={async () => {
              flushEditors();
              await flushNow();
              const dir = await fnApi!.chooseDataDir();
              if (dir) {
                toast("Data folder changed — reloading…");
                setTimeout(() => window.location.reload(), 600);
              }
            }}
          >
            Change folder…
          </button>
        </div>
      </Row>
      <Row label="Backups" hint="A full copy of your workspace is saved every day (the last 30 are kept).">
        <div className="btn-row">
          <button
            type="button"
            className="btn"
            onClick={async () => {
              flushEditors();
              await flushNow();
              await fnApi!.backupNow();
              toast("Backup created");
              refresh();
            }}
          >
            Back up now
          </button>
        </div>
        <div className="backup-list">
          {backups.slice(0, 12).map((b) => (
            <div key={b.name} className="backup-item">
              <span>{format(b.mtime, "MMM d, yyyy · h:mm a")}</span>
              <span className="muted small">{(b.size / 1024).toFixed(0)} KB</span>
              <span style={{ flex: 1 }} />
              <button
                type="button"
                className="btn-text"
                onClick={async () => {
                  if (!confirm(`Restore the backup from ${format(b.mtime, "MMM d, yyyy h:mm a")}? Your current pages will be replaced (a backup of them is made first).`)) return;
                  flushEditors();
                  await flushNow();
                  await fnApi!.backupNow();
                  const data = await fnApi!.readBackup(b.name);
                  replaceWorkspace(data);
                  toast("Backup restored");
                  refresh();
                }}
              >
                Restore
              </button>
            </div>
          ))}
          {backups.length === 0 && <div className="muted small">No backups yet.</div>}
        </div>
      </Row>
    </section>
  );
}

export function SettingsView() {
  const settings = useApp((s) => s.meta.settings);
  const pages = useApp((s) => s.pages);
  const dbs = datedDatabases(pages);
  const allDbs = Object.values(pages).filter((p) => p.type === "database" && isAlive(pages, p.id));
  const [version, setVersion] = useState("");
  useEffect(() => {
    void fnApi?.info().then((i) => setVersion(i.version));
  }, []);

  return (
    <div className="simple-page settings">
      <h1 className="sp-title">Settings</h1>

      <section className="set-section">
        <h2>Profile</h2>
        <Row label="Your name">
          <input className="set-input" value={settings.userName} onChange={(e) => updateSettings({ userName: e.target.value })} />
        </Row>
        <Row label="Workspace name">
          <input className="set-input" value={settings.workspaceName} onChange={(e) => updateSettings({ workspaceName: e.target.value })} />
        </Row>
      </section>

      <section className="set-section">
        <h2>Appearance</h2>
        <Row label="Theme">
          <div className="seg-group">
            {(["light", "dark", "system"] as const).map((t) => (
              <button key={t} type="button" className={cx("seg", settings.theme === t && "active")} onClick={() => updateSettings({ theme: t })}>
                {t === "light" ? "Light" : t === "dark" ? "Dark" : "System"}
              </button>
            ))}
          </div>
        </Row>
        <Row label="Start week on">
          <div className="seg-group">
            <button type="button" className={cx("seg", settings.weekStartsOn === 1 && "active")} onClick={() => updateSettings({ weekStartsOn: 1 })}>
              Monday
            </button>
            <button type="button" className={cx("seg", settings.weekStartsOn === 0 && "active")} onClick={() => updateSettings({ weekStartsOn: 0 })}>
              Sunday
            </button>
          </div>
        </Row>
      </section>

      <section className="set-section">
        <h2>Calendar & tasks</h2>
        <Row label="Quick-add tasks go to" hint="Used by the “Add a task” box on Home.">
          <select className="fsel" value={settings.defaultTaskDb || ""} onChange={(e) => updateSettings({ defaultTaskDb: e.target.value || null })}>
            <option value="">None</option>
            {allDbs.map((d) => (
              <option key={d.id} value={d.id}>
                {pageTitle(d)}
              </option>
            ))}
          </select>
        </Row>
        <Row label="New calendar events go to" hint="Default database when you click a day in the Calendar.">
          <select className="fsel" value={settings.defaultEventDb || ""} onChange={(e) => updateSettings({ defaultEventDb: e.target.value || null })}>
            <option value="">First available</option>
            {dbs.map(({ db }) => (
              <option key={db.id} value={db.id}>
                {pageTitle(db)}
              </option>
            ))}
          </select>
        </Row>
      </section>

      <DataSection />

      <section className="set-section">
        <h2>Export & import</h2>
        <Row label="Export everything" hint="One file with all your pages (images included). Keep it somewhere safe.">
          <button
            type="button"
            className="btn"
            onClick={() => {
              flushEditors();
              void exportWorkspaceJson();
            }}
          >
            Export (.json)
          </button>
        </Row>
        <Row label="Import pages" hint="Add pages from a Fernando Notion export, or Markdown files (.md) from Notion and other apps.">
          <div className="btn-row">
            <button type="button" className="btn" onClick={() => void importJsonFiles()}>
              Import .json
            </button>
            <button
              type="button"
              className="btn"
              onClick={async () => {
                const id = await importMarkdownFiles(null);
                if (id) openPage(id);
              }}
            >
              Import Markdown
            </button>
          </div>
        </Row>
      </section>

      <section className="set-section">
        <h2>Keyboard shortcuts</h2>
        <div className="shortcuts">
          {[
            ["Ctrl+K", "Search"],
            ["Ctrl+N", "New page"],
            ["Ctrl+\\", "Toggle sidebar"],
            ["Ctrl+Shift+L", "Toggle dark mode"],
            ["Alt+← / Alt+→", "Back / forward"],
            ["/", "Insert a block"],
            ["@", "Mention a page or date"],
            ["Ctrl+B / I / U", "Bold / italic / underline"],
            ["Ctrl+Z / Ctrl+Shift+Z", "Undo / redo"],
            ["Tab / Shift+Tab", "Indent / outdent block"],
          ].map(([k, v]) => (
            <div key={k} className="shortcut">
              <kbd>{k}</kbd>
              <span>{v}</span>
            </div>
          ))}
        </div>
      </section>

      <p className="muted small about">Fernando Notion {version && `v${version}`} — your pages never leave this computer.</p>
    </div>
  );
}
