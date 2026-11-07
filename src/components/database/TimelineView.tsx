import {
  addDays,
  differenceInCalendarDays,
  eachDayOfInterval,
  format,
  isWeekend,
  startOfDay,
  startOfWeek,
} from "date-fns";
import { Plus } from "lucide-react";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { addProperty, addRow, openPeek, setRowProp, updateView, useApp } from "../../lib/store";
import type { DatabaseView, DateValue, Page } from "../../lib/types";
import { cx, isDateValue, pageTitle, parseDateStr } from "../../lib/utils";
import { PageIcon } from "../Sidebar";
import { colorProp, rowColor } from "./CalendarView";
import { defaultsFromFilters } from "./shared";

const PX: Record<string, number> = { day: 44, week: 22, month: 7 };

function shift(s: string, days: number) {
  const d = parseDateStr(s)!;
  const n = addDays(d, days);
  return s.includes("T") ? format(n, "yyyy-MM-dd'T'HH:mm") : format(n, "yyyy-MM-dd");
}

function Bar({
  row,
  value,
  origin,
  px,
  color,
  readOnly,
  onCommit,
}: {
  row: Page;
  value: DateValue;
  origin: Date;
  px: number;
  color: string;
  readOnly?: boolean;
  onCommit: (v: DateValue) => void;
}) {
  const s = startOfDay(parseDateStr(value.start)!);
  const e = startOfDay(parseDateStr(value.end || value.start)!);
  const [drag, setDrag] = useState<{ mode: "move" | "start" | "end"; delta: number } | null>(null);
  let startOff = differenceInCalendarDays(s, origin);
  let endOff = differenceInCalendarDays(e, origin);
  if (drag) {
    if (drag.mode === "move") {
      startOff += drag.delta;
      endOff += drag.delta;
    } else if (drag.mode === "start") startOff = Math.min(endOff, startOff + drag.delta);
    else endOff = Math.max(startOff, endOff + drag.delta);
  }
  const left = startOff * px;
  const width = Math.max(px, (endOff - startOff + 1) * px);

  const begin = (ev: React.MouseEvent, mode: "move" | "start" | "end") => {
    ev.preventDefault();
    ev.stopPropagation();
    if (readOnly) {
      openPeek(row.id);
      return;
    }
    const x0 = ev.clientX;
    let delta = 0;
    let moved = false;
    setDrag({ mode, delta: 0 });
    const move = (m: MouseEvent) => {
      if (Math.abs(m.clientX - x0) > 3) moved = true;
      delta = Math.round((m.clientX - x0) / px);
      setDrag({ mode, delta });
    };
    const up = () => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
      setDrag(null);
      if (!moved && mode === "move") {
        openPeek(row.id);
        return;
      }
      if (delta === 0) return;
      const startStr = value.start;
      const endStr = value.end || value.start;
      if (mode === "move") onCommit({ ...value, start: shift(startStr, delta), end: value.end ? shift(endStr, delta) : null });
      else if (mode === "start") {
        const ns = shift(startStr, Math.min(delta, differenceInCalendarDays(e, s)));
        onCommit({ ...value, start: ns, end: value.end || value.start });
      } else {
        const ne = shift(endStr, Math.max(delta, -differenceInCalendarDays(e, s)));
        onCommit({ ...value, end: ne === value.start ? null : ne });
      }
    };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
  };

  return (
    <div
      className={cx("tl-bar", drag && "dragging")}
      style={{ left, width, background: color }}
      onMouseDown={(ev) => begin(ev, "move")}
      title={`${pageTitle(row)}`}
    >
      {!readOnly && <span className="tl-handle left" onMouseDown={(ev) => begin(ev, "start")} />}
      <span className="tl-bar-label">
        {row.icon ? row.icon + " " : ""}
        {pageTitle(row)}
      </span>
      {!readOnly && <span className="tl-handle right" onMouseDown={(ev) => begin(ev, "end")} />}
    </div>
  );
}

export function TimelineView({ db, view, rows, readOnly }: { db: Page; view: DatabaseView; rows: Page[]; readOnly?: boolean }) {
  const schema = db.db!;
  const weekStartsOn = useApp((s) => s.meta.settings.weekStartsOn);
  const prop = schema.properties.find((p) => p.id === view.dateProperty && p.type === "date");
  const scale = view.timelineScale || "week";
  const px = PX[scale];
  const scrollRef = useRef<HTMLDivElement>(null);
  const cp = colorProp(schema);

  const { origin, days } = useMemo(() => {
    const today = startOfDay(new Date());
    let min = addDays(today, -21);
    let max = addDays(today, 70);
    if (prop) {
      for (const r of rows) {
        const v = r.props?.[prop.id];
        if (!isDateValue(v) || !v.start) continue;
        const s = parseDateStr(v.start);
        const e = parseDateStr(v.end || v.start);
        if (s && s < min) min = addDays(s, -7);
        if (e && e > max) max = addDays(e, 21);
      }
    }
    const origin = startOfWeek(min, { weekStartsOn });
    return { origin, days: eachDayOfInterval({ start: origin, end: max }) };
  }, [rows, prop, weekStartsOn]);

  const todayX = differenceInCalendarDays(new Date(), origin) * px;

  const scrollToToday = () => {
    if (scrollRef.current) scrollRef.current.scrollLeft = Math.max(0, todayX - 220);
  };
  useLayoutEffect(scrollToToday, [scale]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {}, []);

  if (!prop) {
    const dates = schema.properties.filter((p) => p.type === "date");
    return (
      <div className="db-empty">
        <p>A timeline shows rows as bars using a Date property (with an end date for ranges).</p>
        {dates.map((d) => (
          <button key={d.id} type="button" className="btn" onClick={() => updateView(db.id, view.id, { dateProperty: d.id })}>
            Show by {d.name}
          </button>
        ))}
        {!readOnly && (
          <button
            type="button"
            className="btn-primary"
            onClick={() => updateView(db.id, view.id, { dateProperty: addProperty(db.id, "date", "Dates") })}
          >
            Add a Date property
          </button>
        )}
      </div>
    );
  }

  const width = days.length * px;
  const months: { label: string; left: number; width: number }[] = [];
  for (const d of days) {
    const label = format(d, scale === "month" ? "MMM yyyy" : "MMMM yyyy");
    const last = months[months.length - 1];
    if (last && last.label === label) last.width += px;
    else months.push({ label, left: months.length ? last.left + last.width : 0, width: px });
  }

  const newItem = () => {
    const id = addRow(db.id, { ...defaultsFromFilters(view, schema), [prop.id]: { start: format(new Date(), "yyyy-MM-dd"), end: format(addDays(new Date(), 2), "yyyy-MM-dd") } });
    openPeek(id);
    useApp.setState({ focusTitle: id });
  };

  return (
    <div className="timeline">
      <div className="tl-controls">
        <button type="button" className="btn-text" onClick={scrollToToday}>
          Today
        </button>
        <span style={{ flex: 1 }} />
        {(["day", "week", "month"] as const).map((s) => (
          <button key={s} type="button" className={cx("seg", scale === s && "active")} onClick={() => updateView(db.id, view.id, { timelineScale: s })}>
            {s[0].toUpperCase() + s.slice(1)}
          </button>
        ))}
      </div>
      <div className="tl-scroll" ref={scrollRef}>
        <div className="tl-inner" style={{ width: width + 220 }}>
          <div className="tl-head">
            <div className="tl-title-col head">{schema.properties[0]?.name || "Name"}</div>
            <div className="tl-dates" style={{ width }}>
              <div className="tl-months">
                {months.map((m) => (
                  <div key={m.label + m.left} className="tl-month" style={{ left: m.left, width: m.width }}>
                    <span>{m.label}</span>
                  </div>
                ))}
              </div>
              <div className="tl-days">
                {days.map((d, i) =>
                  scale !== "month" || d.getDay() === weekStartsOn ? (
                    <div
                      key={i}
                      className={cx("tl-day", differenceInCalendarDays(d, new Date()) === 0 && "today")}
                      style={{ left: i * px, width: scale === "month" ? px * 7 : px }}
                    >
                      {scale === "day" ? format(d, "EEEEE d") : format(d, "d")}
                    </div>
                  ) : null,
                )}
              </div>
            </div>
          </div>
          <div className="tl-rows">
            <div className="tl-grid-bg" style={{ left: 220, width }}>
              {scale !== "month" &&
                days.map((d, i) => (isWeekend(d) ? <div key={i} className="tl-weekend" style={{ left: i * px, width: px }} /> : null))}
              <div className="tl-today" style={{ left: todayX + px / 2 }} />
            </div>
            {rows.map((r) => {
              const v = r.props?.[prop.id];
              const has = isDateValue(v) && !!v.start && !!parseDateStr(v.start);
              return (
                <div className="tl-row" key={r.id}>
                  <div className="tl-title-col" onClick={() => openPeek(r.id)}>
                    <PageIcon icon={r.icon} type="page" size={15} />
                    <span>{pageTitle(r)}</span>
                  </div>
                  <div
                    className={cx("tl-lane", !has && "empty")}
                    style={{ width }}
                    onClick={(e) => {
                      if (has || readOnly) return;
                      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                      const day = Math.floor((e.clientX - rect.left) / px);
                      setRowProp(r.id, prop.id, { start: format(addDays(origin, day), "yyyy-MM-dd") });
                    }}
                    title={has ? undefined : "Click to set a date"}
                  >
                    {has && (
                      <Bar
                        row={r}
                        value={v as DateValue}
                        origin={origin}
                        px={px}
                        color={rowColor(r, cp)}
                        readOnly={readOnly}
                        onCommit={(nv) => setRowProp(r.id, prop.id, nv)}
                      />
                    )}
                  </div>
                </div>
              );
            })}
            {!readOnly && (
              <div className="tl-row">
                <div className="tl-title-col new" onClick={newItem}>
                  <Plus size={14} /> New
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
