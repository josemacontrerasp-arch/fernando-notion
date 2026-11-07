export type ID = string;

export type Color =
  | "default"
  | "gray"
  | "brown"
  | "orange"
  | "yellow"
  | "green"
  | "blue"
  | "purple"
  | "pink"
  | "red";

export const COLORS: Color[] = [
  "default",
  "gray",
  "brown",
  "orange",
  "yellow",
  "green",
  "blue",
  "purple",
  "pink",
  "red",
];

export type PropertyType =
  | "title"
  | "text"
  | "number"
  | "select"
  | "multi_select"
  | "status"
  | "date"
  | "checkbox"
  | "url"
  | "email"
  | "phone"
  | "person"
  | "relation"
  | "created_time"
  | "last_edited_time";

export type StatusGroup = "todo" | "in_progress" | "complete";

export interface SelectOption {
  id: ID;
  name: string;
  color: Color;
  group?: StatusGroup;
}

export type NumberFormat = "number" | "percent" | "dollar" | "euro" | "pound";

export interface PropertyDef {
  id: ID;
  name: string;
  type: PropertyType;
  options?: SelectOption[];
  numberFormat?: NumberFormat;
  relationDatabaseId?: ID | null;
}

/** start/end are "YYYY-MM-DD" or "YYYY-MM-DDTHH:mm" (local time). */
export interface DateValue {
  start: string;
  end?: string | null;
  time?: boolean;
}

export type PropertyValue = string | number | boolean | string[] | DateValue | null | undefined;

export type ViewType = "table" | "board" | "calendar" | "list" | "gallery" | "timeline";

export type FilterOp =
  | "contains"
  | "not_contains"
  | "is"
  | "is_not"
  | "is_empty"
  | "is_not_empty"
  | "gt"
  | "lt"
  | "checked"
  | "unchecked"
  | "before"
  | "after"
  | "on"
  | "today"
  | "this_week"
  | "next_7_days"
  | "past"
  | "future";

export interface Filter {
  id: ID;
  propertyId: ID;
  op: FilterOp;
  value?: any;
}

export interface Sort {
  id: ID;
  propertyId: ID;
  dir: "asc" | "desc";
}

export type CalendarMode = "month" | "week" | "day" | "agenda";

export interface DatabaseView {
  id: ID;
  name: string;
  type: ViewType;
  filters: Filter[];
  sorts: Sort[];
  groupBy?: ID | null;
  dateProperty?: ID | null;
  hidden?: ID[];
  widths?: Record<ID, number>;
  cardPreview?: "none" | "cover" | "content";
  cardSize?: "small" | "medium" | "large";
  calendarMode?: CalendarMode;
  timelineScale?: "day" | "week" | "month";
}

export interface DatabaseSchema {
  properties: PropertyDef[];
  views: DatabaseView[];
  rowOrder: ID[];
  /** Content blocks automatically added to new rows. */
  template?: any[] | null;
}

export interface PageComment {
  id: ID;
  text: string;
  createdAt: number;
}

export interface Page {
  id: ID;
  title: string;
  icon?: string | null;
  cover?: string | null;
  coverY?: number;
  parentId: ID | null;
  /** Ordered child pages shown in the sidebar (database rows are not listed here). */
  children: ID[];
  type: "page" | "database";
  /** A database embedded inside its parent page as a block. */
  inline?: boolean;
  /** BlockNote document. */
  content: any[];
  /** Bumped whenever content is replaced programmatically, forcing the editor to reload. */
  rev?: number;
  db?: DatabaseSchema;
  /** True when this page is a row of the database `parentId`. */
  isRow?: boolean;
  props?: Record<ID, PropertyValue>;
  createdAt: number;
  updatedAt: number;
  trashed?: boolean;
  trashedAt?: number;
  fullWidth?: boolean;
  smallText?: boolean;
  font?: "default" | "serif" | "mono";
  locked?: boolean;
  comments?: PageComment[];
}

export interface Settings {
  theme: "light" | "dark" | "system";
  workspaceName: string;
  userName: string;
  weekStartsOn: 0 | 1;
  sidebarWidth: number;
  sidebarCollapsed: boolean;
  defaultTaskDb?: ID | null;
  defaultEventDb?: ID | null;
  hiddenCalendars?: ID[];
  onboarded?: boolean;
}

export type Route =
  | { kind: "page"; id: ID }
  | { kind: "home" }
  | { kind: "calendar" }
  | { kind: "trash" }
  | { kind: "templates" }
  | { kind: "settings" };

export interface Meta {
  version: number;
  rootOrder: ID[];
  favorites: ID[];
  recent: ID[];
  settings: Settings;
  lastRoute?: Route;
}

export interface WorkspaceData {
  meta: Meta | null;
  pages: Page[];
}
