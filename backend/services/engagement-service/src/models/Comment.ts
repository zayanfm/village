import { Schema, model, InferSchemaType } from 'mongoose';

// comments — threaded replies. `parentId` gives the immediate parent; `path`
// is a materialized ancestor path ("cmt_88/cmt_91") for cheap ordered subtree
// reads without recursive queries.

const CommentSchema = new Schema(
  {
    postId: { type: String, required: true, index: true },
    parentId: { type: String, default: null }, // null = top-level
    path: { type: String, required: true, index: true },
    authorId: { type: String, required: true },
    authorPersona: { type: String, enum: ['youth', 'worker'], required: true },
    body: { type: String, required: true },
  },
  { timestamps: true, collection: 'comments' }
);

export type Comment = InferSchemaType<typeof CommentSchema>;
export const CommentModel = model('Comment', CommentSchema);
