import mongoose from "mongoose";

export async function connectDB(uri: string): Promise<typeof mongoose> {
  return mongoose.connect(uri);
}

export async function disconnectDB(): Promise<void> {
  await mongoose.disconnect();
}
