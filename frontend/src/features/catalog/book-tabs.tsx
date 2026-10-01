"use client";

import { useState } from "react";
import { Tabs } from "@/components/ui";
import type { PublicBook } from "@/lib/catalog-types";

type Tab = "description" | "contents" | "details";

const LANGUAGE = new Intl.DisplayNames(["en"], { type: "language" });

/** Description, table of contents and bibliographic details. */
export function BookTabs({ book }: { book: PublicBook }) {
  const [tab, setTab] = useState<Tab>("description");
  const details: Array<[string, string]> = [];
  if (book.edition) details.push(["Edition", book.edition]);
  if (book.publicationDate) {
    details.push(["Published", new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric" }).format(new Date(book.publicationDate))]);
  }
  if (book.pageCount) details.push(["Pages", String(book.pageCount)]);
  details.push(["Language", LANGUAGE.of(book.language) ?? book.language]);
  if (book.isbn13) details.push(["ISBN-13", book.isbn13]);
  details.push(["Formats", book.formats.map((f) => (f === "ebook" ? "Ebook (PDF)" : "Print")).join(" · ")]);
  if (book.categories.length) details.push(["Subjects", book.categories.map((c) => c.name).join(", ")]);

  return (
    <Tabs<Tab>
      label="About this book"
      value={tab}
      onChange={setTab}
      items={[
        {
          value: "description",
          label: "Description",
          content: book.descriptionHtml ? (
            <div className="prose-book" dangerouslySetInnerHTML={{ __html: book.descriptionHtml }} />
          ) : (
            <p className="text-text-muted">No description yet.</p>
          ),
        },
        {
          value: "contents",
          label: "Contents",
          count: book.tableOfContents.length || undefined,
          content:
            book.tableOfContents.length > 0 ? (
              <ol className="flex max-w-2xl flex-col divide-y divide-border">
                {book.tableOfContents.map((entry, index) => (
                  <li key={`${entry.title}-${index}`} className="py-3">
                    <div className="flex items-baseline justify-between gap-4">
                      <span className="text-text">
                        <span className="mr-3 font-mono text-sm text-text-subtle tabular-nums">{String(index + 1).padStart(2, "0")}</span>
                        {entry.title}
                      </span>
                      {entry.page && <span className="text-sm text-text-subtle tabular-nums">p. {entry.page}</span>}
                    </div>
                    {entry.children.length > 0 && (
                      <ul className="mt-2 flex flex-col gap-1 pl-10 text-sm text-text-muted">
                        {entry.children.map((child) => (
                          <li key={child.title}>{child.title}</li>
                        ))}
                      </ul>
                    )}
                  </li>
                ))}
              </ol>
            ) : (
              <p className="text-text-muted">The table of contents will appear here.</p>
            ),
        },
        {
          value: "details",
          label: "Details",
          content: (
            <dl className="grid max-w-2xl grid-cols-[auto_1fr] gap-x-8 gap-y-3 text-sm">
              {details.map(([term, value]) => (
                <div key={term} className="contents">
                  <dt className="text-text-muted">{term}</dt>
                  <dd className={term === "ISBN-13" ? "font-mono text-text" : "text-text"}>{value}</dd>
                </div>
              ))}
            </dl>
          ),
        },
      ]}
    />
  );
}

