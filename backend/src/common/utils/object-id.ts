import { NotFoundException } from '@nestjs/common';
import { Types } from 'mongoose';

/**
 * The ObjectId/string boundary (docs/ARCHITECTURE.md §4, backend/CLAUDE.md "Mongoose rules").
 * Services take ids as strings; queries convert explicitly with `toObjectId`. An invalid id is a
 * 404, never a 500 from a cast error.
 */
export function toObjectId(id: string, what = 'Resource'): Types.ObjectId {
  if (!Types.ObjectId.isValid(id) || String(new Types.ObjectId(id)) !== id) {
    throw new NotFoundException(`${what} not found`);
  }
  return new Types.ObjectId(id);
}

export function isObjectId(id: string): boolean {
  return Types.ObjectId.isValid(id) && String(new Types.ObjectId(id)) === id;
}
