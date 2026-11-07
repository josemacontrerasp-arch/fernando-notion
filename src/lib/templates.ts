// Ready-made templates (projects, tasks, calendars, agendas…) and the
// first-launch welcome content.

import { addDays, format, startOfWeek } from "date-fns";
import type { Color, DatabaseSchema, DatabaseView, ID, PropertyDef, PropertyType, SelectOption, StatusGroup } from "./types";
import { newProperty, newView } from "./db";
import { addRow, createPage, navigate, updateSettings, useApp } from "./store";
import { bullet, callout, divider, h, p, quote, rich, todo, toggle, uid } from "./utils";

// ----------------------------------------------------------- helpers ----

const day = (offset: number) => format(addDays(new Date(), offset), "yyyy-MM-dd");
const at = (offset: number, time: string) => `${day(offset)}T${time}`;

const opt = (name: string, color: Color, group?: StatusGroup): SelectOption => ({
  id: uid(),
  name,
  color,
  ...(group ? { group } : {}),
});

function prop(type: PropertyType, name: string, options?: SelectOption[], extra: Partial<PropertyDef> = {}): PropertyDef {
  const p = newProperty(type, name);
  if (options) p.options = options;
  return { ...p, ...extra };
}

function makeSchema(
  titleName: string,
  props: PropertyDef[],
  views: (s: DatabaseSchema) => DatabaseView[],
  template?: any[],
): DatabaseSchema {
  const schema: DatabaseSchema = {
    properties: [{ id: "title", name: titleName, type: "title" }, ...props],
    views: [],
    rowOrder: [],
    template: template || null,
  };
  schema.views = views(schema);
  return schema;
}

function view(schema: DatabaseSchema, type: DatabaseView["type"], name: string, extra: Partial<DatabaseView> = {}) {
  return { ...newView(type, schema, name), ...extra };
}

const byName = (schema: DatabaseSchema, name: string) => schema.properties.find((p) => p.name === name)!;
const optId = (schema: DatabaseSchema, propName: string, optName: string) =>
  byName(schema, propName).options!.find((o) => o.name === optName)!.id;

function dbPage(parentId: ID | null, title: string, icon: string, schema: DatabaseSchema, content?: any[]) {
  return createPage({ parentId, title, icon, type: "database", db: schema, content, fullWidth: true });
}

// --------------------------------------------------------- templates ----

export function createProjects(parentId: ID | null = null, samples = true): ID {
  const schema = makeSchema(
    "Project",
    [
      prop("status", "Status", [
        opt("Not started", "gray", "todo"),
        opt("Planning", "yellow", "in_progress"),
        opt("In progress", "blue", "in_progress"),
        opt("Done", "green", "complete"),
      ]),
      prop("select", "Priority", [opt("High", "red"), opt("Medium", "yellow"), opt("Low", "green")]),
      prop("date", "Dates"),
      prop("person", "Owner"),
      prop("multi_select", "Tags", [opt("Work", "blue"), opt("Personal", "pink"), opt("Learning", "purple"), opt("Home", "orange")]),
      prop("number", "Progress", undefined, { numberFormat: "percent" }),
    ],
    (s) => [
      view(s, "board", "Board", { groupBy: byName(s, "Status").id }),
      view(s, "timeline", "Timeline", { dateProperty: byName(s, "Dates").id, timelineScale: "week" }),
      view(s, "table", "All projects"),
      view(s, "calendar", "Calendar", { dateProperty: byName(s, "Dates").id }),
    ],
    [
      h(2, "Overview"),
      p("What is this project about and why does it matter?"),
      h(2, "Goals"),
      todo("Define the goal"),
      todo("Break it into tasks"),
      h(2, "Notes"),
      p(""),
    ],
  );
  const id = dbPage(parentId, "Projects", "🚀", schema);
  if (samples) {
    const S = (n: string) => byName(schema, n).id;
    addRow(id, {
      [S("Status")]: optId(schema, "Status", "In progress"),
      [S("Priority")]: optId(schema, "Priority", "High"),
      [S("Dates")]: { start: day(-4), end: day(10) },
      [S("Owner")]: "Fernando",
      [S("Tags")]: [optId(schema, "Tags", "Work")],
      [S("Progress")]: 40,
    }, { title: "Website redesign", icon: "🎨" });
    addRow(id, {
      [S("Status")]: optId(schema, "Status", "Planning"),
      [S("Priority")]: optId(schema, "Priority", "Medium"),
      [S("Dates")]: { start: day(6), end: day(24) },
      [S("Owner")]: "Fernando",
      [S("Tags")]: [optId(schema, "Tags", "Work"), optId(schema, "Tags", "Learning")],
      [S("Progress")]: 10,
    }, { title: "Launch the new service", icon: "📦" });
    addRow(id, {
      [S("Status")]: optId(schema, "Status", "Not started"),
      [S("Priority")]: optId(schema, "Priority", "Low"),
      [S("Dates")]: { start: day(14), end: day(35) },
      [S("Owner")]: "Fernando",
      [S("Tags")]: [optId(schema, "Tags", "Home")],
      [S("Progress")]: 0,
    }, { title: "Organise the home office", icon: "🏡" });
  }
  return id;
}

export function createTasks(parentId: ID | null = null, samples = true, projectsDbId?: ID | null): ID {
  const projectsDb = projectsDbId ?? null;
  const schema = makeSchema(
    "Task",
    [
      prop("status", "Status", [opt("To do", "gray", "todo"), opt("Doing", "blue", "in_progress"), opt("Done", "green", "complete")]),
      prop("date", "Due"),
      prop("select", "Priority", [opt("High", "red"), opt("Medium", "yellow"), opt("Low", "green")]),
      ...(projectsDb ? [prop("relation", "Project", undefined, { relationDatabaseId: projectsDb })] : []),
      prop("multi_select", "Tags", [opt("Errand", "orange"), opt("Call", "purple"), opt("Deep work", "blue")]),
    ],
    (s) => [
      view(s, "board", "Board", { groupBy: byName(s, "Status").id }),
      view(s, "list", "Today", {
        filters: [{ id: uid(), propertyId: byName(s, "Due").id, op: "today" }],
      }),
      view(s, "calendar", "Calendar", { dateProperty: byName(s, "Due").id }),
      view(s, "table", "All tasks", { sorts: [{ id: uid(), propertyId: byName(s, "Due").id, dir: "asc" }] }),
    ],
  );
  const id = dbPage(parentId, "Tasks", "✅", schema);
  if (samples) {
    const S = (n: string) => byName(schema, n).id;
    const proj = (title: string) => {
      if (!projectsDb) return undefined;
      const pages = useApp.getState().pages;
      const r = Object.values(pages).find((x) => x.parentId === projectsDb && x.title === title);
      return r ? [r.id] : undefined;
    };
    const rel = (title: string) => (projectsDb ? { [S("Project")]: proj(title) || [] } : {});
    addRow(id, { [S("Status")]: optId(schema, "Status", "Doing"), [S("Due")]: { start: day(0) }, [S("Priority")]: optId(schema, "Priority", "High"), ...rel("Website redesign") }, { title: "Review the homepage design" });
    addRow(id, { [S("Status")]: optId(schema, "Status", "To do"), [S("Due")]: { start: at(0, "16:00"), time: true }, [S("Priority")]: optId(schema, "Priority", "Medium"), [S("Tags")]: [optId(schema, "Tags", "Call")] }, { title: "Call the accountant" });
    addRow(id, { [S("Status")]: optId(schema, "Status", "To do"), [S("Due")]: { start: day(1) }, [S("Priority")]: optId(schema, "Priority", "Low"), [S("Tags")]: [optId(schema, "Tags", "Errand")] }, { title: "Buy printer ink" });
    addRow(id, { [S("Status")]: optId(schema, "Status", "To do"), [S("Due")]: { start: day(3) }, [S("Priority")]: optId(schema, "Priority", "High"), ...rel("Launch the new service"), [S("Tags")]: [optId(schema, "Tags", "Deep work")] }, { title: "Write the launch plan" });
    addRow(id, { [S("Status")]: optId(schema, "Status", "Done"), [S("Due")]: { start: day(-1) }, [S("Priority")]: optId(schema, "Priority", "Medium"), ...rel("Website redesign") }, { title: "Collect feedback from the team" });
  }
  return id;
}

export function createCalendar(parentId: ID | null = null, samples = true): ID {
  const schema = makeSchema(
    "Event",
    [
      prop("date", "Date"),
      prop("select", "Type", [opt("Meeting", "blue"), opt("Event", "purple"), opt("Deadline", "red"), opt("Personal", "green"), opt("Travel", "orange")]),
      prop("text", "Location"),
      prop("person", "With"),
    ],
    (s) => [
      view(s, "calendar", "Month", { dateProperty: byName(s, "Date").id, calendarMode: "month" }),
      view(s, "calendar", "Week", { dateProperty: byName(s, "Date").id, calendarMode: "week" }),
      view(s, "calendar", "Agenda", { dateProperty: byName(s, "Date").id, calendarMode: "agenda" }),
      view(s, "table", "All events", { sorts: [{ id: uid(), propertyId: byName(s, "Date").id, dir: "asc" }] }),
    ],
    [h(3, "Agenda"), bullet(""), h(3, "Notes"), p("")],
  );
  const id = dbPage(parentId, "Calendar", "📅", schema);
  if (samples) {
    const S = (n: string) => byName(schema, n).id;
    const T = (n: string) => optId(schema, "Type", n);
    addRow(id, { [S("Date")]: { start: at(0, "10:00"), end: at(0, "11:00"), time: true }, [S("Type")]: T("Meeting"), [S("Location")]: "Video call", [S("With")]: "Team" }, { title: "Weekly team meeting" });
    addRow(id, { [S("Date")]: { start: at(1, "13:30"), end: at(1, "14:30"), time: true }, [S("Type")]: T("Personal"), [S("Location")]: "Downtown" }, { title: "Lunch with Ana", icon: "🍽️" });
    addRow(id, { [S("Date")]: { start: day(2) }, [S("Type")]: T("Deadline") }, { title: "Send monthly report", icon: "📨" });
    addRow(id, { [S("Date")]: { start: day(5), end: day(7) }, [S("Type")]: T("Travel"), [S("Location")]: "Madrid" }, { title: "Weekend trip", icon: "✈️" });
    addRow(id, { [S("Date")]: { start: at(3, "09:00"), end: at(3, "09:30"), time: true }, [S("Type")]: T("Meeting"), [S("With")]: "Carlos" }, { title: "1:1 with Carlos" });
  }
  return id;
}

export function createMeetingNotes(parentId: ID | null = null, samples = true): ID {
  const schema = makeSchema(
    "Meeting",
    [
      prop("date", "Date"),
      prop("select", "Type", [opt("Standup", "blue"), opt("1:1", "purple"), opt("Planning", "orange"), opt("Review", "green"), opt("Client", "red")]),
      prop("person", "Attendees"),
    ],
    (s) => [
      view(s, "table", "All meetings", { sorts: [{ id: uid(), propertyId: byName(s, "Date").id, dir: "desc" }] }),
      view(s, "calendar", "Calendar", { dateProperty: byName(s, "Date").id }),
      view(s, "board", "By type", { groupBy: byName(s, "Type").id }),
    ],
    [
      h(2, "Agenda"),
      numbered(""),
      h(2, "Notes"),
      p(""),
      h(2, "Action items"),
      todo(""),
    ],
  );
  const id = dbPage(parentId, "Meeting Notes", "🗒️", schema);
  if (samples) {
    const S = (n: string) => byName(schema, n).id;
    addRow(id, { [S("Date")]: { start: at(0, "10:00"), time: true }, [S("Type")]: optId(schema, "Type", "Planning"), [S("Attendees")]: "Team" }, {
      title: "Kick-off: website redesign",
      content: [
        h(2, "Agenda"),
        numbered("Goals for the redesign"),
        numbered("Timeline and owners"),
        h(2, "Notes"),
        p("Everyone agreed to keep the brand colours and focus on speed."),
        h(2, "Action items"),
        todo("Share the moodboard"),
        todo("Book the next review", true),
      ],
    });
  }
  return id;
}

function numbered(text: string) {
  return { type: "numberedListItem", content: text ? [{ type: "text", text, styles: {} }] : [] };
}

export function createWeeklyAgenda(parentId: ID | null = null): ID {
  const ws = useApp.getState().meta.settings.weekStartsOn;
  const monday = startOfWeek(new Date(), { weekStartsOn: ws });
  const days = Array.from({ length: 7 }, (_, i) => addDays(monday, i));
  const content: any[] = [
    callout("🎯", "Top 3 goals for this week", "yellow"),
    todo(""),
    todo(""),
    todo(""),
    divider(),
  ];
  for (const d of days) {
    content.push(h(3, format(d, "EEEE, MMM d")));
    content.push(todo(""));
  }
  content.push(divider(), h(2, "Notes & reflections"), p(""));
  return createPage({
    parentId,
    title: `Week of ${format(monday, "MMM d")}`,
    icon: "🗓️",
    content,
  });
}

export function createJournal(parentId: ID | null = null, samples = true): ID {
  const schema = makeSchema(
    "Entry",
    [
      prop("date", "Date"),
      prop("select", "Mood", [opt("😄 Great", "green"), opt("🙂 Good", "blue"), opt("😐 Okay", "yellow"), opt("😔 Rough", "gray")]),
    ],
    (s) => [
      view(s, "calendar", "Calendar", { dateProperty: byName(s, "Date").id }),
      view(s, "list", "Entries", { sorts: [{ id: uid(), propertyId: byName(s, "Date").id, dir: "desc" }] }),
    ],
    [h(3, "🙏 Grateful for"), bullet(""), h(3, "🎯 Today's focus"), todo(""), h(3, "📝 Notes"), p("")],
  );
  const id = dbPage(parentId, "Journal", "📔", schema);
  if (samples) {
    const S = (n: string) => byName(schema, n).id;
    addRow(id, { [S("Date")]: { start: day(0) }, [S("Mood")]: optId(schema, "Mood", "🙂 Good") }, { title: format(new Date(), "EEEE, MMMM d") });
  }
  return id;
}

export function createReadingList(parentId: ID | null = null, samples = true): ID {
  const schema = makeSchema(
    "Title",
    [
      prop("text", "Author"),
      prop("select", "Type", [opt("Book", "blue"), opt("Article", "green"), opt("Podcast", "purple"), opt("Video", "red")]),
      prop("status", "Status", [opt("To read", "gray", "todo"), opt("Reading", "blue", "in_progress"), opt("Finished", "green", "complete")]),
      prop("select", "Rating", [opt("⭐⭐⭐⭐⭐", "yellow"), opt("⭐⭐⭐⭐", "yellow"), opt("⭐⭐⭐", "yellow"), opt("⭐⭐", "gray"), opt("⭐", "gray")]),
      prop("url", "Link"),
    ],
    (s) => [
      view(s, "gallery", "Gallery", { cardPreview: "cover", cardSize: "medium" }),
      view(s, "board", "By status", { groupBy: byName(s, "Status").id }),
      view(s, "table", "Table"),
    ],
    [h(2, "Summary"), p(""), h(2, "Favourite quotes"), quote(""), h(2, "Takeaways"), bullet("")],
  );
  const id = dbPage(parentId, "Reading List", "📚", schema);
  if (samples) {
    const S = (n: string) => byName(schema, n).id;
    addRow(id, { [S("Author")]: "Cal Newport", [S("Type")]: optId(schema, "Type", "Book"), [S("Status")]: optId(schema, "Status", "Reading") }, { title: "Deep Work", icon: "📘" });
    addRow(id, { [S("Author")]: "James Clear", [S("Type")]: optId(schema, "Type", "Book"), [S("Status")]: optId(schema, "Status", "Finished"), [S("Rating")]: optId(schema, "Rating", "⭐⭐⭐⭐⭐") }, { title: "Atomic Habits", icon: "📗" });
  }
  return id;
}

export function createHabits(parentId: ID | null = null, samples = true): ID {
  const schema = makeSchema(
    "Day",
    [
      prop("date", "Date"),
      prop("checkbox", "Exercise"),
      prop("checkbox", "Read"),
      prop("checkbox", "Meditate"),
      prop("checkbox", "Water"),
      prop("checkbox", "Sleep 8h"),
      prop("text", "Notes"),
    ],
    (s) => [
      view(s, "table", "Tracker", { sorts: [{ id: uid(), propertyId: byName(s, "Date").id, dir: "desc" }] }),
      view(s, "calendar", "Calendar", { dateProperty: byName(s, "Date").id }),
    ],
  );
  const id = dbPage(parentId, "Habit Tracker", "💪", schema);
  if (samples) {
    const S = (n: string) => byName(schema, n).id;
    for (let i = 2; i >= 0; i--) {
      addRow(
        id,
        { [S("Date")]: { start: day(-i) }, [S("Exercise")]: i !== 1, [S("Read")]: true, [S("Water")]: i === 0 },
        { title: format(addDays(new Date(), -i), "EEE, MMM d") },
      );
    }
  }
  return id;
}

export function createNotesPage(parentId: ID | null = null): ID {
  return createPage({
    parentId,
    title: "Quick Notes",
    icon: "📝",
    content: [p("Capture ideas here. Type “/” to add headings, lists, tables, images and more."), p("")],
  });
}

export function createGoals(parentId: ID | null = null, samples = true): ID {
  const schema = makeSchema(
    "Goal",
    [
      prop("status", "Status", [opt("Not started", "gray", "todo"), opt("On track", "green", "in_progress"), opt("At risk", "red", "in_progress"), opt("Achieved", "blue", "complete")]),
      prop("select", "Area", [opt("Career", "blue"), opt("Health", "green"), opt("Finance", "yellow"), opt("Relationships", "pink"), opt("Growth", "purple")]),
      prop("date", "Target date"),
      prop("number", "Progress", undefined, { numberFormat: "percent" }),
    ],
    (s) => [
      view(s, "board", "Board", { groupBy: byName(s, "Status").id }),
      view(s, "table", "All goals"),
      view(s, "timeline", "Timeline", { dateProperty: byName(s, "Target date").id, timelineScale: "month" }),
    ],
    [h(2, "Why this matters"), p(""), h(2, "Milestones"), todo(""), todo("")],
  );
  const id = dbPage(parentId, "Goals", "🎯", schema);
  if (samples) {
    const S = (n: string) => byName(schema, n).id;
    addRow(id, { [S("Status")]: optId(schema, "Status", "On track"), [S("Area")]: optId(schema, "Area", "Health"), [S("Target date")]: { start: day(60) }, [S("Progress")]: 35 }, { title: "Run a 10k", icon: "🏃" });
  }
  return id;
}

export interface TemplateDef {
  id: string;
  name: string;
  icon: string;
  description: string;
  create: (parentId: ID | null) => ID;
}

export const TEMPLATES: TemplateDef[] = [
  { id: "projects", name: "Project Tracker", icon: "🚀", description: "Board, timeline and calendar of your projects with status, priority and owners.", create: (pid) => createProjects(pid) },
  {
    id: "tasks",
    name: "Task List",
    icon: "✅",
    description: "To-dos with due dates, priorities and a Today view. Links to your Projects.",
    create: (pid) => {
      const projects = Object.values(useApp.getState().pages).find((x) => x.type === "database" && x.title === "Projects" && !x.trashed);
      return createTasks(pid, true, projects?.id ?? null);
    },
  },
  { id: "calendar", name: "Calendar & Agenda", icon: "📅", description: "Month, week and agenda views for meetings, events and deadlines.", create: (pid) => createCalendar(pid) },
  { id: "weekly", name: "Weekly Agenda", icon: "🗓️", description: "Plan the week: top goals, a to-do list for every day and reflections.", create: (pid) => createWeeklyAgenda(pid) },
  { id: "meetings", name: "Meeting Notes", icon: "🗒️", description: "Every meeting gets agenda, notes and action items automatically.", create: (pid) => createMeetingNotes(pid) },
  { id: "journal", name: "Daily Journal", icon: "📔", description: "One entry per day with mood, gratitude and focus.", create: (pid) => createJournal(pid) },
  { id: "goals", name: "Goals", icon: "🎯", description: "Track goals by area with progress and a timeline.", create: (pid) => createGoals(pid) },
  { id: "habits", name: "Habit Tracker", icon: "💪", description: "Tick off daily habits and see your streaks on a calendar.", create: (pid) => createHabits(pid) },
  { id: "reading", name: "Reading List", icon: "📚", description: "Books, articles and podcasts in a gallery with ratings.", create: (pid) => createReadingList(pid) },
  { id: "notes", name: "Quick Notes", icon: "📝", description: "A simple page for notes and ideas.", create: (pid) => createNotesPage(pid) },
];

// ------------------------------------------------------- first launch ----

export function seedWorkspace() {
  const projects = createProjects(null, true);
  const tasks = createTasks(null, true, projects);
  const calendar = createCalendar(null, true);
  const welcome = createPage({
    title: "Welcome to Fernando Notion",
    icon: "👋",
    index: 0,
    content: [
      callout("💡", "Everything you write is saved automatically on this computer — there is no save button.", "blue"),
      h(2, "Start here"),
      todo("Click anywhere below and start typing"),
      todo("Type “/” to insert headings, to-do lists, tables, images, callouts, boards, calendars…"),
      todo("Type “@” to mention another page or a date"),
      todo("Drag the ⋮⋮ handle on the left of a block to move it"),
      todo("Open Projects, Tasks and Calendar in the sidebar — they are full databases"),
      todo("Press Ctrl+K to search everything"),
      h(2, "Your workspace"),
      { type: "pageLink", props: { pageId: projects } },
      { type: "pageLink", props: { pageId: tasks } },
      { type: "pageLink", props: { pageId: calendar } },
      h(2, "Good to know"),
      toggle("Where are my pages saved?", [
        p("In the desktop app, every page is a file inside Documents › Fernando Notion. A backup copy of the whole workspace is made every day in the backups folder. You can change the folder (for example to OneDrive or Dropbox) in Settings."),
      ]),
      toggle("Keyboard shortcuts", [
        rich([{ text: "Ctrl+K", code: true }, "  search  ·  ", { text: "Ctrl+N", code: true }, "  new page  ·  ", { text: "Ctrl+\\", code: true }, "  toggle sidebar"]),
        rich([{ text: "Ctrl+B / I / U", code: true }, "  bold, italic, underline  ·  ", { text: "Ctrl+Z", code: true }, "  undo"]),
        rich([{ text: "Alt+←  /  Alt+→", code: true }, "  back / forward  ·  ", { text: "Ctrl+Shift+L", code: true }, "  dark mode"]),
        rich(["Markdown works too: ", { text: "# ", code: true }, " heading, ", { text: "- ", code: true }, " bullet, ", { text: "[] ", code: true }, " to-do, ", { text: "> ", code: true }, " toggle, ", { text: "```", code: true }, " code."]),
      ]),
      toggle("Templates", [p("Open Templates in the sidebar to add a Weekly Agenda, Meeting Notes, Journal, Goals, Habit Tracker or Reading List in one click.")]),
      p(""),
    ],
  });
  updateSettings({ defaultTaskDb: tasks, defaultEventDb: calendar, onboarded: true });
  navigate({ kind: "page", id: welcome });
}
