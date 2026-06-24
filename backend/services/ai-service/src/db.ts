import mongoose from 'mongoose';

export async function connect(): Promise<typeof mongoose> {
  const uri = process.env.MONGO_URI || 'mongodb://localhost:27019/ai_db';
  return mongoose.connect(uri);
}

export { mongoose };
