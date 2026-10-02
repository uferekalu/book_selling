import { Injectable } from '@nestjs/common';

/** What an outbox row stores: which file to attach, resolved only when the email is sent. */
export interface AttachmentRef {
  /** e.g. 'invoice' */
  kind: string;
  /** e.g. the order id */
  ref: string;
}

export interface ResolvedAttachment {
  filename: string;
  content: Buffer;
  contentType: string;
}

type Resolver = (ref: string) => Promise<ResolvedAttachment>;

/**
 * Builds email attachments at send time (ARCHITECTURE §11), so files are never stored in the
 * outbox or generated inside the transaction that queued the email. Domain modules register a
 * resolver per kind on start-up (the invoice PDF is registered by commerce).
 */
@Injectable()
export class AttachmentRegistry {
  private readonly resolvers = new Map<string, Resolver>();

  register(kind: string, resolver: Resolver): void {
    this.resolvers.set(kind, resolver);
  }

  async resolve(refs: AttachmentRef[]): Promise<ResolvedAttachment[]> {
    const files: ResolvedAttachment[] = [];
    for (const { kind, ref } of refs) {
      const resolver = this.resolvers.get(kind);
      if (!resolver) throw new Error(`No attachment resolver for "${kind}"`);
      files.push(await resolver(ref));
    }
    return files;
  }
}
