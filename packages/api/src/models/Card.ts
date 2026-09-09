import { Schema, model, type InferSchemaType } from "mongoose";

const cardSchema = new Schema(
  {
    listId: { type: Schema.Types.ObjectId, ref: "List", required: true },
    // Denormalized from the parent list so authorization checks (and the "move to
    // another list" guard) don't need to populate through List -> Board on every request.
    boardId: { type: Schema.Types.ObjectId, ref: "Board", required: true },
    title: { type: String, required: true, trim: true },
    description: { type: String, default: "" },
    position: { type: Number, required: true, default: 0 },
  },
  { timestamps: true },
);

export type CardDoc = InferSchemaType<typeof cardSchema>;
export default model("Card", cardSchema);
