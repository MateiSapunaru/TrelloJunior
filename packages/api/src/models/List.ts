import { Schema, model, type InferSchemaType } from "mongoose";

const listSchema = new Schema(
  {
    boardId: { type: Schema.Types.ObjectId, ref: "Board", required: true },
    title: { type: String, required: true, trim: true },
    // Plain integer, client-assigned on reorder — no server-side shifting of siblings.
    // At this scale (a portfolio board, not a production Trello) that's a deliberate
    // simplification: a real drag-and-drop-heavy app would use fractional/lexicographic
    // positions to avoid rewriting every sibling's position on each reorder.
    position: { type: Number, required: true, default: 0 },
  },
  { timestamps: true },
);

export type ListDoc = InferSchemaType<typeof listSchema>;
export default model("List", listSchema);
