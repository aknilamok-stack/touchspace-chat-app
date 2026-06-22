"use client";

import type { ReactNode } from "react";

const URL_PATTERN =
  /((?:https?:\/\/|www\.)[^\s<>()]+|(?:[a-zA-Z0-9-]+\.)+[a-zA-Z]{2,}(?:\/[^\s<>()]*)?)/g;
const TRAILING_PUNCTUATION_PATTERN = /[.,!?;:)\]}]+$/;

const escapeSearchRegExp = (value: string) =>
  value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const normalizeHref = (value: string) =>
  /^https?:\/\//i.test(value) ? value : `https://${value}`;

const renderHighlightedPart = (text: string, query: string, keyPrefix: string) => {
  const normalizedQuery = query.trim();

  if (!normalizedQuery) {
    return text;
  }

  const pattern = new RegExp(`(${escapeSearchRegExp(normalizedQuery)})`, "ig");
  const parts = text.split(pattern);

  return parts.map((part, index) =>
    part.toLowerCase() === normalizedQuery.toLowerCase() ? (
      <mark
        key={`${keyPrefix}-mark-${index}`}
        className="rounded bg-[#FFE08A] px-0.5 text-inherit"
      >
        {part}
      </mark>
    ) : (
      <span key={`${keyPrefix}-text-${index}`}>{part}</span>
    ),
  );
};

type LinkifiedTextProps = {
  text: string;
  query?: string;
};

export function LinkifiedText({ text, query = "" }: LinkifiedTextProps) {
  const nodes: ReactNode[] = [];
  let lastIndex = 0;

  for (const match of text.matchAll(URL_PATTERN)) {
    const rawMatch = match[0];
    const matchIndex = match.index ?? 0;

    if (rawMatch.includes("@") || text[matchIndex - 1] === "@") {
      continue;
    }

    if (matchIndex > lastIndex) {
      const plainText = text.slice(lastIndex, matchIndex);
      nodes.push(renderHighlightedPart(plainText, query, `plain-${lastIndex}`));
    }

    const trailingPunctuation = rawMatch.match(TRAILING_PUNCTUATION_PATTERN)?.[0] ?? "";
    const linkText = trailingPunctuation
      ? rawMatch.slice(0, -trailingPunctuation.length)
      : rawMatch;

    if (linkText) {
      nodes.push(
        <a
          key={`link-${matchIndex}`}
          href={normalizeHref(linkText)}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(event) => event.stopPropagation()}
          className="font-semibold underline underline-offset-2 decoration-current transition hover:opacity-80"
        >
          {renderHighlightedPart(linkText, query, `link-${matchIndex}`)}
        </a>,
      );
    }

    if (trailingPunctuation) {
      nodes.push(
        <span key={`punctuation-${matchIndex}`}>{trailingPunctuation}</span>,
      );
    }

    lastIndex = matchIndex + rawMatch.length;
  }

  if (lastIndex < text.length) {
    nodes.push(renderHighlightedPart(text.slice(lastIndex), query, `plain-${lastIndex}`));
  }

  return <>{nodes.length > 0 ? nodes : renderHighlightedPart(text, query, "plain")}</>;
}
