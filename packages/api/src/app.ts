import cors from "cors";
import express from "express";
import authRouter from "./routes/auth";
import boardsRouter from "./routes/boards";
import cardsRouter from "./routes/cards";
import listsRouter from "./routes/lists";

const app = express();

app.use(cors());
app.use(express.json());

app.get("/health", (_req, res) => {
  res.status(200).json({ status: "ok" });
});

app.use("/auth", authRouter);
app.use("/boards", boardsRouter);
app.use("/boards/:boardId/lists", listsRouter);
app.use("/boards/:boardId/lists/:listId/cards", cardsRouter);

export default app;
