import mongoose, { Schema, Types, type HydratedDocument, type Model } from "mongoose";

export interface ICategory {
  user: Types.ObjectId;
  name: string;
  createdAt: Date;
  updatedAt: Date;
}

type CategoryModel = Model<ICategory>;
export type CategoryDocument = HydratedDocument<ICategory>;

const categorySchema = new Schema<ICategory, CategoryModel>(
  {
    user: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    name: { type: String, required: true, trim: true },
  },
  { timestamps: true },
);

categorySchema.index(
  { user: 1, name: 1 },
  { unique: true, collation: { locale: "en", strength: 2 } },
);

export const Category =
  (mongoose.models.Category as CategoryModel | undefined) ??
  mongoose.model<ICategory, CategoryModel>("Category", categorySchema);

export const DEFAULT_CATEGORY_NAMES = [
  "Food",
  "Transport",
  "Housing",
  "Utilities",
  "Entertainment",
  "Health",
  "Shopping",
  "Other",
] as const;
