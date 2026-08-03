import { Types } from "mongoose";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Expense } from "@/models/Expense";
import { Category } from "@/models/Category";

function mockCategoryOwner(owner: Types.ObjectId | null) {
  vi.spyOn(Category, "findById").mockReturnValue({
    select: () => ({
      lean: () =>
        Promise.resolve(owner ? { user: owner } : null),
    }),
  } as unknown as ReturnType<typeof Category.findById>);
}

function buildExpense(overrides: Partial<Record<string, unknown>> = {}) {
  return new Expense({
    user: new Types.ObjectId(),
    category: new Types.ObjectId(),
    amount: 10,
    ...overrides,
  });
}

describe("Expense schema validation", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("requires user, category, and amount", async () => {
    const expense = new Expense({});
    const err = await expense.validate().catch((e) => e);
    expect(err.errors.user).toBeDefined();
    expect(err.errors.category).toBeDefined();
    expect(err.errors.amount).toBeDefined();
  });

  it("rejects an amount of 0 or less", async () => {
    mockCategoryOwner(new Types.ObjectId());
    const expense = buildExpense({ amount: 0 });
    const err = await expense.validate().catch((e) => e);
    expect(err.errors.amount).toBeDefined();
  });

  it("defaults date to the current time when omitted", () => {
    const before = Date.now();
    const expense = buildExpense();
    const after = Date.now();
    expect(expense.date.getTime()).toBeGreaterThanOrEqual(before);
    expect(expense.date.getTime()).toBeLessThanOrEqual(after);
  });

  it("trims the description", () => {
    const expense = buildExpense({ description: "  lunch  " });
    expect(expense.description).toBe("lunch");
  });

  it("passes validation when the category belongs to the same user", async () => {
    const userId = new Types.ObjectId();
    mockCategoryOwner(userId);
    const expense = buildExpense({ user: userId });

    await expect(expense.validate()).resolves.toBeUndefined();
  });

  it("fails validation when the category belongs to a different user", async () => {
    mockCategoryOwner(new Types.ObjectId());
    const expense = buildExpense({ user: new Types.ObjectId() });

    const err = await expense.validate().catch((e) => e);
    expect(err.errors.category).toBeDefined();
    expect(err.errors.category.message).toMatch(/same user/i);
  });

  it("fails validation when the category does not exist", async () => {
    mockCategoryOwner(null);
    const expense = buildExpense();

    const err = await expense.validate().catch((e) => e);
    expect(err.errors.category).toBeDefined();
  });
});
