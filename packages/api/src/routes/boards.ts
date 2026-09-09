import { Router } from "express";
import type { HydratedDocument } from "mongoose";
import { findVisibleBoard, isOwner } from "../lib/boardAccess";
import { getUserId } from "../lib/requestContext";
import { requireAuth } from "../middleware/auth";
import Board, { type BoardDoc } from "../models/Board";
import Card from "../models/Card";
import List from "../models/List";
import User from "../models/User";

const router = Router();

router.use(requireAuth);

function serializeBoard(board: HydratedDocument<BoardDoc>) {
  return {
    id: board.id,
    title: board.title,
    ownerId: board.ownerId.toString(),
    collaboratorIds: board.collaboratorIds.map((id) => id.toString()),
    createdAt: board.createdAt,
    updatedAt: board.updatedAt,
  };
}

router.post("/", async (req, res) => {
  const { title } = req.body ?? {};
  if (typeof title !== "string" || title.trim().length === 0) {
    res.status(400).json({ error: "title is required" });
    return;
  }

  const board = await Board.create({ title: title.trim(), ownerId: getUserId(req), collaboratorIds: [] });
  res.status(201).json(serializeBoard(board));
});

router.get("/", async (req, res) => {
  const userId = getUserId(req);
  const boards = await Board.find({ $or: [{ ownerId: userId }, { collaboratorIds: userId }] }).sort({
    createdAt: -1,
  });

  res.status(200).json(boards.map(serializeBoard));
});

router.get("/:id", async (req, res) => {
  const board = await findVisibleBoard(req.params.id, getUserId(req));
  if (!board) {
    res.status(404).json({ error: "board not found" });
    return;
  }
  res.status(200).json(serializeBoard(board));
});

router.patch("/:id", async (req, res) => {
  const userId = getUserId(req);
  const board = await findVisibleBoard(req.params.id, userId);
  if (!board) {
    res.status(404).json({ error: "board not found" });
    return;
  }
  if (!isOwner(board, userId)) {
    res.status(403).json({ error: "only the board owner can do this" });
    return;
  }

  const { title } = req.body ?? {};
  if (typeof title !== "string" || title.trim().length === 0) {
    res.status(400).json({ error: "title is required" });
    return;
  }

  board.title = title.trim();
  await board.save();
  res.status(200).json(serializeBoard(board));
});

router.delete("/:id", async (req, res) => {
  const userId = getUserId(req);
  const board = await findVisibleBoard(req.params.id, userId);
  if (!board) {
    res.status(404).json({ error: "board not found" });
    return;
  }
  if (!isOwner(board, userId)) {
    res.status(403).json({ error: "only the board owner can do this" });
    return;
  }

  // Cascade delete: without this, deleting a board leaves orphaned List/Card
  // documents referencing a boardId that no longer resolves to anything.
  await Card.deleteMany({ boardId: board._id });
  await List.deleteMany({ boardId: board._id });
  await board.deleteOne();
  res.status(204).send();
});

router.post("/:id/collaborators", async (req, res) => {
  const userId = getUserId(req);
  const board = await findVisibleBoard(req.params.id, userId);
  if (!board) {
    res.status(404).json({ error: "board not found" });
    return;
  }
  if (!isOwner(board, userId)) {
    res.status(403).json({ error: "only the board owner can do this" });
    return;
  }

  const { email } = req.body ?? {};
  if (typeof email !== "string") {
    res.status(400).json({ error: "email is required" });
    return;
  }

  const collaborator = await User.findOne({ email: email.toLowerCase() });
  if (!collaborator) {
    res.status(404).json({ error: "user not found" });
    return;
  }
  if (collaborator.id === userId) {
    res.status(400).json({ error: "cannot add yourself as a collaborator" });
    return;
  }
  if (board.collaboratorIds.some((id) => id.toString() === collaborator.id)) {
    res.status(409).json({ error: "already a collaborator" });
    return;
  }

  board.collaboratorIds.push(collaborator._id);
  await board.save();
  res.status(200).json(serializeBoard(board));
});

router.delete("/:id/collaborators/:userId", async (req, res) => {
  const userId = getUserId(req);
  const board = await findVisibleBoard(req.params.id, userId);
  if (!board) {
    res.status(404).json({ error: "board not found" });
    return;
  }
  if (!isOwner(board, userId)) {
    res.status(403).json({ error: "only the board owner can do this" });
    return;
  }

  board.collaboratorIds = board.collaboratorIds.filter((id) => id.toString() !== req.params.userId);
  await board.save();
  res.status(200).json(serializeBoard(board));
});

export default router;
