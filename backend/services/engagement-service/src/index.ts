import './loadEnv';
import express from 'express';
import cors from 'cors';
import { connect } from './db';
import { PostModel } from './models/Post';
import { CommentModel } from './models/Comment';

const app = express();
app.use(cors());
app.use(express.json());

app.get('/health', (_req, res) => res.json({ service: 'engagement-service', ok: true }));

// Boards are anonymous in the UI; persona is inferred from the board so the
// frontend only needs to send { board, body }.
const PERSONA_FOR_BOARD: Record<string, 'youth' | 'worker'> = {
  youth_pinboard: 'youth',
  worker_forum: 'worker',
};
function normalizeBoard(value: unknown): 'youth_pinboard' | 'worker_forum' {
  return value === 'worker_forum' ? 'worker_forum' : 'youth_pinboard';
}

// Shape Mongo docs into the compact payload the frontend renders.
const toPost = (p: any) => ({
  id: String(p._id),
  board: p.board,
  body: p.body,
  comments: p.counts?.comments ?? 0,
  createdAt: new Date(p.createdAt).getTime(),
});
const toComment = (c: any) => ({
  id: String(c._id),
  body: c.body,
  createdAt: new Date(c.createdAt).getTime(),
});

// ── Posts ────────────────────────────────────────────────────────────────────
app.get('/forum/posts', async (req, res, next) => {
  try {
    const board = normalizeBoard(req.query.board);
    const posts = await PostModel.find({ board, 'moderation.status': 'visible' })
      .sort({ createdAt: -1 })
      .lean();
    res.json({ posts: posts.map(toPost) });
  } catch (e) {
    next(e);
  }
});

app.post('/forum/posts', async (req, res, next) => {
  try {
    const { board: rawBoard, body, author } = req.body ?? {};
    if (!body) return res.status(400).json({ error: 'body is required' });
    const board = normalizeBoard(rawBoard);
    const post = await PostModel.create({
      board,
      authorId: author ?? 'anon',
      authorPersona: PERSONA_FOR_BOARD[board],
      // Pinboard notes have no separate title; derive a short, non-empty one.
      title: String(body).slice(0, 80) || 'Note',
      body,
    });
    res.status(201).json(toPost(post));
  } catch (e) {
    next(e);
  }
});

// ── Comments ─────────────────────────────────────────────────────────────────
app.get('/forum/posts/:postId/comments', async (req, res, next) => {
  try {
    const comments = await CommentModel.find({ postId: req.params.postId })
      .sort({ createdAt: 1 })
      .lean();
    res.json({ comments: comments.map(toComment) });
  } catch (e) {
    next(e);
  }
});

app.post('/forum/posts/:postId/comments', async (req, res, next) => {
  try {
    const { postId } = req.params;
    const { body, author } = req.body ?? {};
    if (!body) return res.status(400).json({ error: 'body is required' });

    const post = await PostModel.findById(postId);
    if (!post) return res.status(404).json({ error: 'post not found' });
    if (!post.commentsEnabled) return res.status(403).json({ error: 'comments are disabled' });

    // Build first (generates _id) so `path` can be set to a non-empty
    // materialized path before the single save — an empty string would fail
    // the schema's `required` validation.
    const comment = new CommentModel({
      postId,
      parentId: null,
      authorId: author ?? 'anon',
      authorPersona: post.authorPersona,
      body,
    });
    comment.path = String(comment._id); // top-level: path is just its own id
    await comment.save();

    // Keep the denormalized count in sync so list views stay cheap.
    await PostModel.updateOne({ _id: postId }, { $inc: { 'counts.comments': 1 } });

    res.status(201).json(toComment(comment));
  } catch (e) {
    next(e);
  }
});

// Centralized error handler → JSON 500 instead of an HTML stack page.
app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('[engagement-service] route error:', err?.message);
  res.status(500).json({ error: 'internal error' });
});

const port = Number(process.env.PORT) || 4004;

// Listen immediately so /health is reachable; connect to Mongo in the
// background and log (don't crash) if it isn't up — though the forum routes
// require it. On an empty board, seed one welcome note so the UI isn't blank.
app.listen(port, () => console.log(`[engagement-service] listening on :${port}`));
connect()
  .then(async () => {
    for (const board of ['youth_pinboard', 'worker_forum'] as const) {
      const count = await PostModel.countDocuments({ board });
      if (count === 0) {
        await PostModel.create({
          board,
          authorId: 'system',
          authorPersona: PERSONA_FOR_BOARD[board],
          title: 'Welcome',
          body:
            board === 'youth_pinboard'
              ? 'Welcome to the pinboard 🌱 share a small win.'
              : 'Welcome to the worker forum 🌱',
        });
      }
    }
  })
  .catch((e) =>
    console.warn(`[engagement-service] ⚠ MongoDB not connected (forum routes need it): ${e.message}`)
  );
