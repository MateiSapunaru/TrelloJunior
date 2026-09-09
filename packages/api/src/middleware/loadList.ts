import type { NextFunction, Request, Response } from "express";
import { Types } from "mongoose";
import { getBoard } from "../lib/requestContext";
import List from "../models/List";

// Mounted after loadBoard on the cards router. Confirms :listId both exists and
// belongs to req.board — without this, a member of board A could reference a listId
// that actually belongs to board B and read/write cards on a board they never joined.
export async function loadList(
  req: Request<{ boardId: string; listId: string }>,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const board = getBoard(req);

  if (!Types.ObjectId.isValid(req.params.listId)) {
    res.status(404).json({ error: "list not found" });
    return;
  }

  const list = await List.findOne({ _id: req.params.listId, boardId: board._id });
  if (!list) {
    res.status(404).json({ error: "list not found" });
    return;
  }

  req.list = list;
  next();
}
