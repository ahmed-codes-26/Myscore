import mongoose from 'mongoose';

let isConnected = false;

export async function connectDB() {
  const uri = process.env.MONGODB_URI;

  if (!uri) {
    console.warn('[MongoDB] MONGODB_URI not provided. Server will run in offline/local-only mode.');
    return false;
  }

  try {
    const conn = await mongoose.connect(uri, {
      serverSelectionTimeoutMS: 5000,
    });
    isConnected = true;
    console.log(`[MongoDB] Connected successfully to host: ${conn.connection.host}`);
    return true;
  } catch (err) {
    console.error(`[MongoDB] Connection error: ${err.message}`);
    isConnected = false;
    return false;
  }
}

export function isDBConnected() {
  return mongoose.connection.readyState === 1;
}
