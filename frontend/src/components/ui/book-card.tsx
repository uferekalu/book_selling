import NextLink from "next/link";
import type { Money } from "@/lib/money";
import { cn } from "@/lib/cn";
import { Badge } from "./badge";
import { BookCover } from "./book-cover";
import { PriceTag } from "./price-tag";
import { Rating } from "./rating";

export type BookFormatType = "ebook" | "print";

export interface BookCardProps {
  href: string;
  title: string;
  author: string;
  coverSrc?: string | null;
  coverBlurDataUrl?: string | null;
  price: Money;
  compareAt?: Money | null;
  /** True when formats have different prices, so the card says "From …". */
  priceIsFrom?: boolean;
  rating?: { value: number; count: number } | null;
  formats: BookFormatType[];
  /** Short highlight: "New edition", "Bestseller". */
  highlight?: string;
  priority?: boolean;
  className?: string;
}

const formatLabel: Record<BookFormatType, string> = { ebook: "Ebook", print: "Print" };

/**
 * Catalogue card. The whole card is one link (a single tab stop, and a large tap target on
 * phones), and the title is the link's accessible name. Designed for a 2-column grid at 320px.
 */
export function BookCard({
  href,
  title,
  author,
  coverSrc,
  coverBlurDataUrl,
  price,
  compareAt,
  priceIsFrom,
  rating,
  formats,
  highlight,
  priority,
  className,
}: BookCardProps) {
  return (
    <article className={cn("group relative flex flex-col gap-3 sm:gap-4", className)}>
      <div className="relative flex items-end justify-center rounded-2xl bg-surface-sunken px-[12%] pt-[14%] pb-[10%] transition-colors duration-(--duration-base) group-hover:bg-secondary-hover">
        <BookCover title={title} author={author} src={coverSrc} blurDataUrl={coverBlurDataUrl} size="fluid" priority={priority} />
        {highlight && (
          <Badge tone="accent" size="sm" className="absolute top-2.5 left-2.5 sm:top-3 sm:left-3">
            {highlight}
          </Badge>
        )}
      </div>
      <div className="flex flex-1 flex-col gap-1.5">
        <div className="flex flex-wrap gap-1">
          {formats.map((format) => (
            <Badge key={format} size="sm" tone="neutral">
              {formatLabel[format]}
            </Badge>
          ))}
        </div>
        <h3 className="line-clamp-2 font-display text-base leading-snug font-medium text-text sm:text-lg">
          <NextLink
            href={href}
            className="after:absolute after:inset-0 after:rounded-2xl focus-visible:outline-none focus-visible:after:outline-2 focus-visible:after:outline-offset-4 focus-visible:after:outline-focus-ring"
          >
            {title}
          </NextLink>
        </h3>
        <p className="truncate text-xs text-text-muted sm:text-sm">{author}</p>
        {rating && rating.count > 0 && <Rating value={rating.value} count={rating.count} size="xs" />}
        <PriceTag price={price} compareAt={compareAt} prefix={priceIsFrom ? "From" : undefined} size="md" className="mt-auto pt-1" />
      </div>
    </article>
  );
}
