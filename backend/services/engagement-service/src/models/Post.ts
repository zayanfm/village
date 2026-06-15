import { Schema, model, InferSchemaType } from 'mongoose';

// posts — a board entry. `board` separates the youth pinboard from the
// worker/volunteer forum; `commentsEnabled` is the per-post equivalent of the
// frontend SHOW_COMMENTS toggle. RBAC: youth may post to 'youth_pinboard';
// workers may post anywhere and carry an implicit moderate capability.

const PostSchema = new Schema(
  {
    board: {
      type: String,
      enum: ['youth_pinboard', 'worker_forum'],
      required: true,
      index: true,
    },
    authorId: { type: String, required: true, index: true },
    authorPersona: { type: String, enum: ['youth', 'worker'], required: true },
    title: { type: String, required: true },
    body: { type: String, default: '' },
    visibility: { type: String, enum: ['members', 'staff_only', 'private'], default: 'members' },
    commentsEnabled: { type: Boolean, default: true },
    counts: {
      comments: { type: Number, default: 0 },
      reactions: { type: Number, default: 0 },
    },
    moderation: {
      status: { type: String, enum: ['visible', 'hidden', 'removed'], default: 'visible' },
      by: { type: String, default: null },
    },
  },
  { timestamps: true, collection: 'posts' }
);

export type Post = InferSchemaType<typeof PostSchema>;
export const PostModel = model('Post', PostSchema);
