import "express";
import type { HydratedDocument } from "mongoose";
import type { BoardDoc } from "../models/Board";
import type { ListDoc } from "../models/List";

declare global {
  namespace Express {
    interface Request {
      userId?: string;
      board?: HydratedDocument<BoardDoc>;
      list?: HydratedDocument<ListDoc>;
    }
  }
}
