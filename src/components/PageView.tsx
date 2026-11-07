import { formatDistanceToNow } from "date-fns";
import { ImageIcon, MessageSquare, Plus, FaceSlightlySmiling, Trash, RotateCcw } from "lucide-react";
import { lazy, Suspense, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import {
  addComment,
  deleteComment,
  deletePermanently,
  restorePage,
  setTitle,
  updatePage,
  useApp,
} from "../lib/store";
import type { ID } from "../lib/types";
import { cx } from "../lib/utils";
import { coverStyle, CoverPicker, isImage } from "./CoverPicker";
import { DatabaseView } from "./database/DatabaseView";
import { PropertyCell, PropIcon } from "./database/PropertyCell";
import { AddPropertyMenu, PropertyMenu } from "./database/PropertyMenu";
import type { AppEditor } from "./editor/schema";
import { EmojiPopover, Popover, usePopover } from "./ui";

const Editor = lazy(() => import("./editor/Editor"));

function Cover({ pageId, cover, y, locked }: { pageId: ID; cover: string; y: number; locked?: boolean }) {
  const [picker, setPicker] = useState<HTMLElement | null>(null);
  const [repositioning, setRepositioning] = useState(false);
  const [pos, setPos] = useState(y);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => setPos(y), [y]);
  const startDrag = (e: React.MouseEvent) => {
    if (!repositioning) return;
    e.preventDefault();
    const startY = e.clientY;
    const start = pos;
    const h = ref.current?.offsetHeight || 200;
    let cur = start;
    const move = (ev: MouseEvent) => {
      cur = Math.max(0, Math.min(100, start - ((ev.clientY - startY) / h) * 100));
      setPos(cur);
    };
    const up = () => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
    };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
  };
  return (
    <div
      ref={ref}
      className={cx("page-cover", repositioning && "repositioning")}
      style={coverStyle(cover, pos)}
      onMouseDown={startDrag}
    >
      {!locked && (
        <div className="cover-actions">
          {repositioning ? (
            <>
              <span className="cover-hint">Drag image to reposition</span>
              <button
                type="button"
                className="cover-btn"
                onClick={() => {
                  updatePage(pageId, { coverY: pos }, false);
                  setRepositioning(false);
                }}
              >
                Save position
              </button>
              <button
                type="button"
                className="cover-btn"
                onClick={() => {
                  setPos(y);
                  setRepositioning(false);
                }}
              >
                Cancel
              </button>
            </>
          ) : (
            <>
              <button type="button" className="cover-btn" onClick={(e) => setPicker(e.currentTarget)}>
                Change cover
              </button>
              {isImage(cover) && (
                <button type="button" className="cover-btn" onClick={() => setRepositioning(true)}>
                  Reposition
                </button>
              )}
            </>
          )}
        </div>
      )}
      {picker && <CoverPicker pageId={pageId} anchor={picker} onClose={() => setPicker(null)} />}
    </div>
  );
}

function TitleInput({ pageId, title, locked, onEnter, isDb }: { pageId: ID; title: string; locked?: boolean; onEnter: () => void; isDb: boolean }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const focusTitle = useApp((s) => s.focusTitle);
  const resize = () => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  };
  useLayoutEffect(resize, [title]);
  useEffect(() => {
    const onResize = () => resize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  useEffect(() => {
    if (focusTitle === pageId && ref.current) {
      ref.current.focus();
      ref.current.select();
      useApp.setState({ focusTitle: null });
    }
  }, [focusTitle, pageId]);
  return (
    <textarea
      ref={ref}
      className="page-title"
      value={title}
      rows={1}
      readOnly={locked}
      placeholder={isDb ? "Untitled database" : "New page"}
      onChange={(e) => setTitle(pageId, e.target.value.replace(/\n/g, ""))}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          onEnter();
        }
      }}
    />
  );
}

function RowProperties({ pageId, dbId }: { pageId: ID; dbId: ID }) {
  const row = useApp((s) => s.pages[pageId]);
  const db = useApp((s) => s.pages[dbId]);
  const [menu, setMenu] = useState<{ propId: ID; el: HTMLElement } | null>(null);
  const add = usePopover();
  if (!row || !db?.db) return null;
  const props = db.db.properties.filter((p) => p.type !== "title");
  return (
    <div className="row-props">
      {props.map((p) => (
        <div className="row-prop" key={p.id}>
          <div className="row-prop-name" onClick={(e) => !db.locked && setMenu({ propId: p.id, el: e.currentTarget })}>
            <PropIcon type={p.type} />
            <span>{p.name}</span>
          </div>
          <div className="row-prop-value">
            <PropertyCell row={row} prop={p} dbId={dbId} variant="panel" readOnly={db.locked || row.locked} />
          </div>
        </div>
      ))}
      {!db.locked && (
        <button type="button" className="btn-text add-prop" onClick={(e) => add.toggle(e.currentTarget)}>
          <Plus size={15} /> Add a property
        </button>
      )}
      {add.anchor && (
        <Popover anchor={add.anchor} onClose={add.close}>
          <AddPropertyMenu dbId={dbId} onDone={() => add.close()} />
        </Popover>
      )}
      {menu && db.db.properties.find((p) => p.id === menu.propId) && (
        <PropertyMenu
          dbId={dbId}
          prop={db.db.properties.find((p) => p.id === menu.propId)!}
          anchor={menu.el}
          onClose={() => setMenu(null)}
        />
      )}
    </div>
  );
}

function Comments({ pageId, open, onClose }: { pageId: ID; open: boolean; onClose: () => void }) {
  const comments = useApp((s) => s.pages[pageId]?.comments) || [];
  const userName = useApp((s) => s.meta.settings.userName);
  const [text, setText] = useState("");
  if (!open && comments.length === 0) return null;
  const submit = () => {
    if (!text.trim()) return;
    addComment(pageId, text.trim());
    setText("");
  };
  return (
    <div className="comments">
      {comments.map((c) => (
        <div key={c.id} className="comment">
          <span className="person-avatar">{(userName || "F").charAt(0).toUpperCase()}</span>
          <div className="comment-body">
            <div className="comment-meta">
              <b>{userName || "You"}</b> <span className="muted">{formatDistanceToNow(c.createdAt, { addSuffix: true })}</span>
              <button type="button" className="icon-btn sm comment-del" title="Delete comment" onClick={() => deleteComment(pageId, c.id)}>
                <Trash size={13} />
              </button>
            </div>
            <div className="comment-text">{c.text}</div>
          </div>
        </div>
      ))}
      <div className="comment new">
        <span className="person-avatar">{(userName || "F").charAt(0).toUpperCase()}</span>
        <input
          className="comment-input"
          placeholder="Add a comment…"
          value={text}
          autoFocus={open && comments.length === 0}
          onChange={(e) => setText(e.target.value)}
          onBlur={() => !text && comments.length === 0 && onClose()}
          onKeyDown={(e) => {
            if (e.key === "Enter") submit();
          }}
        />
      </div>
    </div>
  );
}

export function PageView({ pageId, mode = "full" }: { pageId: ID; mode?: "full" | "peek" }) {
  const p = useApp(
    useShallow((s) => {
      const pg = s.pages[pageId];
      if (!pg) return null;
      return {
        title: pg.title,
        icon: pg.icon,
        cover: pg.cover,
        coverY: pg.coverY,
        type: pg.type,
        isRow: pg.isRow,
        parentId: pg.parentId,
        fullWidth: pg.fullWidth,
        smallText: pg.smallText,
        font: pg.font,
        locked: pg.locked,
        rev: pg.rev,
        trashed: pg.trashed,
        updatedAt: pg.updatedAt,
      };
    }),
  );
  const editorRef = useRef<AppEditor | null>(null);
  const [emoji, setEmoji] = useState<HTMLElement | null>(null);
  const [coverPicker, setCoverPicker] = useState<HTMLElement | null>(null);
  const [commenting, setCommenting] = useState(false);
  const onEditor = useCallback((e: AppEditor | null) => {
    editorRef.current = e;
  }, []);

  if (!p) return <div className="page-missing">This page doesn't exist anymore.</div>;

  const focusEditor = () => {
    const ed = editorRef.current;
    if (!ed) return;
    const first = ed.document[0];
    try {
      if (first) ed.setTextCursorPosition(first, "start");
      ed.focus();
    } catch {
      /* ignore */
    }
  };

  const isDb = p.type === "database";

  return (
    <div className={cx("page", mode, (p.fullWidth || (isDb && mode === "full")) && "full-width", p.smallText && "small-text", p.font && `font-${p.font}`)}>
      {p.trashed && (
        <div className="trash-banner">
          This page is in the Trash.
          <button type="button" className="banner-btn" onClick={() => restorePage(pageId)}>
            <RotateCcw size={14} /> Restore page
          </button>
          <button
            type="button"
            className="banner-btn"
            onClick={() => confirm("Delete this page permanently? This cannot be undone.") && deletePermanently(pageId)}
          >
            <Trash size={14} /> Delete permanently
          </button>
        </div>
      )}
      {p.cover && <Cover pageId={pageId} cover={p.cover} y={p.coverY ?? 50} locked={p.locked} />}
      <div className="page-body">
        <div className={cx("page-header", p.cover && "has-cover", p.icon && "has-icon")}>
          {p.icon && (
            <button type="button" className="page-icon-big" onClick={(e) => !p.locked && setEmoji(e.currentTarget)}>
              {p.icon.startsWith("data:") || p.icon.startsWith("fnasset:") ? <img src={p.icon} alt="" /> : p.icon}
            </button>
          )}
          {!p.locked && (
            <div className="page-controls">
              {!p.icon && (
                <button type="button" className="ctrl-btn" onClick={(e) => setEmoji(e.currentTarget)}>
                  <FaceSlightlySmiling size={15} /> Add icon
                </button>
              )}
              {!p.cover && (
                <button type="button" className="ctrl-btn" onClick={(e) => setCoverPicker(e.currentTarget)}>
                  <ImageIcon size={15} /> Add cover
                </button>
              )}
              <button type="button" className="ctrl-btn" onClick={() => setCommenting(true)}>
                <MessageSquare size={15} /> Add comment
              </button>
            </div>
          )}
          <TitleInput pageId={pageId} title={p.title} locked={p.locked} onEnter={focusEditor} isDb={isDb} />
          {mode === "full" && !isDb && (
            <div className="page-meta muted">Edited {formatDistanceToNow(p.updatedAt, { addSuffix: true })}</div>
          )}
        </div>
        {p.isRow && p.parentId && <RowProperties pageId={pageId} dbId={p.parentId} />}
        <Comments pageId={pageId} open={commenting} onClose={() => setCommenting(false)} />
        {isDb ? (
          <DatabaseView dbId={pageId} />
        ) : (
          <div className="editor-wrap">
            <Suspense fallback={<div className="editor-loading" />}>
              <Editor key={`${pageId}:${p.rev || 0}`} pageId={pageId} editable={!p.locked && !p.trashed} onEditor={onEditor} />
            </Suspense>
            {!p.locked && <div className="editor-tail" onClick={focusEditorEnd(editorRef)} />}
          </div>
        )}
      </div>
      {emoji && (
        <EmojiPopover
          anchor={emoji}
          onClose={() => setEmoji(null)}
          onPick={(icon) => {
            updatePage(pageId, { icon });
            setEmoji(null);
          }}
          onRemove={
            p.icon
              ? () => {
                  updatePage(pageId, { icon: null });
                  setEmoji(null);
                }
              : undefined
          }
        />
      )}
      {coverPicker && <CoverPicker pageId={pageId} anchor={coverPicker} onClose={() => setCoverPicker(null)} />}
    </div>
  );
}

/** Clicking the empty space under the document focuses the end (adding a paragraph if needed). */
function focusEditorEnd(ref: React.RefObject<AppEditor | null>) {
  return () => {
    const ed = ref.current;
    if (!ed) return;
    const doc = ed.document;
    const last = doc[doc.length - 1];
    try {
      const isEmptyPara = last && last.type === "paragraph" && (!last.content || (last.content as any[]).length === 0);
      if (last && !isEmptyPara) {
        const [inserted] = ed.insertBlocks([{ type: "paragraph" } as any], last, "after");
        ed.setTextCursorPosition(inserted as any, "end");
      } else if (last) ed.setTextCursorPosition(last, "end");
      ed.focus();
    } catch {
      /* ignore */
    }
  };
}
