import { Injectable } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { GridFSBucket, ObjectId } from 'mongodb';
import type { Connection } from 'mongoose';
import type { Readable } from 'node:stream';

/**
 * Preview PDFs live in MongoDB GridFS (bucket `previews`), served by our API. They are small (at
 * most a few percent of a book), always same-origin for the reader, versioned by id (so they are
 * cached forever) and independent of Cloudinary's PDF delivery rules. The private manuscript
 * stays in Cloudinary and is only ever read by the server while building.
 */
@Injectable()
export class PreviewStorage {
  constructor(@InjectConnection() private readonly connection: Connection) {}

  private bucket(): GridFSBucket {
    if (!this.connection.db) throw new Error('MongoDB is not connected');
    return new GridFSBucket(this.connection.db, { bucketName: 'previews' });
  }

  async save(
    bytes: Uint8Array,
    filename: string,
    metadata: { bookId: string; sourceChecksum: string },
  ): Promise<ObjectId> {
    const upload = this.bucket().openUploadStream(filename, {
      metadata: { ...metadata, contentType: 'application/pdf' },
    });
    await new Promise<void>((resolve, reject) => {
      upload.once('finish', () => resolve());
      upload.once('error', reject);
      upload.end(Buffer.from(bytes));
    });
    return upload.id;
  }

  /** Size in bytes, or null if the file doesn't exist. */
  async size(id: ObjectId): Promise<number | null> {
    const [file] = await this.bucket().find({ _id: id }).limit(1).toArray();
    return file ? file.length : null;
  }

  open(id: ObjectId): Readable {
    return this.bucket().openDownloadStream(id);
  }

  async read(id: ObjectId): Promise<Buffer> {
    const chunks: Buffer[] = [];
    for await (const chunk of this.open(id)) chunks.push(chunk as Buffer);
    return Buffer.concat(chunks);
  }

  async remove(id: ObjectId): Promise<void> {
    try {
      await this.bucket().delete(id);
    } catch {
      // Already gone: nothing to do.
    }
  }
}
