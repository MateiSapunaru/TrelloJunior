import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";
import authRouter from "./routes/auth";
import boardsRouter from "./routes/boards";
import cardsRouter from "./routes/cards";
import listsRouter from "./routes/lists";

const app = express();

// credentials: true is required for the browser to send/store the httpOnly auth
// cookie across the frontend (Vite, :5173) <-> API (:4000) port boundary; that in
// turn requires an explicit origin below instead of the wildcard "*" cors() default.
app.use(
  cors({
    origin: process.env.CORS_ORIGIN ?? "http://localhost:5173",
    credentials: true,
  }),
);
app.use(express.json());
app.use(cookieParser());

app.get("/health", (_req, res) => {
  res.status(200).json({ status: "ok" });
});

app.use("/auth", authRouter);
app.use("/boards", boardsRouter);
app.use("/boards/:boardId/lists", listsRouter);
app.use("/boards/:boardId/lists/:listId/cards", cardsRouter);

export default app;
