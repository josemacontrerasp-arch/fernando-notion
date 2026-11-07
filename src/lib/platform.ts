// Platform-aware keyboard shortcut labels (⌘ on Mac, Ctrl elsewhere).
import { fnApi } from "./storage";

const nav = typeof navigator !== "undefined" ? navigator : undefined;
export const isMac =
  (fnApi as { platform?: string } | undefined)?.platform === "darwin" ||
  /Mac|iPhone|iPad/i.test(nav?.platform || nav?.userAgent || "");

export const KEYS = isMac
  ? {
      search: "⌘K",
      newPage: "⌘N",
      sidebar: "⌘\\",
      darkMode: "⌘⇧L",
      back: "⌘[",
      forward: "⌘]",
      backForward: "⌘[ / ⌘]",
      format: "⌘B / ⌘I / ⌘U",
      undo: "⌘Z / ⌘⇧Z",
      settings: "⌘,",
    }
  : {
      search: "Ctrl+K",
      newPage: "Ctrl+N",
      sidebar: "Ctrl+\\",
      darkMode: "Ctrl+Shift+L",
      back: "Alt+←",
      forward: "Alt+→",
      backForward: "Alt+← / Alt+→",
      format: "Ctrl+B / I / U",
      undo: "Ctrl+Z / Ctrl+Shift+Z",
      settings: "",
    };
