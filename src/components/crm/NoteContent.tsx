"use client";

import { useState } from "react";

const SPLIT_RE = /(https?:\/\/[^\s]+)/g;
const IS_URL   = /^https?:\/\//;

interface Props {
  text: string;
  /** Tailwind color class for links, e.g. "text-teal-700" or "text-blue-200" */
  linkColor?: string;
  /** Lines before "Show more" appears. undefined = never clamp */
  clamp?: number;
  /** Also enforce a char-count threshold for "Show more" */
  charLimit?: number;
}

export default function NoteContent({
  text,
  linkColor = "text-teal-700",
  clamp,
  charLimit = 300,
}: Props) {
  const [expanded, setExpanded] = useState(false);

  const parts = text.split(SPLIT_RE);
  const lines = text.split("\n").length;
  const long  = clamp != null && (lines > clamp || text.length > charLimit);

  const inner = (
    <span>
      {parts.map((part, i) =>
        IS_URL.test(part) ? (
          <a
            key={i}
            href={part}
            target="_blank"
            rel="noopener noreferrer"
            className={`underline break-all hover:opacity-70 transition ${linkColor}`}
            onClick={e => e.stopPropagation()}
          >
            {part}
          </a>
        ) : (
          <span key={i}>{part}</span>
        )
      )}
    </span>
  );

  return (
    <div>
      <p
        className={`text-sm leading-relaxed whitespace-pre-wrap ${long && !expanded ? `line-clamp-${clamp}` : ""}`}
      >
        {inner}
      </p>
      {long && (
        <button
          onClick={() => setExpanded(v => !v)}
          className={`text-xs font-semibold mt-1 hover:opacity-70 transition ${linkColor}`}
        >
          {expanded ? "Show less" : "Show more"}
        </button>
      )}
    </div>
  );
}
