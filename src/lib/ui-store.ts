// Small per-device UI preferences (expanded tree items) kept in localStorage.
import { create } from "zustand";
import type { ID } from "./types";

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* ignore */
  }
}

interface UiState {
  expanded: Record<ID, boolean>;
  sections: Record<string, boolean>;
}

export const useUi = create<UiState>(() => ({
  expanded: read("fn.expanded", {} as Record<ID, boolean>),
  sections: read("fn.sections", { favorites: true, pages: true } as Record<string, boolean>),
}));

export function setExpanded(id: ID, open: boolean) {
  const expanded = { ...useUi.getState().expanded, [id]: open };
  useUi.setState({ expanded });
  write("fn.expanded", expanded);
}

export function toggleSection(name: string) {
  const sections = { ...useUi.getState().sections, [name]: !useUi.getState().sections[name] };
  useUi.setState({ sections });
  write("fn.sections", sections);
}
