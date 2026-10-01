import type { Model } from 'mongoose';
import { slugify } from './catalog-rules.js';

/**
 * A slug not used by any other document (current or previous slugs): "heat-transfer",
 * then "heat-transfer-2", and so on. `excludeId` lets a document keep its own slug.
 */
export async function uniqueSlug(
  // `any`: shared by the book, author and category models, which have different document types.
  model: Model<any>,
  text: string,
  options: { excludeId?: string; checkPrevious?: boolean } = {},
): Promise<string> {
  const base = slugify(text) || 'untitled';
  for (let n = 1; n < 1000; n += 1) {
    const candidate = n === 1 ? base : `${base}-${n}`;
    const clash = await model
      .exists({
        ...(options.excludeId ? { _id: { $ne: options.excludeId } } : {}),
        $or: [
          { slug: candidate },
          ...(options.checkPrevious ? [{ previousSlugs: candidate }] : []),
        ],
      })
      .exec();
    if (!clash) return candidate;
  }
  throw new Error(`Could not find a free slug for "${text}"`);
}
