import {
  addDays,
  addMonths,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  startOfMonth,
  startOfWeek,
} from "date-fns";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useMemo, useState } from "react";
import type { DateValue } from "../lib/types";
import { useApp } from "../lib/store";
import { cx, parseDateStr } from "../lib/utils";
import { Toggle } from "./ui";

const keyOf = (d: Date) => format(d, "yyyy-MM-dd");
const timeOf = (s?: string | null) => (s && s.includes("T") ? s.slice(11, 16) : "");

export function DatePicker({
  value,
  onChange,
  allowRange = true,
}: {
  value: DateValue | null | undefined;
  onChange: (v: DateValue | null) => void;
  allowRange?: boolean;
}) {
  const weekStartsOn = useApp((s) => s.meta.settings.weekStartsOn);
  const start = parseDateStr(value?.start);
  const end = parseDateStr(value?.end);
  const [month, setMonth] = useState<Date>(start || new Date());
  const [range, setRange] = useState<boolean>(!!value?.end);
  const [picking, setPicking] = useState<"start" | "end">("start");
  const withTime = !!value?.time || !!(value?.start && value.start.includes("T"));

  const days = useMemo(() => {
    const first = startOfWeek(startOfMonth(month), { weekStartsOn });
    const last = endOfWeek(endOfMonth(month), { weekStartsOn });
    const out: Date[] = [];
    for (let d = first; d <= last; d = addDays(d, 1)) out.push(d);
    return out;
  }, [month, weekStartsOn]);

  const compose = (d: Date, time: string) => (withTime ? `${keyOf(d)}T${time || "09:00"}` : keyOf(d));

  const pick = (d: Date) => {
    if (range && picking === "end" && start) {
      let s = start;
      let e = d;
      if (e < s) [s, e] = [e, s];
      onChange({
        start: compose(s, timeOf(value?.start)),
        end: compose(e, timeOf(value?.end) || timeOf(value?.start)),
        time: withTime || undefined,
      });
      setPicking("start");
    } else {
      onChange({
        start: compose(d, timeOf(value?.start)),
        end: range ? value?.end ?? null : null,
        time: withTime || undefined,
      });
      if (range) setPicking("end");
    }
  };

  const setTime = (which: "start" | "end", t: string) => {
    if (!value?.start) return;
    const s = parseDateStr(value.start)!;
    const e = parseDateStr(value.end);
    onChange({
      start: which === "start" ? `${keyOf(s)}T${t}` : value.start,
      end: e ? (which === "end" ? `${keyOf(e)}T${t}` : value.end) : null,
      time: true,
    });
  };

  const toggleTime = (on: boolean) => {
    const base = value?.start ? parseDateStr(value.start)! : new Date();
    const e = parseDateStr(value?.end);
    if (on) {
      onChange({
        start: `${keyOf(base)}T${timeOf(value?.start) || "09:00"}`,
        end: e ? `${keyOf(e)}T${timeOf(value?.end) || "10:00"}` : null,
        time: true,
      });
    } else {
      onChange({ start: keyOf(base), end: e ? keyOf(e) : null });
    }
  };

  const toggleRange = (on: boolean) => {
    setRange(on);
    if (!on && value?.start) onChange({ start: value.start, end: null, time: value.time });
    if (on) setPicking(value?.start ? "end" : "start");
  };

  const weekdays = Array.from({ length: 7 }, (_, i) => format(addDays(startOfWeek(new Date(), { weekStartsOn }), i), "EEEEEE"));
  const today = new Date();

  return (
    <div className="datepicker" onMouseDown={(e) => e.stopPropagation()}>
      <div className="dp-fields">
        <div className={cx("dp-field", picking === "start" && range && "active")} onClick={() => setPicking("start")}>
          {start ? format(start, "MMM d, yyyy") : <span className="muted">Start</span>}
        </div>
        {range && (
          <div className={cx("dp-field", picking === "end" && "active")} onClick={() => setPicking("end")}>
            {end ? format(end, "MMM d, yyyy") : <span className="muted">End</span>}
          </div>
        )}
      </div>
      <div className="dp-head">
        <span className="dp-month">{format(month, "MMMM yyyy")}</span>
        <button type="button" className="btn-text" onClick={() => setMonth(new Date())}>
          Today
        </button>
        <button type="button" className="icon-btn sm" onClick={() => setMonth(addMonths(month, -1))}>
          <ChevronLeft size={16} />
        </button>
        <button type="button" className="icon-btn sm" onClick={() => setMonth(addMonths(month, 1))}>
          <ChevronRight size={16} />
        </button>
      </div>
      <div className="dp-grid">
        {weekdays.map((w) => (
          <div key={w} className="dp-wd">
            {w}
          </div>
        ))}
        {days.map((d) => {
          const inRange = start && end && d >= start && d <= end;
          const selected = (start && isSameDay(d, start)) || (end && isSameDay(d, end));
          return (
            <button
              type="button"
              key={d.toISOString()}
              className={cx(
                "dp-day",
                !isSameMonth(d, month) && "other",
                isSameDay(d, today) && "today",
                inRange && "in-range",
                selected && "selected",
              )}
              onClick={() => pick(d)}
            >
              {d.getDate()}
            </button>
          );
        })}
      </div>
      <div className="dp-options">
        {allowRange && (
          <label className="dp-option">
            <span>End date</span>
            <Toggle checked={range} onChange={toggleRange} />
          </label>
        )}
        <label className="dp-option">
          <span>Include time</span>
          <Toggle checked={withTime} onChange={toggleTime} />
        </label>
        {withTime && value?.start && (
          <div className="dp-times">
            <input type="time" value={timeOf(value.start)} onChange={(e) => setTime("start", e.target.value)} />
            {value.end && (
              <>
                <span>→</span>
                <input type="time" value={timeOf(value.end)} onChange={(e) => setTime("end", e.target.value)} />
              </>
            )}
          </div>
        )}
      </div>
      <div className="dp-foot">
        <button type="button" className="btn-text" onClick={() => onChange(null)}>
          Clear
        </button>
      </div>
    </div>
  );
}
