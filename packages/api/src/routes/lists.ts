import { Router } from "express";
import { Types, type HydratedDocument } from "mongoose";
import { getBoard } from "../lib/requestContext";
import { requireAuth } from "../middleware/auth";
import { loadBoard } from "../middleware/loadBoard";
import Card from "../models/Card";
import List, { type ListDoc } from "../models/List";

// mergeParams so this router (mounted at /boards/:boardId/lists) can read req.params.boardId.
const router = Router({ mergeParams: true });

// Any board member (owner or collaborator) can manage lists — unlike board metadata
// and collaborator management, which stay owner-only in boards.ts. Editing board
// *content* is exactly what being a collaborator is for.
router.use(requireAuth, loadBoard);

function serializeList(list: HydratedDocument<ListDoc>) {
  return {
    id: list.id,
    boardId: list.boardId.toString(),
    title: list.title,
    position: list.position,
    createdAt: list.createdAt,
    updatedAt: list.updatedAt,
  };
}

async function findListInBoard(listId: string, boardId: Types.ObjectId) {
  if (!Types.ObjectId.isValid(listId)) {
    return null;
  }
  return List.findOne({ _id: listId, boardId });
}

router.post("/", async (req, res) => {
  const { title } = req.body ?? {};
  if (typeof title !== "string" || title.trim().length === 0) {
    res.status(400).json({ error: "title is required" });
    return;
  }

  const board = getBoard(req);
  const position = await List.countDocuments({ boardId: board._id });
  const list = await List.create({ boardId: board._id, title: title.trim(), position });
  res.status(201).json(serializeList(list));
});

router.get("/", async (req, res) => {
  const lists = await List.find({ boardId: getBoard(req)._id }).sort({ position: 1 });
  res.status(200).json(lists.map(serializeList));
});

router.patch("/:listId", async (req, res) => {
  const list = await findListInBoard(req.params.listId, getBoard(req)._id);
  if (!list) {
    res.status(404).json({ error: "list not found" });
    return;
  }

  const { title, position } = req.body ?? {};
  if (title !== undefined) {
    if (typeof title !== "string" || title.trim().length === 0) {
      res.status(400).json({ error: "title must be a non-empty string" });
      return;
    }
    list.title = title.trim();
  }
  if (position !== undefined) {
    if (typeof position !== "number" || !Number.isFinite(position)) {
      res.status(400).json({ error: "position must be a number" });
      return;
    }
    list.position = position;
  }

  await list.save();
  res.status(200).json(serializeList(list));
});

router.delete("/:listId", async (req, res) => {
  const list = await findListInBoard(req.params.listId, getBoard(req)._id);
  if (!list) {
    res.status(404).json({ error: "list not found" });
    return;
  }

  await Card.deleteMany({ listId: list._id });
  await list.deleteOne();
  res.status(204).send();
});

export default router;
