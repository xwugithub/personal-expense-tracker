import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { connectToDatabase } from "@/lib/mongoose";
import { User } from "@/models/User";
import { loginSchema } from "@/lib/validation/auth";

export const { handlers, auth, signIn, signOut } = NextAuth({
  session: {
    strategy: "jwt",
    maxAge: 60 * 60 * 12, // 12 hours
    updateAge: 60 * 60, // 1 hour rolling refresh
  },
  pages: {
    signIn: "/login",
  },
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const parsed = loginSchema.safeParse(credentials);
        if (!parsed.success) return null;

        await connectToDatabase();
        const user = await User.findOne({ email: parsed.data.email }).select(
          "+passwordHash",
        );
        if (!user) return null;

        const isValid = await user.comparePassword(parsed.data.password);
        if (!isValid) return null;

        return {
          id: user._id.toString(),
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          sessionVersion: user.sessionVersion,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.sub = user.id;
        token.sessionVersion = user.sessionVersion;
        return token;
      }

      if (typeof token.sub !== "string") return null;

      await connectToDatabase();
      const dbUser = await User.findById(token.sub).select("sessionVersion");
      if (!dbUser || dbUser.sessionVersion !== token.sessionVersion) {
        return null;
      }

      return token;
    },
    async session({ session, token }) {
      if (typeof token.sub === "string") {
        session.user.id = token.sub;
      }
      return session;
    },
  },
});
