import { ChevronsRight, Ellipsis, Maximize2 } from "lucide-react";
import { useEffect } from "react";
import { openPage, openPeek, peekOpenCount, useApp } from "../lib/store";
import { pageTitle } from "../lib/utils";
import { PageView } from "./PageView";
import { PageIcon } from "./Sidebar";
import { PageMenu } from "./TopBar";
import { hasOpenLayers, usePopover } from "./ui";

/** Side panel that shows a page (usually a database row) next to the current page. */
export function Peek() {
  const peekId = useApp((s) => s.peekId);
  const page = useApp((s) => (s.peekId ? s.pages[s.peekId] : null));
  const parent = useApp((s) => (page?.parentId ? s.pages[page.parentId] : null));
  const menu = usePopover();

  useEffect(() => {
    if (!peekId) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !hasOpenLayers() && !(document.activeElement as HTMLElement)?.closest?.(".bn-editor")) openPeek(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [peekId]);

  // Clicking the page behind the panel closes it, like Notion. Clicks that open a row in
  // the panel, close a menu, or drag/select something leave it open.
  useEffect(() => {
    if (!peekId) return;
    let down: { x: number; y: number; layers: boolean; opens: number } | null = null;
    const behind = (t: EventTarget | null) => !!(t as Element | null)?.closest?.(".main, .sidebar");
    const onDown = (e: PointerEvent) => {
      down = { x: e.clientX, y: e.clientY, layers: hasOpenLayers(), opens: peekOpenCount() };
    };
    const onClick = (e: MouseEvent) => {
      const d = down;
      down = null;
      if (!d || d.layers || !behind(e.target)) return;
      if (peekOpenCount() !== d.opens) return;
      if (Math.abs(e.clientX - d.x) > 4 || Math.abs(e.clientY - d.y) > 4) return;
      openPeek(null);
    };
    window.addEventListener("pointerdown", onDown, true);
    window.addEventListener("click", onClick);
    return () => {
      window.removeEventListener("pointerdown", onDown, true);
      window.removeEventListener("click", onClick);
    };
  }, [peekId]);

  useEffect(() => {
    if (peekId && !page) openPeek(null);
  }, [peekId, page]);

  if (!peekId || !page) return null;
  return (
    // Not "peek": PageView puts that class on the page inside, which would then get these panel styles.
    <aside className="peek-panel">
      <div className="peek-bar">
        <button type="button" className="icon-btn" title="Close (Esc)" onClick={() => openPeek(null)}>
          <ChevronsRight size={18} />
        </button>
        <button type="button" className="icon-btn" title="Open as full page" onClick={() => openPage(peekId)}>
          <Maximize2 size={15} />
        </button>
        {parent && (
          <span className="peek-parent muted">
            <PageIcon icon={parent.icon} type={parent.type} size={14} /> {pageTitle(parent)}
          </span>
        )}
        <span style={{ flex: 1 }} />
        <button type="button" className="icon-btn" title="More" onClick={(e) => menu.toggle(e.currentTarget)}>
          <Ellipsis size={18} />
        </button>
        {menu.anchor && <PageMenu pageId={peekId} anchor={menu.anchor as HTMLElement} onClose={menu.close} />}
      </div>
      <div className="peek-scroll">
        <PageView key={peekId} pageId={peekId} mode="peek" />
      </div>
    </aside>
  );
}
