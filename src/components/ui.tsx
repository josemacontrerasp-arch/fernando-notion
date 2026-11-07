// Small UI toolkit: popovers, menus, modals, tags, emoji picker.

import {
  autoUpdate,
  flip,
  offset as offsetMw,
  shift,
  size,
  useFloating,
  type Placement,
  type VirtualElement,
} from "@floating-ui/react";
import React, { lazy, Suspense, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import type { Color } from "../lib/types";
import { useApp } from "../lib/store";
import { cx } from "../lib/utils";

// ------------------------------------------------------- layer stack ----

type Anchor = HTMLElement | VirtualElement | null;
interface Layer {
  id: number;
  el: () => HTMLElement | null;
  anchor: Anchor;
  close: () => void;
}
const layers: Layer[] = [];
let layerSeq = 0;

function insideAnyLayerAbove(index: number, target: Node) {
  for (let i = layers.length - 1; i > index; i--) if (layers[i].el()?.contains(target)) return true;
  return false;
}

if (typeof document !== "undefined") {
  document.addEventListener(
    "mousedown",
    (e) => {
      const target = e.target as Node;
      if (!layers.length) return;
      // Ignore clicks inside third-party floating UI (e.g. emoji picker skin menu).
      for (let i = layers.length - 1; i >= 0; i--) {
        const l = layers[i];
        if (l.el()?.contains(target) || insideAnyLayerAbove(i, target)) break;
        if (l.anchor instanceof HTMLElement && l.anchor.contains(target)) break;
        l.close();
      }
    },
    true,
  );
  document.addEventListener(
    "keydown",
    (e) => {
      if (e.key !== "Escape" || !layers.length) return;
      const top = layers[layers.length - 1];
      e.stopPropagation();
      e.preventDefault();
      top.close();
    },
    true,
  );
}

function useLayer(el: () => HTMLElement | null, anchor: Anchor, close: () => void) {
  const closeRef = useRef(close);
  closeRef.current = close;
  useEffect(() => {
    const layer: Layer = { id: ++layerSeq, el, anchor, close: () => closeRef.current() };
    layers.push(layer);
    return () => {
      const i = layers.indexOf(layer);
      if (i >= 0) layers.splice(i, 1);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [anchor]);
}

export const hasOpenLayers = () => layers.length > 0;

// ------------------------------------------------------------ popover ----

export function pointAnchor(x: number, y: number): VirtualElement {
  return {
    getBoundingClientRect: () => ({ x, y, left: x, top: y, right: x, bottom: y, width: 0, height: 0, toJSON() {} }) as DOMRect,
  };
}

export function Popover({
  anchor,
  onClose,
  children,
  placement = "bottom-start",
  className,
  style,
  offset = 4,
}: {
  anchor: Anchor;
  onClose: () => void;
  children: React.ReactNode;
  placement?: Placement;
  className?: string;
  style?: React.CSSProperties;
  offset?: number;
}) {
  const { refs, floatingStyles } = useFloating({
    placement,
    strategy: "fixed",
    middleware: [
      offsetMw(offset),
      flip({ padding: 8 }),
      shift({ padding: 8 }),
      size({
        padding: 8,
        apply({ availableHeight, elements }) {
          elements.floating.style.maxHeight = `${Math.max(160, availableHeight)}px`;
        },
      }),
    ],
    whileElementsMounted: autoUpdate,
  });
  const elRef = useRef<HTMLDivElement | null>(null);
  useLayoutEffect(() => {
    refs.setPositionReference(anchor);
  }, [anchor, refs]);
  useLayer(() => elRef.current, anchor, onClose);
  return createPortal(
    <div
      ref={(node) => {
        elRef.current = node;
        refs.setFloating(node);
      }}
      className={cx("popover", className)}
      style={{ ...floatingStyles, ...style }}
      onMouseDown={(e) => e.stopPropagation()}
    >
      {children}
    </div>,
    document.body,
  );
}

/** Hook that manages "which element is this popover anchored to". */
export function usePopover() {
  const [anchor, setAnchor] = useState<Anchor>(null);
  return {
    anchor,
    open: (a: Anchor) => setAnchor(a),
    toggle: (a: HTMLElement) => setAnchor((cur) => (cur ? null : a)),
    close: () => setAnchor(null),
    isOpen: !!anchor,
  };
}

// --------------------------------------------------------------- menu ----

export function Menu({ children, width = 240, className }: { children: React.ReactNode; width?: number; className?: string }) {
  return (
    <div className={cx("menu", className)} style={{ width }}>
      {children}
    </div>
  );
}

export function MenuItem({
  icon,
  label,
  onClick,
  right,
  danger,
  active,
  disabled,
  title,
}: {
  icon?: React.ReactNode;
  label: React.ReactNode;
  onClick?: (e: React.MouseEvent<HTMLButtonElement>) => void;
  right?: React.ReactNode;
  danger?: boolean;
  active?: boolean;
  disabled?: boolean;
  title?: string;
}) {
  return (
    <button
      type="button"
      className={cx("menu-item", danger && "danger", active && "active")}
      onClick={onClick}
      disabled={disabled}
      title={title}
    >
      {icon !== undefined && <span className="menu-icon">{icon}</span>}
      <span className="menu-label">{label}</span>
      {right !== undefined && <span className="menu-right">{right}</span>}
    </button>
  );
}

export const MenuSep = () => <div className="menu-sep" />;
export const MenuLabel = ({ children }: { children: React.ReactNode }) => <div className="menu-heading">{children}</div>;

// -------------------------------------------------------------- modal ----

export function Modal({
  onClose,
  children,
  width = 560,
  className,
  align = "center",
}: {
  onClose: () => void;
  children: React.ReactNode;
  width?: number | string;
  className?: string;
  align?: "center" | "top";
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  useLayer(() => ref.current, null, onClose);
  return createPortal(
    <div className={cx("modal-overlay", align === "top" && "top")}>
      <div ref={ref} className={cx("modal", className)} style={{ width }} onMouseDown={(e) => e.stopPropagation()}>
        {children}
      </div>
    </div>,
    document.body,
  );
}

// ---------------------------------------------------------------- tag ----

export function Tag({
  color = "default",
  children,
  onRemove,
  className,
}: {
  color?: Color;
  children: React.ReactNode;
  onRemove?: () => void;
  className?: string;
}) {
  return (
    <span className={cx("tag", `c-${color}`, className)}>
      <span className="tag-text">{children}</span>
      {onRemove && (
        <button
          type="button"
          className="tag-x"
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
        >
          ×
        </button>
      )}
    </span>
  );
}

export function ColorDot({ color }: { color: Color }) {
  return <span className={cx("color-dot", `c-${color}`)} />;
}

// --------------------------------------------------------- theme hook ----

function subscribeScheme(cb: () => void) {
  const mq = window.matchMedia("(prefers-color-scheme: dark)");
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
}

export function useResolvedTheme(): "light" | "dark" {
  const pref = useApp((s) => s.meta.settings.theme);
  const systemDark = useSyncExternalStore(
    subscribeScheme,
    () => window.matchMedia("(prefers-color-scheme: dark)").matches,
    () => false,
  );
  if (pref === "system") return systemDark ? "dark" : "light";
  return pref;
}

// ------------------------------------------------------- emoji picker ----

const LazyPicker = lazy(() => import("emoji-picker-react"));

export function EmojiPopover({
  anchor,
  onClose,
  onPick,
  onRemove,
}: {
  anchor: Anchor;
  onClose: () => void;
  onPick: (emoji: string) => void;
  onRemove?: () => void;
}) {
  const theme = useResolvedTheme();
  return (
    <Popover anchor={anchor} onClose={onClose} className="emoji-popover">
      <div className="emoji-head">
        <span>Choose an icon</span>
        <span style={{ flex: 1 }} />
        <button
          type="button"
          className="btn-text"
          onClick={() => {
            const pool = ["📄", "📝", "🚀", "✅", "📅", "💡", "🎯", "📚", "🗂️", "⭐", "🔥", "🌱", "🏠", "💼", "🎨", "🧠"];
            onPick(pool[Math.floor(Math.random() * pool.length)]);
          }}
        >
          Random
        </button>
        {onRemove && (
          <button type="button" className="btn-text" onClick={onRemove}>
            Remove
          </button>
        )}
      </div>
      <Suspense fallback={<div className="emoji-loading">Loading…</div>}>
        <LazyPicker
          onEmojiClick={(d: any) => onPick(d.emoji)}
          emojiStyle={"native" as any}
          theme={theme as any}
          lazyLoadEmojis
          width={352}
          height={380}
          previewConfig={{ showPreview: false }}
          searchPlaceholder="Search emoji"
        />
      </Suspense>
    </Popover>
  );
}

// -------------------------------------------------------- inline input ----

/** Text input that commits on blur / Enter and cancels on Escape. */
export function InlineInput({
  value,
  onCommit,
  placeholder,
  className,
  autoFocus = true,
  type = "text",
  onCancel,
  selectAll = false,
}: {
  value: string;
  onCommit: (v: string) => void;
  placeholder?: string;
  className?: string;
  autoFocus?: boolean;
  type?: string;
  onCancel?: () => void;
  selectAll?: boolean;
}) {
  const [v, setV] = useState(value);
  const done = useRef(false);
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (autoFocus && ref.current) {
      ref.current.focus();
      if (selectAll) ref.current.select();
    }
  }, [autoFocus, selectAll]);
  return (
    <input
      ref={ref}
      className={cx("inline-input", className)}
      value={v}
      type={type}
      placeholder={placeholder}
      onChange={(e) => setV(e.target.value)}
      onBlur={() => {
        if (!done.current) {
          done.current = true;
          onCommit(v);
        }
      }}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === "Enter") {
          done.current = true;
          onCommit(v);
        } else if (e.key === "Escape") {
          done.current = true;
          (onCancel || (() => onCommit(value)))();
        }
      }}
    />
  );
}

export function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      className={cx("switch", checked && "on")}
      onClick={() => onChange(!checked)}
    >
      <span className="switch-knob" />
    </button>
  );
}
