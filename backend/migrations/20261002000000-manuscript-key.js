/**
 * BS-20: book PDFs moved from Cloudinary to Cloudflare R2. The manuscript is now identified by its
 * R2 object key (`manuscript.key`) and has no Cloudinary version. Files uploaded to Cloudinary
 * before this are not copied: the store was not live, so the editor re-uploads them.
 */
export const up = async (db) => {
  await db.collection('books').updateMany(
    { 'manuscript.publicId': { $exists: true } },
    {
      $rename: { 'manuscript.publicId': 'manuscript.key' },
      $unset: { 'manuscript.version': '' },
    },
  );
};

export const down = async (db) => {
  await db.collection('books').updateMany(
    { 'manuscript.key': { $exists: true } },
    {
      $rename: { 'manuscript.key': 'manuscript.publicId' },
      $set: { 'manuscript.version': 1 },
    },
  );
};
