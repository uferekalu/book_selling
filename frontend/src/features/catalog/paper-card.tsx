import { ExternalLink, FileText } from "lucide-react";
import NextLink from "next/link";
import { Badge, Card, Icon, PriceTag } from "@/components/ui";
import { titlePath } from "@/lib/catalog-links";
import type { BookCardData } from "@/lib/catalog-types";
import { EVENT_LABEL, venueLine } from "./paper-citation";

/**
 * One conference or workshop paper in a list (BS-34): what it is, by whom, where and when it was
 * presented, and either its price or "Read at the publisher". The whole card is the link.
 */
export function PaperCard({ paper: item, headingLevel = 3 }: { paper: BookCardData; headingLevel?: 2 | 3 }) {
  const paper = item.paper;
  if (!paper) return null;
  const external = paper.access === "external";
  const Heading = headingLevel === 2 ? "h2" : "h3";
  return (
    <NextLink href={titlePath("paper", item.slug)} className="block h-full rounded-2xl">
      <Card interactive padding="sm" className="flex h-full flex-col gap-3 sm:p-5">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone="primary" icon={<Icon icon={FileText} size="xs" />}>
            {EVENT_LABEL[paper.eventType]}
          </Badge>
          {item.isNew && <Badge tone="accent">New</Badge>}
        </div>
        <div className="flex min-w-0 flex-col gap-1">
          <Heading className="font-display text-lg leading-snug font-medium text-text text-pretty sm:text-xl">{item.title}</Heading>
          {item.authors.length > 0 && <p className="text-sm text-text-muted">{item.authors.map((a) => a.name).join(", ")}</p>}
          {venueLine(paper, item.year) && <p className="text-sm text-text-subtle">{venueLine(paper, item.year)}</p>}
        </div>
        <div className="mt-auto flex items-center justify-between gap-3 pt-1">
          {external ? (
            <span className="inline-flex items-center gap-1.5 text-sm font-medium text-primary">
              Read at the publisher <Icon icon={ExternalLink} size="sm" />
            </span>
          ) : item.fromPrice ? (
            <>
              <span className="text-sm text-text-muted">PDF · first pages free</span>
              <PriceTag price={item.fromPrice} compareAt={item.compareAt} size="sm" />
            </>
          ) : null}
        </div>
      </Card>
    </NextLink>
  );
}

/** One column on a phone, two from tablets, three on wide screens. */
export function PaperList({ papers, headingLevel }: { papers: BookCardData[]; headingLevel?: 2 | 3 }) {
  return (
    <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {papers.map((paper) => (
        <li key={paper.id}>
          <PaperCard paper={paper} headingLevel={headingLevel} />
        </li>
      ))}
    </ul>
  );
}
