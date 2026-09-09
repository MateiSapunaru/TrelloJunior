import { Router } from "express";
import { Types, type HydratedDocument } from "mongoose";
import { getBoard, getList } from "../lib/requestContext";
import { requireAuth } from "../middleware/auth";
import { loadBoard } from "../middleware/loadBoard";
import { loadList } from "../middleware/loadList";
import Card, { type CardDoc } from "../models/Card";
import List from "../models/List";

// mergeParams so this router (mounted at /boards/:boardId/lists/:listId/cards) can
// read both req.params.boardId and req.params.listId.
const router = Router({ mergeParams: true });

router.use(requireAuth, loadBoard, loadList);

function serializeCard(card: HydratedDocument<CardDoc>) {
  return {
    id: card.id,
    listId: card.listId.toString(),
    boardId: card.boardId.toString(),
    title: card.title,
    description: card.description,
    position: card.position,
    createdAt: card.createdAt,
    updatedAt: card.updatedAt,
  };
}

async function findCardInList(cardId: string, listId: Types.ObjectId) {
  if (!Types.ObjectId.isValid(cardId)) {
    return null;
  }
  return Card.findOne({ _id: cardId, listId });
}

router.post("/", async (req, res) => {
  const { title, description } = req.body ?? {};
  if (typeof title !== "string" || title.trim().length === 0) {
    res.status(400).json({ error: "title is required" });
    return;
  }
  if (description !== undefined && typeof description !== "string") {
    res.status(400).json({ error: "description must be a string" });
    return;
  }

  const list = getList(req);
  const position = await Card.countDocuments({ listId: list._id });
  const card = await Card.create({
    listId: list._id,
    boardId: getBoard(req)._id,
    title: title.trim(),
    description: description ?? "",
    position,
  });
  res.status(201).json(serializeCard(card));
});

router.get("/", async (req, res) => {
  const cards = await Card.find({ listId: getList(req)._id }).sort({ position: 1 });
  res.status(200).json(cards.map(serializeCard));
});

router.get("/:cardId", async (req, res) => {
  const card = await findCardInList(req.params.cardId, getList(req)._id);
  if (!card) {
    res.status(404).json({ error: "card not found" });
    return;
  }
  res.status(200).json(serializeCard(card));
});

router.patch("/:cardId", async (req, res) => {
  const card = await findCardInList(req.params.cardId, getList(req)._id);
  if (!card) {
    res.status(404).json({ error: "card not found" });
    return;
  }

  const { title, description, position, listId } = req.body ?? {};

  if (title !== undefined) {
    if (typeof title !== "string" || title.trim().length === 0) {
      res.status(400).json({ error: "title must be a non-empty string" });
      return;
    }
    card.title = title.trim();
  }

  if (description !== undefined) {
    if (typeof description !== "string") {
      res.status(400).json({ error: "description must be a string" });
      return;
    }
    card.description = description;
  }

  if (listId !== undefined) {
    // Moving a card to another list — e.g. dragging it to the next column. The target
    // list must belong to the *same* board (getBoard(req), resolved from the URL the
    // caller already has access to), which is what stops a member of board A from
    // reassigning a card into a list that lives on board B.
    if (typeof listId !== "string" || !Types.ObjectId.isValid(listId)) {
      res.status(400).json({ error: "listId must be a valid id" });
      return;
    }
    const targetList = await List.findOne({ _id: listId, boardId: getBoard(req)._id });
    if (!targetList) {
      res.status(400).json({ error: "target list not found on this board" });
      return;
    }
    card.listId = targetList._id;
  }

  if (position !== undefined) {
    if (typeof position !== "number" || !Number.isFinite(position)) {
      res.status(400).json({ error: "position must be a number" });
      return;
    }
    card.position = position;
  }

  await card.save();
  res.status(200).json(serializeCard(card));
});

router.delete("/:cardId", async (req, res) => {
  const card = await findCardInList(req.params.cardId, getList(req)._id);
  if (!card) {
    res.status(404).json({ error: "card not found" });
    return;
  }

  await card.deleteOne();
  res.status(204).send();
});

export default router;
