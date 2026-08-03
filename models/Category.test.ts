import { Types } from "mongoose";
import { describe, expect, it } from "vitest";
import { Category, DEFAULT_CATEGORY_NAMES } from "@/models/Category";

describe("Category schema validation", () => {
  it("requires a user and a name", () => {
    const category = new Category({});
    const err = category.validateSync();
    expect(err?.errors.user).toBeDefined();
    expect(err?.errors.name).toBeDefined();
  });

  it("trims the name", () => {
    const category = new Category({
      user: new Types.ObjectId(),
      name: "  Food  ",
    });
    expect(category.name).toBe("Food");
  });

  it("passes validation with a user and name present", () => {
    const category = new Category({
      user: new Types.ObjectId(),
      name: "Food",
    });
    const err = category.validateSync();
    expect(err).toBeUndefined();
  });
});

describe("DEFAULT_CATEGORY_NAMES", () => {
  it("contains the expected default categories with no duplicates", () => {
    expect(DEFAULT_CATEGORY_NAMES).toEqual([
      "Food",
      "Transport",
      "Housing",
      "Utilities",
      "Entertainment",
      "Health",
      "Shopping",
      "Other",
    ]);
    expect(new Set(DEFAULT_CATEGORY_NAMES).size).toBe(DEFAULT_CATEGORY_NAMES.length);
  });
});
