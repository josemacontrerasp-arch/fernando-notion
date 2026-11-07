import dayGridPlugin from "@fullcalendar/daygrid";
import interactionPlugin from "@fullcalendar/interaction";
import listPlugin from "@fullcalendar/list";
import FullCalendar from "@fullcalendar/react";
import timeGridPlugin from "@fullcalendar/timegrid";
import type { DateSelectArg, EventDropArg, EventInput } from "@fullcalendar/core";
import type { EventResizeDoneArg } from "@fullcalendar/interaction";
import { addDays, format, subDays } from "date-fns";
import { useEffect, useMemo, useRef } from "react";
import { optionById } from "../../lib/db";
import { addProperty, addRow, openPeek, setRowProp, updateView, useApp } from "../../lib/store";
import type { CalendarMode, DatabaseView, DateValue, Page, PropertyDef } from "../../lib/types";
import { cx, isDateValue, pageTitle, SOLID } from "../../lib/utils";
import { defaultsFromFilters } from "./shared";

export const FC_VIEW: Record<CalendarMode, string> = {
  month: "dayGridMonth",
  week: "timeGridWeek",
  day: "timeGridDay",
  agenda: "listUpcoming",
};

/** FullCalendar uses exclusive end dates for all-day events. */
export function toFcEvent(row: Page, v: DateValue, color: string, extra: Partial<EventInput> = {}): EventInput {
  const timed = v.start.includes("T");
  let end: string | undefined;
  if (v.end) end = timed ? v.end : format(addDays(new Date(v.end.slice(0, 10) + "T00:00"), 1), "yyyy-MM-dd");
  return {
    id: row.id,
    title: `${row.icon ? row.icon + " " : ""}${pageTitle(row)}`,
    start: v.start,
    end,
    allDay: !timed,
    backgroundColor: color,
    borderColor: color,
    ...extra,
  };
}

/** Convert a dropped/resized FullCalendar event back into a DateValue. */
export function fromFcEvent(ev: { start: Date | null; end: Date | null; allDay: boolean }, prev?: DateValue): DateValue | null {
  if (!ev.start) return null;
  if (ev.allDay) {
    const start = format(ev.start, "yyyy-MM-dd");
    let end: string | null = null;
    if (ev.end) {
      const e = format(subDays(ev.end, 1), "yyyy-MM-dd");
      if (e !== start) end = e;
    } else if (prev?.end) end = null;
    return { start, end };
  }
  const start = format(ev.start, "yyyy-MM-dd'T'HH:mm");
  const end = ev.end ? format(ev.end, "yyyy-MM-dd'T'HH:mm") : null;
  return { start, end, time: true };
}

export function colorProp(schema: Page["db"]): PropertyDef | undefined {
  return schema?.properties.find((p) => p.type === "status") || schema?.properties.find((p) => p.type === "select");
}

export function rowColor(row: Page, cp: PropertyDef | undefined, fallback = SOLID.blue) {
  if (!cp) return fallback;
  const o = optionById(cp, row.props?.[cp.id]);
  return o && o.color !== "default" ? SOLID[o.color] : fallback;
}

export const fcViews = {
  listUpcoming: { type: "list", duration: { days: 30 }, buttonText: "Agenda", listDayFormat: { weekday: "long", month: "short", day: "numeric" } as any },
};

export function CalendarView({ db, view, rows, readOnly }: { db: Page; view: DatabaseView; rows: Page[]; readOnly?: boolean }) {
  const schema = db.db!;
  const weekStartsOn = useApp((s) => s.meta.settings.weekStartsOn);
  const prop = schema.properties.find((p) => p.id === view.dateProperty && p.type === "date");
  const ref = useRef<FullCalendar>(null);
  const mode = view.calendarMode || "month";
  const cp = colorProp(schema);

  useEffect(() => {
    ref.current?.getApi().changeView(FC_VIEW[mode]);
  }, [mode]);

  const events = useMemo(() => {
    if (!prop) return [];
    const out: EventInput[] = [];
    for (const r of rows) {
      const v = r.props?.[prop.id];
      if (isDateValue(v) && v.start) out.push(toFcEvent(r, v, rowColor(r, cp)));
    }
    return out;
  }, [rows, prop, cp]);

  if (!prop) {
    const dates = schema.properties.filter((p) => p.type === "date");
    return (
      <div className="db-empty">
        <p>A calendar shows rows by a Date property.</p>
        {dates.map((d) => (
          <button key={d.id} type="button" className="btn" onClick={() => updateView(db.id, view.id, { dateProperty: d.id })}>
            Show by {d.name}
          </button>
        ))}
        {!readOnly && (
          <button
            type="button"
            className="btn-primary"
            onClick={() => {
              const id = addProperty(db.id, "date", "Date");
              updateView(db.id, view.id, { dateProperty: id });
            }}
          >
            Add a Date property
          </button>
        )}
      </div>
    );
  }

  const persist = (info: EventDropArg | EventResizeDoneArg) => {
    const row = rows.find((r) => r.id === info.event.id);
    const prev = row?.props?.[prop.id] as DateValue | undefined;
    const v = fromFcEvent(info.event, prev);
    if (v) setRowProp(info.event.id, prop.id, v);
  };

  const onSelect = (sel: DateSelectArg) => {
    sel.view.calendar.unselect();
    if (readOnly) return;
    let value: DateValue;
    if (sel.allDay) {
      const start = format(sel.start, "yyyy-MM-dd");
      const end = format(subDays(sel.end, 1), "yyyy-MM-dd");
      value = { start, end: end !== start ? end : null };
    } else {
      value = { start: format(sel.start, "yyyy-MM-dd'T'HH:mm"), end: format(sel.end, "yyyy-MM-dd'T'HH:mm"), time: true };
    }
    const id = addRow(db.id, { ...defaultsFromFilters(view, schema), [prop.id]: value });
    openPeek(id);
    useApp.setState({ focusTitle: id });
  };

  return (
    <div className="calendar-view">
      <div className="cal-modes">
        {(["month", "week", "day", "agenda"] as CalendarMode[]).map((m) => (
          <button
            key={m}
            type="button"
            className={cx("seg", mode === m && "active")}
            onClick={() => updateView(db.id, view.id, { calendarMode: m })}
          >
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
        firstDay={weekStartsOn}
        events={events}
        editable={!readOnly}
        selectable={!readOnly}
        selectMirror
        dayMaxEvents={4}
        nowIndicator
        height={mode === "week" || mode === "day" ? 720 : "auto"}
        expandRows
        scrollTime="08:00:00"
        eventTimeFormat={{ hour: "numeric", minute: "2-digit", meridiem: "short" }}
        eventDrop={persist}
        eventResize={persist}
        select={onSelect}
        eventClick={(info) => {
          info.jsEvent.preventDefault();
          openPeek(info.event.id);
        }}
        noEventsContent="Nothing scheduled in the next 30 days"
      />
    </div>
  );
}
