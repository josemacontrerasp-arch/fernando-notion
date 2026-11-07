import dayGridPlugin from "@fullcalendar/daygrid";
import interactionPlugin from "@fullcalendar/interaction";
import listPlugin from "@fullcalendar/list";
import FullCalendar from "@fullcalendar/react";
import timeGridPlugin from "@fullcalendar/timegrid";
import type { DateSelectArg, EventInput } from "@fullcalendar/core";
import { format, subDays } from "date-fns";
import { Plus } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { calendarColors, collectAgenda, datedDatabases } from "../lib/agenda";
import { addRow, openPage, openPeek, setRowProp, updateSettings, useApp } from "../lib/store";
import type { CalendarMode, DateValue, ID } from "../lib/types";
import { cx, pageTitle, SOLID } from "../lib/utils";
import { createCalendar } from "../lib/templates";
import { FC_VIEW, fcViews, fromFcEvent, toFcEvent } from "./database/CalendarView";
import { Checkbox } from "./database/PropertyCell";
import { PageIcon } from "./Sidebar";
import { Modal } from "./ui";

function NewEventModal({
  value,
  onClose,
}: {
  value: DateValue;
  onClose: () => void;
}) {
  const pages = useApp((s) => s.pages);
  const settings = useApp((s) => s.meta.settings);
  const dbs = datedDatabases(pages);
  const preferred = dbs.find((d) => d.db.id === settings.defaultEventDb) || dbs[0];
  const [dbId, setDbId] = useState<ID | undefined>(preferred?.db.id);
  const [title, setTitle] = useState("");
  const target = dbs.find((d) => d.db.id === dbId);
  const create = (open: boolean) => {
    if (!target) return;
    const id = addRow(target.db.id, { [target.prop.id]: value }, { title: title.trim() });
    onClose();
    if (open) openPeek(id);
  };
  const when = value.start.includes("T")
    ? `${format(new Date(value.start), "EEE, MMM d · h:mm a")}${value.end ? " – " + format(new Date(value.end), "h:mm a") : ""}`
    : `${format(new Date(value.start + "T00:00"), "EEE, MMM d")}${value.end ? " – " + format(new Date(value.end + "T00:00"), "EEE, MMM d") : ""}`;
  return (
    <Modal onClose={onClose} width={440}>
      <div className="new-event">
        <input
          autoFocus
          className="ne-title"
          placeholder="Event or task name"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && create(false)}
        />
        <div className="ne-row muted">{when}</div>
        {dbs.length ? (
          <div className="ne-row">
            <span className="muted">Add to</span>
            <select className="fsel" value={dbId} onChange={(e) => setDbId(e.target.value)}>
              {dbs.map((d) => (
                <option key={d.db.id} value={d.db.id}>
                  {d.db.icon ? d.db.icon + " " : ""}
                  {pageTitle(d.db)}
                </option>
              ))}
            </select>
          </div>
        ) : (
          <div className="ne-row muted">You don't have a calendar database yet.</div>
        )}
        <div className="ne-actions">
          <button type="button" className="btn" onClick={() => create(true)} disabled={!target}>
            Add & open
          </button>
          <button type="button" className="btn-primary" onClick={() => create(false)} disabled={!target}>
            Add
          </button>
        </div>
      </div>
    </Modal>
  );
}

export function GlobalCalendar() {
  const pages = useApp((s) => s.pages);
  const settings = useApp((s) => s.meta.settings);
  const hidden = settings.hiddenCalendars || [];
  const [mode, setMode] = useState<CalendarMode>(() => {
    try {
      return (localStorage.getItem("fn.calMode") as CalendarMode) || "month";
    } catch {
      return "month";
    }
  });
  const [creating, setCreating] = useState<DateValue | null>(null);
  const ref = useRef<FullCalendar>(null);
  const dbs = datedDatabases(pages);
  const colors = useMemo(() => calendarColors(pages), [pages]);

  useEffect(() => {
    ref.current?.getApi().changeView(FC_VIEW[mode]);
    try {
      localStorage.setItem("fn.calMode", mode);
    } catch {
      /* ignore */
    }
  }, [mode]);

  const events: EventInput[] = useMemo(
    () =>
      collectAgenda(pages, hidden).map((it) =>
        toFcEvent(it.row, it.value, SOLID[colors[it.db.id] || "blue"], {
          classNames: it.done ? ["fc-done"] : [],
          extendedProps: { propId: it.prop.id },
        }),
      ),
    [pages, hidden, colors],
  );

  const onSelect = (sel: DateSelectArg) => {
    sel.view.calendar.unselect();
    if (sel.allDay) {
      const start = format(sel.start, "yyyy-MM-dd");
      const end = format(subDays(sel.end, 1), "yyyy-MM-dd");
      setCreating({ start, end: end !== start ? end : null });
    } else {
      setCreating({ start: format(sel.start, "yyyy-MM-dd'T'HH:mm"), end: format(sel.end, "yyyy-MM-dd'T'HH:mm"), time: true });
    }
  };

  const persist = (info: any) => {
    const propId = info.event.extendedProps.propId as ID;
    const row = pages[info.event.id];
    const v = fromFcEvent(info.event, row?.props?.[propId] as DateValue);
    if (v) setRowProp(info.event.id, propId, v);
  };

  return (
    <div className="global-cal">
      <aside className="gc-side">
        <button
          type="button"
          className="btn-primary"
          style={{ width: "100%" }}
          onClick={() => setCreating({ start: format(new Date(), "yyyy-MM-dd") })}
        >
          <Plus size={15} /> New event
        </button>
        <div className="gc-label">Calendars</div>
        {dbs.map(({ db }) => (
          <div key={db.id} className="gc-cal">
            <Checkbox
              checked={!hidden.includes(db.id)}
              onChange={(on) =>
                updateSettings({ hiddenCalendars: on ? hidden.filter((h) => h !== db.id) : [...hidden, db.id] })
              }
            />
            <span className="gc-swatch" style={{ background: SOLID[colors[db.id] || "blue"] }} />
            <span className="gc-name" onClick={() => openPage(db.id)}>
              <PageIcon icon={db.icon} type="database" size={14} /> {pageTitle(db)}
            </span>
          </div>
        ))}
        {dbs.length === 0 && (
          <div className="gc-empty">
            <p className="muted">Any database with a Date property shows up here.</p>
            <button
              type="button"
              className="btn"
              onClick={() => {
                const id = createCalendar(null, false);
                updateSettings({ defaultEventDb: id });
              }}
            >
              Create a calendar
            </button>
          </div>
        )}
      </aside>
      <div className="gc-main">
        <div className="cal-modes">
          {(["month", "week", "day", "agenda"] as CalendarMode[]).map((m) => (
            <button key={m} type="button" className={cx("seg", mode === m && "active")} onClick={() => setMode(m)}>
              {m[0].toUpperCase() + m.slice(1)}
            </button>
          ))}
        </div>
        <FullCalendar
          ref={ref}
          plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin, listPlugin]}
          initialView={FC_VIEW[mode]}
          views={fcViews}
          headerToolbar={{ left: "title", center: "", right: "today prev,next" }}
          firstDay={settings.weekStartsOn}
          events={events}
          editable
          selectable
          selectMirror
          dayMaxEvents={4}
          nowIndicator
          height={mode === "week" || mode === "day" ? 720 : "auto"}
          scrollTime="08:00:00"
          eventTimeFormat={{ hour: "numeric", minute: "2-digit", meridiem: "short" }}
          select={onSelect}
          eventDrop={persist}
          eventResize={persist}
          eventClick={(info) => {
            info.jsEvent.preventDefault();
            openPeek(info.event.id);
          }}
          noEventsContent="Nothing scheduled in the next 30 days"
        />
      </div>
      {creating && <NewEventModal value={creating} onClose={() => setCreating(null)} />}
    </div>
  );
}
