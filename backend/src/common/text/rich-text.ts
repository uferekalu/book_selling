import { Marked } from 'marked';
import sanitizeHtml from 'sanitize-html';

/**
 * Book descriptions, abstracts and author bios are written in Markdown by staff and stored twice:
 * the Markdown source (for editing) and sanitised HTML (for rendering). Sanitising happens here,
 * on write, so the storefront can render the HTML directly; nothing outside this allow-list
 * (scripts, iframes, event handlers, inline styles, `javascript:` links) can ever reach a page.
 */
const marked = new Marked({ gfm: true, breaks: false, async: false });

const ALLOWED: sanitizeHtml.IOptions = {
  allowedTags: [
    'p',
    'br',
    'hr',
    'h2',
    'h3',
    'h4',
    'strong',
    'em',
    'b',
    'i',
    'u',
    's',
    'sub',
    'sup',
    'ul',
    'ol',
    'li',
    'blockquote',
    'code',
    'pre',
    'a',
    'table',
    'thead',
    'tbody',
    'tr',
    'th',
    'td',
  ],
  // rel/target are added by the transform below, so they must be allowed through.
  allowedAttributes: {
    a: ['href', 'title', 'rel', 'target'],
    th: ['scope'],
    td: ['colspan', 'rowspan'],
  },
  allowedSchemes: ['http', 'https', 'mailto'],
  allowProtocolRelative: false,
  // A heading level 1 is the page title; demote any in content to keep the outline correct.
  transformTags: {
    h1: 'h2',
    a: (tagName, attribs) => ({
      tagName,
      attribs: {
        ...attribs,
        rel: 'nofollow noopener noreferrer',
        target: '_blank',
      },
    }),
  },
  exclusiveFilter: (frame) => frame.tag === 'a' && !frame.attribs.href,
};

export function markdownToSafeHtml(markdown: string): string {
  const html = marked.parse(markdown ?? '') as string;
  return sanitizeHtml(html, ALLOWED).trim();
}

/** Plain text (for meta descriptions, search snippets and length checks). */
export function markdownToPlainText(markdown: string): string {
  return sanitizeHtml(marked.parse(markdown ?? '') as string, {
    allowedTags: [],
    allowedAttributes: {},
  })
    .replace(/\s+/g, ' ')
    .trim();
}
