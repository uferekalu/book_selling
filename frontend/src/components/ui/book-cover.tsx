import Image from "next/image";
import { cn } from "@/lib/cn";

const widths = {
  xs: "w-16",
  sm: "w-24",
  md: "w-36 sm:w-40",
  lg: "w-48 sm:w-56",
  xl: "w-56 sm:w-72",
  fluid: "w-full",
} as const;

/** `sizes` hints so next/image downloads an appropriately small file on phones. */
const imageSizes: Record<keyof typeof widths, string> = {
  xs: "64px",
  sm: "96px",
  md: "(min-width: 640px) 160px, 144px",
  lg: "(min-width: 640px) 224px, 192px",
  xl: "(min-width: 640px) 288px, 224px",
  fluid: "(min-width: 1024px) 20vw, (min-width: 640px) 30vw, 45vw",
};

export interface BookCoverProps {
  title: string;
  author?: string;
  src?: string | null;
  /** Tiny base64 placeholder from the API (`cover.blurDataUrl`). */
  blurDataUrl?: string | null;
  /** The artwork's dominant colour, shown behind it while it loads (from the API). */
  dominantColor?: string | null;
  size?: keyof typeof widths;
  /** Tilt in 3D on hover (pointer devices only). Turn off for dense lists. */
  interactive?: boolean;
  /** Above-the-fold hero covers load eagerly. */
  priority?: boolean;
  className?: string;
}

/**
 * A book as an object, not a flat image: a 2:3 cover with a spine crease on the left, page edges
 * on the right, and a resting shadow. On hover-capable devices it turns slightly towards the
 * reader. Books without artwork get a typographic cover in brand colours.
 *
 * The page-edge and spine art is theme-invariant by design (paper is paper in dark mode too), so
 * it uses the raw scales.
 */
export function BookCover({
  title,
  author,
  src,
  blurDataUrl,
  dominantColor,
  size = "md",
  interactive = true,
  priority = false,
  className,
}: BookCoverProps) {
  return (
    <div className={cn("group/book shrink-0 perspective-[1200px]", widths[size], className)}>
      <div
        className={cn(
          "relative aspect-[2/3] transform-3d transition-transform duration-(--duration-slow) ease-out-soft",
          interactive && "group-hover/book:transform-[rotateY(-16deg)_rotateX(3deg)_translateY(-4px)]",
        )}
      >
        {/* Page block peeking out behind the cover's fore-edge: reads as a book with thickness. */}
        <div
          aria-hidden="true"
          className="absolute inset-y-[1.5%] -right-[3.5%] w-[6%] rounded-r-xs bg-[repeating-linear-gradient(90deg,var(--color-paper-50)_0_1px,var(--color-paper-300)_1px_2px)] shadow-sm"
        />
        <div
          className="absolute inset-0 overflow-hidden rounded-r-sm rounded-l-xs bg-brown-800 shadow-book"
          // Content data (each cover's own colour), not a design value, so inline is correct here.
          style={src && dominantColor ? { backgroundColor: dominantColor } : undefined}
        >
          {src ? (
            <Image
              src={src}
              alt={author ? `Cover of ${title} by ${author}` : `Cover of ${title}`}
              fill
              sizes={imageSizes[size]}
              priority={priority}
              placeholder={blurDataUrl ? "blur" : "empty"}
              blurDataURL={blurDataUrl ?? undefined}
              className="object-cover"
            />
          ) : (
            <TypographicCover title={title} author={author} />
          )}
          {/* Spine crease and a soft sheen: the details that make it read as a real book. */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-y-0 left-0 w-[7%] bg-linear-to-r from-brown-950/45 via-paper-0/15 to-transparent"
          />
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 bg-linear-to-tr from-transparent via-transparent to-paper-0/12 opacity-70 transition-opacity duration-(--duration-slow) group-hover/book:opacity-100"
          />
        </div>
      </div>
    </div>
  );
}

function TypographicCover({ title, author }: { title: string; author?: string }) {
  return (
    <div
      role="img"
      aria-label={author ? `Cover of ${title} by ${author}` : `Cover of ${title}`}
      className="surface-grain @container flex size-full flex-col justify-between bg-linear-to-br from-brown-700 via-brown-800 to-brown-950 p-[10%] pl-[14%] text-paper-50"
    >
      <span aria-hidden="true" className="h-px w-1/3 bg-gold-400" />
      <span aria-hidden="true" className="font-display text-[11cqw] leading-tight font-medium text-balance wrap-anywhere hyphens-auto">
        {title}
      </span>
      <span aria-hidden="true" className="flex flex-col gap-2">
        <span className="h-px w-full bg-gold-400/60" />
        {author && <span className="text-[5.5cqw] tracking-wide text-gold-200 uppercase">{author}</span>}
      </span>
    </div>
  );
}
