import { Schema, model, type InferSchemaType } from "mongoose";

const boardSchema = new Schema(
  {
    title: { type: String, required: true, trim: true },
    ownerId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    collaboratorIds: { type: [{ type: Schema.Types.ObjectId, ref: "User" }], default: [] },
  },
  { timestamps: true },
);

export type BoardDoc = InferSchemaType<typeof boardSchema>;
export default model("Board", boardSchema);
