import type { Request } from "express";
import type { HydratedDocument } from "mongoose";
import type { BoardDoc } from "../models/Board";
import type { ListDoc } from "../models/List";

// Small "fail loudly" accessors for values that auth/board/list-loading middleware
// guarantees are set before a route handler runs. Throwing here (instead of using
// non-null assertions scattered through routes) turns a broken middleware order into
// an immediate 500 during development rather than a silent undefined-access bug.

export function getUserId(req: Request): string {
  if (!req.userId) {
    throw new Error("requireAuth middleware did not run before this route");
  }
  return req.userId;
}

export function getBoard(req: Request): HydratedDocument<BoardDoc> {
  if (!req.board) {
    throw new Error("loadBoard middleware did not run before this route");
  }
  return req.board;
}

export function getList(req: Request): HydratedDocument<ListDoc> {
  if (!req.list) {
    throw new Error("loadList middleware did not run before this route");
  }
  return req.list;
}
