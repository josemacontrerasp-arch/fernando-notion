import { useEffect } from "react";
import { boot } from "./lib/persist";
import { fnApi } from "./lib/storage";
import {
  goBack,
  goForward,
  navigate,
  newPageAndOpen,
  setQuickFind,
  updateSettings,
  useApp,
} from "./lib/store";
import { seedWorkspace } from "./lib/templates";
import { TemplateEditorHost } from "./components/database/TemplateEditor";
import { GlobalCalendar } from "./components/GlobalCalendar";
import { Home } from "./components/Home";
import { PageView } from "./components/PageView";
import { Peek } from "./components/Peek";
import { QuickFind } from "./components/QuickFind";
import { SettingsView } from "./components/Settings";
import { Sidebar } from "./components/Sidebar";
import { TemplatesView } from "./components/TemplatesView";
import { TopBar } from "./components/TopBar";
import { TrashView } from "./components/Trash";
import { useResolvedTheme } from "./components/ui";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { isMac } from "./lib/platform";
import { cx } from "./lib/utils";

function Toasts() {
  const toasts = useApp((s) => s.toasts);
  return (
    <div className="toasts">
      {toasts.map((t) => (
        <div key={t.id} className="toast">
          <span>{t.message}</span>
          {t.action && (
            <button
              type="button"
              className="toast-action"
              onClick={() => {
                t.action!.run();
                useApp.setState((s) => ({ toasts: s.toasts.filter((x) => x.id !== t.id) }));
              }}
            >
              {t.action.label}
            </button>
          )}
        </div>
      ))}
    </div>
  );
}

function Main() {
  const route = useApp((s) => s.route);
  const exists = useApp((s) => (route.kind === "page" ? !!s.pages[route.id] : true));
  let content: React.ReactNode;
  switch (route.kind) {
    case "page":
      content = exists ? <PageView key={route.id} pageId={route.id} /> : <div className="page-missing">This page was deleted.</div>;
      break;
    case "calendar":
      content = <GlobalCalendar />;
      break;
    case "trash":
      content = <TrashView />;
      break;
    case "templates":
      content = <TemplatesView />;
      break;
    case "settings":
      content = <SettingsView />;
      break;
    default:
      content = <Home />;
  }
  const key = route.kind === "page" ? route.id : route.kind;
  return (
    <main className="main">
      <ErrorBoundary resetKey={`top-${key}`}>
        <TopBar />
      </ErrorBoundary>
      <div className="main-scroll" key={key}>
        <ErrorBoundary resetKey={key}>{content}</ErrorBoundary>
      </div>
    </main>
  );
}

function useShortcuts() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Let the editor keep its own shortcuts (e.g. Ctrl/⌘+K to add a link on selected text).
      if (e.defaultPrevented) return;
      const mod = isMac ? e.metaKey : e.ctrlKey;
      const k = e.key.toLowerCase();
      if (isMac && e.metaKey && !e.shiftKey && (e.key === "[" || e.key === "]")) {
        e.preventDefault();
        if (e.key === "[") goBack();
        else goForward();
        return;
      }
      if (mod && (k === "k" || k === "p") && !e.shiftKey) {
        e.preventDefault();
        setQuickFind(!useApp.getState().quickFind);
      } else if (mod && k === "n" && !e.shiftKey) {
        e.preventDefault();
        newPageAndOpen(null);
      } else if (mod && e.key === "\\") {
        e.preventDefault();
        updateSettings({ sidebarCollapsed: !useApp.getState().meta.settings.sidebarCollapsed });
      } else if (mod && e.shiftKey && k === "l") {
        e.preventDefault();
        const dark = document.documentElement.dataset.theme === "dark";
        updateSettings({ theme: dark ? "light" : "dark" });
      } else if (!isMac && e.altKey && e.key === "ArrowLeft") {
        // (On a Mac, Option+arrows move by word while typing, so ⌘[ / ⌘] are used instead.)
        e.preventDefault();
        goBack();
      } else if (!isMac && e.altKey && e.key === "ArrowRight") {
        e.preventDefault();
        goForward();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    fnApi?.onMenu((action) => {
      if (action === "new-page") newPageAndOpen(null);
      else if (action === "search") setQuickFind(true);
      else if (action === "settings") navigate({ kind: "settings" });
      else if (action === "toggle-sidebar")
        updateSettings({ sidebarCollapsed: !useApp.getState().meta.settings.sidebarCollapsed });
      else if (action === "toggle-theme") {
        const dark = document.documentElement.dataset.theme === "dark";
        updateSettings({ theme: dark ? "light" : "dark" });
      }
    });
  }, []);
}

export default function App() {
  const loaded = useApp((s) => s.loaded);
  const loadErrors = useApp((s) => s.loadErrors);
  const peek = useApp((s) => !!s.peekId);
  const theme = useResolvedTheme();

  useEffect(() => {
    boot(seedWorkspace).catch((err) => {
      console.error(err);
      alert(`Fernando Notion could not load your workspace:\n${err?.message || err}`);
    });
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  useShortcuts();

  if (!loaded) {
    return (
      <div className="boot">
        <div className="boot-logo">F</div>
        <div className="muted">Opening your workspace…</div>
      </div>
    );
  }

  return (
    <div className={cx("app", peek && "with-peek")}>
      <ErrorBoundary>
        <Sidebar />
      </ErrorBoundary>
      <Main />
      <ErrorBoundary>
        <Peek />
      </ErrorBoundary>
      <QuickFind />
      <TemplateEditorHost />
      <Toasts />
      {loadErrors.length > 0 && (
        <div className="load-errors" onClick={() => useApp.setState({ loadErrors: [] })}>
          Some files could not be read and were skipped: {loadErrors.slice(0, 3).join("; ")} (click to dismiss)
        </div>
      )}
    </div>
  );
}
