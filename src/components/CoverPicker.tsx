import { useState } from "react";
import { saveAsset } from "../lib/storage";
import { updatePage } from "../lib/store";
import type { ID } from "../lib/types";
import { cx } from "../lib/utils";
import { Popover } from "./ui";

export const COVER_GRADIENTS = [
  "linear-gradient(120deg, #f6d365 0%, #fda085 100%)",
  "linear-gradient(120deg, #a1c4fd 0%, #c2e9fb 100%)",
  "linear-gradient(120deg, #84fab0 0%, #8fd3f4 100%)",
  "linear-gradient(120deg, #fccb90 0%, #d57eeb 100%)",
  "linear-gradient(120deg, #e0c3fc 0%, #8ec5fc 100%)",
  "linear-gradient(120deg, #f093fb 0%, #f5576c 100%)",
  "linear-gradient(120deg, #4facfe 0%, #00f2fe 100%)",
  "linear-gradient(120deg, #43e97b 0%, #38f9d7 100%)",
  "linear-gradient(120deg, #fa709a 0%, #fee140 100%)",
  "linear-gradient(120deg, #30cfd0 0%, #330867 100%)",
  "linear-gradient(120deg, #667eea 0%, #764ba2 100%)",
  "linear-gradient(120deg, #ff9a9e 0%, #fecfef 100%)",
  "linear-gradient(180deg, #2b5876 0%, #4e4376 100%)",
  "linear-gradient(120deg, #c79081 0%, #dfa579 100%)",
  "linear-gradient(120deg, #0ba360 0%, #3cba92 100%)",
  "linear-gradient(120deg, #1e3c72 0%, #2a5298 100%)",
];

export const COVER_COLORS = ["#e16259", "#d9730d", "#dfab01", "#4d6461", "#0b6e99", "#6940a5", "#ad1a72", "#9b9a97", "#37352f", "#f1f1ef"];

export function isImage(c: string) {
  return !c.startsWith("linear-gradient") && !c.startsWith("#");
}

export function coverStyle(cover: string, y = 50): React.CSSProperties {
  if (isImage(cover)) return { backgroundImage: `url("${cover}")`, backgroundPosition: `center ${y}%` };
  return { background: cover };
}

export function CoverPicker({ pageId, anchor, onClose }: { pageId: ID; anchor: HTMLElement; onClose: () => void }) {
  const [tab, setTab] = useState<"gallery" | "upload" | "link">("gallery");
  const [url, setUrl] = useState("");
  const set = (cover: string | null) => {
    updatePage(pageId, { cover, coverY: 50 });
    onClose();
  };
  return (
    <Popover anchor={anchor} onClose={onClose} placement="bottom-end">
      <div className="cover-picker">
        <div className="cp-tabs">
          {(["gallery", "upload", "link"] as const).map((t) => (
            <button key={t} type="button" className={cx("cp-tab", tab === t && "active")} onClick={() => setTab(t)}>
              {t === "gallery" ? "Gallery" : t === "upload" ? "Upload" : "Link"}
            </button>
          ))}
          <span style={{ flex: 1 }} />
          <button type="button" className="btn-text" onClick={() => set(null)}>
            Remove
          </button>
        </div>
        {tab === "gallery" && (
          <div className="cp-body">
            <div className="cp-label">Gradients</div>
            <div className="cp-grid">
              {COVER_GRADIENTS.map((g) => (
                <button key={g} type="button" className="cp-swatch" style={{ background: g }} onClick={() => set(g)} />
              ))}
            </div>
            <div className="cp-label">Colors</div>
            <div className="cp-grid">
              {COVER_COLORS.map((c) => (
                <button key={c} type="button" className="cp-swatch" style={{ background: c }} onClick={() => set(c)} />
              ))}
            </div>
          </div>
        )}
        {tab === "upload" && (
          <div className="cp-body center">
            <label className="btn">
              Choose an image
              <input
                type="file"
                accept="image/*"
                style={{ display: "none" }}
                onChange={async (e) => {
                  const f = e.target.files?.[0];
                  if (f) set(await saveAsset(f));
                }}
              />
            </label>
            <div className="muted small">Images wider than 1500px work best.</div>
          </div>
        )}
        {tab === "link" && (
          <div className="cp-body">
            <input
              className="menu-input"
              placeholder="Paste an image link…"
              value={url}
              autoFocus
              onChange={(e) => setUrl(e.target.value)}
              onKeyDown={(e) => {
                e.stopPropagation();
                if (e.key === "Enter" && url.trim()) set(url.trim());
              }}
            />
            <button type="button" className="btn-primary" style={{ marginTop: 8 }} disabled={!url.trim()} onClick={() => set(url.trim())}>
              Submit
            </button>
          </div>
        )}
      </div>
    </Popover>
  );
}
