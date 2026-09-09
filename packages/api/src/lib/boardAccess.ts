import { Types, type HydratedDocument } from "mongoose";
import Board, { type BoardDoc } from "../models/Board";

export function hasAccess(board: BoardDoc, userId: string): boolean {
  return board.ownerId.toString() === userId || board.collaboratorIds.some((id) => id.toString() === userId);
}

export function isOwner(board: BoardDoc, userId: string): boolean {
  return board.ownerId.toString() === userId;
}

// Returns the board only if the caller is its owner or a collaborator; otherwise null.
// A caller with no relationship to the board gets the same "not found" result whether
// the id is malformed, unused, or belongs to someone else entirely — that indistinguishability
// is what stops an IDOR probe from even confirming a board id exists. Shared by the boards,
// lists, and cards routers so every board-scoped resource enforces membership identically.
export async function findVisibleBoard(id: string, userId: string): Promise<HydratedDocument<BoardDoc> | null> {
  if (!Types.ObjectId.isValid(id)) {
    return null;
  }
  const board = await Board.findById(id);
  if (!board || !hasAccess(board, userId)) {
    return null;
  }
  return board;
}
