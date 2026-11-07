import { addDays, format, isSameDay, startOfDay } from "date-fns";
import { CalendarDays, Plus, Sparkles } from "lucide-react";
import { useMemo, useState } from "react";
import { collectAgenda, overlapsDay, type AgendaItem } from "../lib/agenda";
import { doneValue, firstDateProp } from "../lib/db";
import { addRow, isAlive, navigate, newPageAndOpen, openPage, openPeek, setRowProp, toast, useApp } from "../lib/store";
import { createTasks } from "../lib/templates";
import { cx, pageTitle } from "../lib/utils";
import { Checkbox } from "./database/PropertyCell";
import { PageIcon } from "./Sidebar";
import { coverStyle } from "./CoverPicker";

function greeting() {
  const h = new Date().getHours();
  if (h < 5) return "Good night";
  if (h < 12) return "Good morning";
  if (h < 19) return "Good afternoon";
  return "Good evening";
}

function AgendaRow({ item, showDate }: { item: AgendaItem; showDate?: boolean }) {
  const toggle = (done: boolean) => {
    const dv = doneValue(item.db.db!, done);
    if (dv) setRowProp(item.row.id, dv.propId, dv.value);
  };
  return (
    <div className={cx("agenda-row", item.done && "done")} onClick={() => openPeek(item.row.id)}>
      {item.hasCompletion ? (
        <Checkbox checked={item.done} onChange={toggle} />
      ) : (
        <span className="agenda-dot" />
      )}
      <span className="agenda-time">
        {showDate ? format(item.start, "EEE d") : item.timed ? format(item.start, "h:mm a") : "All day"}
      </span>
      <span className="agenda-title">
        {item.row.icon ? item.row.icon + " " : ""}
        {pageTitle(item.row)}
      </span>
      <span className="agenda-db" onClick={(e) => (e.stopPropagation(), openPage(item.db.id))}>
        <PageIcon icon={item.db.icon} type="database" size={13} /> {pageTitle(item.db)}
      </span>
    </div>
  );
}

function QuickAdd() {
  const pages = useApp((s) => s.pages);
  const defaultDb = useApp((s) => s.meta.settings.defaultTaskDb);
  const [text, setText] = useState("");
  const [when, setWhen] = useState<"today" | "tomorrow" | "none">("today");
  const db = defaultDb && pages[defaultDb] && isAlive(pages, defaultDb) ? pages[defaultDb] : null;
  if (!db?.db) {
    return (
      <div className="quick-add empty">
        <span className="muted">Quick add needs a task list.</span>
        <button
          type="button"
          className="btn"
          onClick={() => {
            const projects = Object.values(pages).find((p) => p.type === "database" && p.title === "Projects" && !p.trashed);
            const id = createTasks(null, false, projects?.id ?? null);
            useApp.setState((s) => ({ meta: { ...s.meta, settings: { ...s.meta.settings, defaultTaskDb: id } } }));
            toast("Task list created");
          }}
        >
          Create a task list
        </button>
      </div>
    );
  }
  const dateProp = firstDateProp(db.db);
  const submit = () => {
    if (!text.trim()) return;
    const props: Record<string, any> = {};
    if (dateProp && when !== "none") props[dateProp.id] = { start: format(addDays(new Date(), when === "today" ? 0 : 1), "yyyy-MM-dd") };
    const dv = doneValue(db.db!, false);
    if (dv) props[dv.propId] = dv.value;
    addRow(db.id, props, { title: text.trim() });
    setText("");
    toast(`Added to ${pageTitle(db)}`);
  };
  return (
    <div className="quick-add">
      <Plus size={16} className="muted" />
      <input
        className="qa-input"
        placeholder={`Add a task to ${pageTitle(db)}…`}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && submit()}
      />
      <select className="fsel" value={when} onChange={(e) => setWhen(e.target.value as any)}>
        <option value="today">Today</option>
        <option value="tomorrow">Tomorrow</option>
        <option value="none">No date</option>
      </select>
      <button type="button" className="btn-primary sm" onClick={submit} disabled={!text.trim()}>
        Add
      </button>
    </div>
  );
}

function MiniWeek({ items }: { items: AgendaItem[] }) {
  const weekStartsOn = useApp((s) => s.meta.settings.weekStartsOn);
  const today = startOfDay(new Date());
  const days = Array.from({ length: 7 }, (_, i) => addDays(today, i));
  void weekStartsOn;
  return (
    <div className="mini-week">
      {days.map((d) => {
        const count = items.filter((it) => overlapsDay(it, d) && !it.done).length;
        return (
          <div key={d.toISOString()} className={cx("mw-day", isSameDay(d, today) && "today")} onClick={() => navigate({ kind: "calendar" })}>
            <div className="mw-name">{format(d, "EEE")}</div>
            <div className="mw-num">{format(d, "d")}</div>
            <div className="mw-dots">
              {Array.from({ length: Math.min(count, 4) }).map((_, i) => (
                <span key={i} className="mw-dot" />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function Home() {
  const pages = useApp((s) => s.pages);
  const recent = useApp((s) => s.meta.recent);
  const userName = useApp((s) => s.meta.settings.userName);
  const items = useMemo(() => collectAgenda(pages), [pages]);
  const today = startOfDay(new Date());
  const overdue = items.filter((i) => i.hasCompletion && !i.done && startOfDay(i.end) < today);
  const todays = items.filter((i) => overlapsDay(i, today));
  const upcoming = items.filter((i) => startOfDay(i.start) > today && startOfDay(i.start) <= addDays(today, 7));
  const recentPages = recent.map((id) => pages[id]).filter((p) => p && isAlive(pages, p.id)).slice(0, 8);

  return (
    <div className="home">
      <div className="home-hero">
        <div className="home-date">{format(new Date(), "EEEE, MMMM d")}</div>
        <h1 className="home-greeting">
          {greeting()}
          {userName ? `, ${userName}` : ""}
        </h1>
      </div>

      <MiniWeek items={items} />

      <section className="home-section">
        <QuickAdd />
      </section>

      <div className="home-cols">
        <section className="home-section agenda">
          <div className="home-h">
            <CalendarDays size={16} /> Today's agenda
            <span style={{ flex: 1 }} />
            <button type="button" className="btn-text" onClick={() => navigate({ kind: "calendar" })}>
              Open calendar
            </button>
          </div>
          {overdue.length > 0 && (
            <>
              <div className="agenda-label overdue">Overdue</div>
              {overdue.map((it) => (
                <AgendaRow key={it.row.id} item={it} showDate />
              ))}
            </>
          )}
          <div className="agenda-label">Today</div>
          {todays.length ? (
            todays.map((it) => <AgendaRow key={it.row.id} item={it} />)
          ) : (
            <div className="agenda-empty">Nothing scheduled for today 🎉</div>
          )}
          <div className="agenda-label">Next 7 days</div>
          {upcoming.length ? (
            upcoming.map((it) => <AgendaRow key={it.row.id} item={it} showDate />)
          ) : (
            <div className="agenda-empty">Nothing coming up this week</div>
          )}
        </section>
      </div>

      <section className="home-section">
        <div className="home-h">
          <Sparkles size={16} /> Recently visited
        </div>
        <div className="recent-grid">
          {recentPages.map((p) => (
            <div key={p.id} className="recent-card" onClick={() => openPage(p.id)}>
              <div className="recent-cover" style={p.cover ? coverStyle(p.cover, p.coverY) : undefined} />
              <div className="recent-icon">
                <PageIcon icon={p.icon} type={p.type} size={26} />
              </div>
              <div className="recent-title">{pageTitle(p)}</div>
              <div className="recent-meta muted">{format(p.updatedAt, "MMM d")}</div>
            </div>
          ))}
          <div className="recent-card new" onClick={() => newPageAndOpen(null)}>
            <Plus size={20} />
            <div className="recent-title">New page</div>
          </div>
        </div>
      </section>
    </div>
  );
}
