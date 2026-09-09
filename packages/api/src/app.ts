import cors from "cors";
import express from "express";
import authRouter from "./routes/auth";
import boardsRouter from "./routes/boards";

const app = express();

app.use(cors());
app.use(express.json());

app.get("/health", (_req, res) => {
  res.status(200).json({ status: "ok" });
});

app.use("/auth", authRouter);
app.use("/boards", boardsRouter);

export default app;
