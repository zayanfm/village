import mongoose from 'mongoose';

export async function connect(): Promise<typeof mongoose> {
  const uri = process.env.MONGO_URI || 'mongodb://localhost:27017/house_db';
  return mongoose.connect(uri);
}

export { mongoose };
