import { cache } from "react";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { connectToDatabase } from "@/lib/mongoose";
import { User } from "@/models/User";

export interface CurrentUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
}

// Wrapped in React's cache() so multiple calls within a single request (auth()
// itself, plus this DB lookup for display fields) only run once, not once per
// call site.
const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const session = await auth();
  if (!session?.user?.id) return null;

  await connectToDatabase();
  const user = await User.findById(session.user.id);
  if (!user) return null;

  return {
    id: user._id.toString(),
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
  };
});

export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }
  return user;
}

export async function requireUserOrResponse():
  Promise<{ user: CurrentUser; response: null } | { user: null; response: Response }> {
  const user = await getCurrentUser();
  if (!user) {
    return {
      user: null,
      response: Response.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }
  return { user, response: null };
}
