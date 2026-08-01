import bcrypt from "bcryptjs";
import mongoose, { Schema, type HydratedDocument, type Model } from "mongoose";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const SALT_ROUNDS = 12;

export interface IUser {
  firstName: string;
  lastName: string;
  email: string;
  passwordHash: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface IUserVirtuals {
  /** Write-only virtual: assign a plaintext password to have it hashed into passwordHash on save. */
  password: string;
}

export interface IUserMethods {
  comparePassword(candidate: string): Promise<boolean>;
}

type UserModel = Model<IUser, object, IUserMethods, IUserVirtuals>;
export type UserDocument = HydratedDocument<IUser, IUserMethods, object, IUserVirtuals>;

const userSchema = new Schema<IUser, UserModel, IUserMethods, object, IUserVirtuals>(
  {
    firstName: { type: String, required: true, trim: true },
    lastName: { type: String, required: true, trim: true },
    email: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
      match: EMAIL_PATTERN,
    },
    passwordHash: { type: String, required: true, select: false },
  },
  { timestamps: true },
);

userSchema.virtual("password").set(function setPassword(this: UserDocument, value: string) {
  this.$locals.password = value;
});

userSchema.pre("validate", async function hashPassword(this: UserDocument) {
  const plainText = this.$locals.password as string | undefined;
  if (!plainText) return;
  this.passwordHash = await bcrypt.hash(plainText, SALT_ROUNDS);
});

userSchema.method(
  "comparePassword",
  function comparePassword(this: UserDocument, candidate: string) {
    return bcrypt.compare(candidate, this.passwordHash);
  },
);

export const User =
  (mongoose.models.User as UserModel | undefined) ??
  mongoose.model<IUser, UserModel>("User", userSchema);
