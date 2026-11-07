import { useMemo, useRef, useState } from "react";
import type { ID, Page } from "../lib/types";
import { ancestors, isAlive, useApp } from "../lib/store";
import { cx, normalize, pageTitle } from "../lib/utils";
import { PageIcon } from "./Sidebar";
import { Modal } from "./ui";

export function PagePicker({
  title = "Link to page",
  placeholder = "Search for a page…",
  filter,
  onPick,
  onClose,
  extra,
}: {
  title?: string;
  placeholder?: string;
  filter?: (p: Page) => boolean;
  onPick: (id: ID | null) => void;
  onClose: () => void;
  extra?: { label: string; value: null };
}) {
  const pages = useApp((s) => s.pages);
  const recent = useApp((s) => s.meta.recent);
  const [q, setQ] = useState("");
  const [sel, setSel] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  const results = useMemo(() => {
    const rank = new Map(recent.map((id, i) => [id, i]));
    const nq = normalize(q.trim());
    return Object.values(pages)
      .filter((p) => isAlive(pages, p.id) && (!filter || filter(p)))
      .filter((p) => !nq || normalize(pageTitle(p)).includes(nq))
      .sort((a, b) => (rank.get(a.id) ?? 999) - (rank.get(b.id) ?? 999) || pageTitle(a).localeCompare(pageTitle(b)))
      .slice(0, 50);
  }, [pages, recent, q, filter]);

  const items: { id: ID | null; label: string; page?: Page }[] = [
    ...(extra && !q ? [{ id: null, label: extra.label }] : []),
    ...results.map((p) => ({ id: p.id, label: pageTitle(p), page: p })),
  ];

  return (
    <Modal onClose={onClose} width={520} align="top">
      <div className="picker">
        <input
          autoFocus
          className="picker-input"
          placeholder={placeholder}
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setSel(0);
          }}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setSel((s) => Math.min(items.length - 1, s + 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setSel((s) => Math.max(0, s - 1));
            } else if (e.key === "Enter" && items[sel]) {
              e.preventDefault();
              onPick(items[sel].id);
            }
          }}
        />
        <div className="picker-title">{title}</div>
        <div className="picker-list" ref={listRef}>
          {items.length === 0 && <div className="picker-empty">No results</div>}
          {items.map((it, i) => {
            const path = it.page ? ancestors(pages, it.page.id).map((a) => pageTitle(a)).join(" / ") : "";
            return (
              <div
                key={it.id ?? "__root"}
                className={cx("picker-item", i === sel && "selected")}
                onMouseEnter={() => setSel(i)}
                onClick={() => onPick(it.id)}
              >
                {it.page ? <PageIcon icon={it.page.icon} type={it.page.type} size={18} /> : <span style={{ width: 18 }}>🏠</span>}
                <span className="picker-label">{it.label}</span>
                {path && <span className="picker-path">{path}</span>}
              </div>
            );
          })}
        </div>
      </div>
    </Modal>
  );
}
