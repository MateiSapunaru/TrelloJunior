import type { NextFunction, Request, Response } from "express";
import { findVisibleBoard } from "../lib/boardAccess";
import { getUserId } from "../lib/requestContext";

// Mounted on every board-scoped router (lists, cards) after requireAuth. Resolves
// :boardId once and attaches it to req.board so nested routes don't each re-derive
// board membership — they just read req.board and know the caller already passed
// the ownership/collaborator check.
export async function loadBoard(
  req: Request<{ boardId: string }>,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const board = await findVisibleBoard(req.params.boardId, getUserId(req));
  if (!board) {
    res.status(404).json({ error: "board not found" });
    return;
  }
  req.board = board;
  next();
}
