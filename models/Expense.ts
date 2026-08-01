import mongoose, { Schema, Types, type HydratedDocument, type Model } from "mongoose";
import { Category } from "./Category";

export interface IExpense {
  user: Types.ObjectId;
  category: Types.ObjectId;
  amount: number;
  description?: string;
  date: Date;
  createdAt: Date;
  updatedAt: Date;
}

type ExpenseModel = Model<IExpense>;
export type ExpenseDocument = HydratedDocument<IExpense>;

const expenseSchema = new Schema<IExpense, ExpenseModel>(
  {
    user: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    category: {
      type: Schema.Types.ObjectId,
      ref: "Category",
      required: true,
      index: true,
      validate: {
        validator: async function validateCategoryOwnership(
          this: ExpenseDocument,
          categoryId: Types.ObjectId,
        ) {
          const category = await Category.findById(categoryId).select("user").lean();
          return category !== null && category.user.equals(this.user);
        },
        message: "Category must belong to the same user as the expense.",
      },
    },
    amount: { type: Number, required: true, min: [0.01, "Amount must be greater than 0."] },
    description: { type: String, trim: true },
    date: { type: Date, required: true, default: () => new Date() },
  },
  { timestamps: true },
);

expenseSchema.index({ user: 1, date: -1 });

export const Expense =
  (mongoose.models.Expense as ExpenseModel | undefined) ??
  mongoose.model<IExpense, ExpenseModel>("Expense", expenseSchema);
