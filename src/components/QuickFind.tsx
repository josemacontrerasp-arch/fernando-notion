import { CornerDownLeft, FilePlus, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { ancestors, createPage, isAlive, openPage, setQuickFind, useApp } from "../lib/store";
import type { ID, Page } from "../lib/types";
import { blocksToText, cx, normalize, pageTitle } from "../lib/utils";
import { PageIcon } from "./Sidebar";
import { Modal } from "./ui";

interface Hit {
  page: Page;
  snippet?: string;
  score: number;
}

function snippetOf(text: string, idx: number, len: number) {
  const start = Math.max(0, idx - 40);
  const end = Math.min(text.length, idx + len + 60);
  return (start > 0 ? "…" : "") + text.slice(start, end).replace(/\s+/g, " ") + (end < text.length ? "…" : "");
}

export function QuickFind() {
  const open = useApp((s) => s.quickFind);
  if (!open) return null;
  return <QuickFindInner />;
}

function QuickFindInner() {
  const pages = useApp((s) => s.pages);
  const recent = useApp((s) => s.meta.recent);
  const [q, setQ] = useState("");
  const [sel, setSel] = useState(0);

  const index = useMemo(
    () =>
      Object.values(pages)
        .filter((p) => isAlive(pages, p.id))
        .map((p) => {
          const text = blocksToText(p.content, " ");
          return { page: p, title: normalize(pageTitle(p)), text, ntext: normalize(text) };
        }),
    [pages],
  );

  const hits: Hit[] = useMemo(() => {
    const nq = normalize(q.trim());
    if (!nq) {
      return recent
        .map((id) => pages[id])
        .filter((p): p is Page => !!p && isAlive(pages, p.id))
        .slice(0, 10)
        .map((page) => ({ page, score: 0 }));
    }
    const out: Hit[] = [];
    for (const it of index) {
      const ti = it.title.indexOf(nq);
      if (ti >= 0) {
        out.push({ page: it.page, score: ti === 0 ? 0 : 1 });
        continue;
      }
      const ci = it.ntext.indexOf(nq);
      if (ci >= 0) out.push({ page: it.page, score: 2, snippet: snippetOf(it.text, ci, nq.length) });
    }
    return out.sort((a, b) => a.score - b.score || b.page.updatedAt - a.page.updatedAt).slice(0, 40);
  }, [q, index, pages, recent]);

  const total = hits.length + (q.trim() ? 1 : 0);
  const close = () => setQuickFind(false);
  const go = (id: ID) => {
    close();
    openPage(id);
  };
  const create = () => {
    const id = createPage({ title: q.trim() });
    go(id);
  };
  const activate = (i: number) => {
    if (i < hits.length) go(hits[i].page.id);
    else if (q.trim()) create();
  };

  return (
    <Modal onClose={close} width={640} align="top" className="quickfind">
      <div className="qf-input-row">
        <Search size={18} className="muted" />
        <input
          autoFocus
          className="qf-input"
          placeholder="Search pages and content…"
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setSel(0);
          }}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setSel((s) => Math.min(total - 1, s + 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setSel((s) => Math.max(0, s - 1));
            } else if (e.key === "Enter") {
              e.preventDefault();
              activate(sel);
            }
          }}
        />
      </div>
      <div className="qf-results">
        {!q.trim() && hits.length > 0 && <div className="menu-heading">Recent</div>}
        {hits.map((h, i) => {
          const path = ancestors(pages, h.page.id)
            .map((a) => pageTitle(a))
            .join(" / ");
          return (
            <div
              key={h.page.id}
              className={cx("qf-item", i === sel && "selected")}
              onMouseEnter={() => setSel(i)}
              onClick={() => go(h.page.id)}
            >
              <PageIcon icon={h.page.icon} type={h.page.type} size={20} />
              <div className="qf-text">
                <div className="qf-title">
                  {pageTitle(h.page)}
                  {path && <span className="qf-path"> — {path}</span>}
                </div>
                {h.snippet && <div className="qf-snippet">{h.snippet}</div>}
              </div>
              {i === sel && <CornerDownLeft size={14} className="muted" />}
            </div>
          );
        })}
        {q.trim() && (
          <div className={cx("qf-item", sel === hits.length && "selected")} onMouseEnter={() => setSel(hits.length)} onClick={create}>
            <FilePlus size={18} className="muted" />
            <div className="qf-text">
              <div className="qf-title">New page “{q.trim()}”</div>
            </div>
          </div>
        )}
        {!q.trim() && hits.length === 0 && <div className="picker-empty">Type to search your workspace</div>}
        {q.trim() && hits.length === 0 && <div className="picker-empty">No pages match “{q.trim()}”</div>}
      </div>
      <div className="qf-foot muted">↑↓ to navigate · Enter to open · Esc to close</div>
    </Modal>
  );
}
