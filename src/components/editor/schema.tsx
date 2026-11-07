// Custom BlockNote blocks and inline content (callout, page links, inline
// databases, page mentions and date mentions).

import { BlockNoteSchema, createCodeBlockSpec, defaultProps } from "@blocknote/core";
import { createReactBlockSpec, createReactInlineContentSpec } from "@blocknote/react";
import { codeBlockOptions } from "@blocknote/code-block";
import { lazy, Suspense } from "react";
import { format } from "date-fns";
import { openPage, useApp } from "../../lib/store";
import { formatDateStr, pageTitle, parseDateStr } from "../../lib/utils";
import { PageIcon } from "../Sidebar";
import { EmojiPopover, Popover, usePopover } from "../ui";
import { DatePicker } from "../DatePicker";

const DatabaseBlockView = lazy(() => import("../database/InlineDatabase"));

// ------------------------------------------------------------- callout ----

function CalloutEmoji({ emoji, onChange, editable }: { emoji: string; onChange: (e: string) => void; editable: boolean }) {
  const pop = usePopover();
  return (
    <>
      <span
        className="bn-callout-emoji"
        contentEditable={false}
        onClick={(e) => editable && pop.toggle(e.currentTarget)}
      >
        {emoji}
      </span>
      {pop.anchor && (
        <EmojiPopover
          anchor={pop.anchor}
          onClose={pop.close}
          onPick={(em) => {
            onChange(em);
            pop.close();
          }}
        />
      )}
    </>
  );
}

export const createCallout = createReactBlockSpec(
  {
    type: "callout",
    propSchema: {
      textAlignment: defaultProps.textAlignment,
      textColor: defaultProps.textColor,
      backgroundColor: defaultProps.backgroundColor,
      emoji: { default: "💡" },
    },
    content: "inline",
  },
  {
    render: (props) => (
      <div className="bn-callout">
        <CalloutEmoji
          emoji={props.block.props.emoji}
          editable={props.editor.isEditable}
          onChange={(emoji) => props.editor.updateBlock(props.block, { props: { emoji } })}
        />
        <div className="bn-callout-content" ref={props.contentRef} />
      </div>
    ),
  },
);

// ----------------------------------------------------------- page link ----

function PageLinkView({ pageId }: { pageId: string }) {
  const page = useApp((s) => s.pages[pageId]);
  if (!page || page.trashed) {
    return (
      <div className="bn-pagelink missing" contentEditable={false}>
        <PageIcon type="page" size={18} />
        <span>{page?.trashed ? "Page in Trash" : "Deleted page"}</span>
      </div>
    );
  }
  return (
    <div className="bn-pagelink" contentEditable={false} onClick={() => openPage(pageId)} title="Open page">
      <PageIcon icon={page.icon} type={page.type} size={18} />
      <span className="bn-pagelink-title">{pageTitle(page)}</span>
    </div>
  );
}

export const createPageLink = createReactBlockSpec(
  {
    type: "pageLink",
    propSchema: { pageId: { default: "" } },
    content: "none",
  },
  {
    render: (props) => <PageLinkView pageId={props.block.props.pageId} />,
  },
);

// ------------------------------------------------------ inline database ----

export const createDatabaseBlock = createReactBlockSpec(
  {
    type: "database",
    propSchema: { dbId: { default: "" } },
    content: "none",
  },
  {
    meta: { selectable: false },
    render: (props) => (
      <div className="bn-database" contentEditable={false}>
        <Suspense fallback={<div className="db-loading">Loading database…</div>}>
          <DatabaseBlockView dbId={props.block.props.dbId} />
        </Suspense>
      </div>
    ),
  },
);

// -------------------------------------------------------------- mentions ----

function MentionView({ pageId }: { pageId: string }) {
  const page = useApp((s) => s.pages[pageId]);
  return (
    <span
      className={page && !page.trashed ? "mention" : "mention missing"}
      onClick={() => page && !page.trashed && openPage(pageId)}
      contentEditable={false}
    >
      <PageIcon icon={page?.icon} type={page?.type} size={16} />
      <span className="mention-title">{page ? pageTitle(page) : "Deleted page"}</span>
    </span>
  );
}

export const Mention = createReactInlineContentSpec(
  {
    type: "mention",
    propSchema: { pageId: { default: "" } },
    content: "none",
  },
  {
    render: (props) => <MentionView pageId={props.inlineContent.props.pageId} />,
  },
);

function DateMentionView({
  date,
  onChange,
  editable,
}: {
  date: string;
  onChange: (d: string) => void;
  editable: boolean;
}) {
  const pop = usePopover();
  const d = parseDateStr(date);
  const today = format(new Date(), "yyyy-MM-dd");
  let label = formatDateStr(date);
  if (d && date.slice(0, 10) === today) label = `Today${date.includes("T") ? " " + format(d, "h:mm a") : ""}`;
  return (
    <>
      <span
        className="date-mention"
        contentEditable={false}
        onClick={(e) => editable && pop.toggle(e.currentTarget)}
      >
        @{label || "date"}
      </span>
      {pop.anchor && (
        <Popover anchor={pop.anchor} onClose={pop.close}>
          <DatePicker
            value={{ start: date, time: date.includes("T") }}
            allowRange={false}
            onChange={(v) => {
              if (v?.start) onChange(v.start);
            }}
          />
        </Popover>
      )}
    </>
  );
}

export const DateMention = createReactInlineContentSpec(
  {
    type: "dateMention",
    propSchema: { date: { default: "" } },
    content: "none",
  },
  {
    render: (props) => (
      <DateMentionView
        date={props.inlineContent.props.date}
        editable={props.editor.isEditable}
        onChange={(date) => props.updateInlineContent({ type: "dateMention", props: { date } })}
      />
    ),
  },
);

// ---------------------------------------------------------------- schema ----

export const schema = BlockNoteSchema.create().extend({
  blockSpecs: {
    codeBlock: createCodeBlockSpec(codeBlockOptions),
    callout: createCallout(),
    pageLink: createPageLink(),
    database: createDatabaseBlock(),
  },
  inlineContentSpecs: {
    mention: Mention,
    dateMention: DateMention,
  },
});

export type AppEditor = typeof schema.BlockNoteEditor;
