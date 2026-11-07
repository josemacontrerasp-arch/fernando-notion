import { BlockNoteView } from "@blocknote/mantine";
import { useCreateBlockNote } from "@blocknote/react";
import { useEffect, useState } from "react";
import { saveAsset } from "../../lib/storage";
import { setDbTemplate, toast, useApp } from "../../lib/store";
import { pageTitle } from "../../lib/utils";
import { schema } from "../editor/schema";
import { Modal, useResolvedTheme } from "../ui";

function TemplateEditor({ dbId, onClose }: { dbId: string; onClose: () => void }) {
  const db = useApp((s) => s.pages[dbId]);
  const theme = useResolvedTheme();
  const initial = db?.db?.template?.length ? db.db.template : undefined;
  const editor = useCreateBlockNote({ schema, initialContent: initial as any, uploadFile: (f: File) => saveAsset(f) });
  if (!db?.db) return null;
  return (
    <Modal onClose={onClose} width={760}>
      <div className="template-editor">
        <div className="te-head">
          <div>
            <div className="te-title">Template for new pages in “{pageTitle(db)}”</div>
            <div className="muted">Every new row in this database starts with this content.</div>
          </div>
        </div>
        <div className="te-body">
          <BlockNoteView editor={editor as any} theme={theme} />
        </div>
        <div className="te-foot">
          <button
            type="button"
            className="btn-text"
            onClick={() => {
              setDbTemplate(dbId, null);
              toast("Template removed");
              onClose();
            }}
          >
            Remove template
          </button>
          <span style={{ flex: 1 }} />
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="btn-primary"
            onClick={() => {
              const doc = editor.document as any[];
              const empty = doc.length === 1 && doc[0].type === "paragraph" && (!doc[0].content || doc[0].content.length === 0);
              setDbTemplate(dbId, empty ? null : doc);
              toast("Template saved");
              onClose();
            }}
          >
            Save template
          </button>
        </div>
      </div>
    </Modal>
  );
}

/** Mounted once in the app; opens the template editor when a database asks for it. */
export function TemplateEditorHost() {
  const [dbId, setDbId] = useState<string | null>(null);
  useEffect(() => {
    const on = (e: Event) => setDbId((e as CustomEvent).detail?.dbId ?? null);
    window.addEventListener("fn:edit-template", on);
    return () => window.removeEventListener("fn:edit-template", on);
  }, []);
  if (!dbId) return null;
  return <TemplateEditor key={dbId} dbId={dbId} onClose={() => setDbId(null)} />;
}
