import './loadEnv';
import { connect, mongoose } from './db';
import { PostModel } from './models/Post';

// Connects to MongoDB and does a real write/read round-trip through the Post
// model (then removes the probe document).
async function main() {
  await connect();
  const probe = await PostModel.create({
    board: 'youth_pinboard',
    authorId: 'healthcheck-youth',
    authorPersona: 'youth',
    title: 'healthcheck',
  });
  const found = await PostModel.findById(probe._id).lean();
  await PostModel.deleteOne({ _id: probe._id });
  console.log(
    `[engagement-service] ✅ MongoDB reachable on :27018 — wrote+read post ${found?._id}`
  );
}

main()
  .catch((e) => {
    console.error('[engagement-service] ❌ DB test failed:', e.message);
    process.exit(1);
  })
  .finally(() => mongoose.disconnect());
