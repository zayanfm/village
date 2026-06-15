import mongoose from 'mongoose';

export async function connect(): Promise<typeof mongoose> {
  const uri = process.env.MONGO_URI || 'mongodb://localhost:27018/engagement_db';
  return mongoose.connect(uri);
}

export { mongoose };
