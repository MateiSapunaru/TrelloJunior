import "dotenv/config";
import app from "./app";
import { connectDB } from "./db";

const PORT = process.env.PORT ?? 4000;
const MONGO_URI = process.env.MONGO_URI ?? "mongodb://localhost:27017/trellojunior";

async function main() {
  await connectDB(MONGO_URI);
  console.log("MongoDB connected");

  app.listen(PORT, () => {
    console.log(`API listening on port ${PORT}`);
  });
}

main().catch((err) => {
  console.error("Failed to start server", err);
  process.exit(1);
});
