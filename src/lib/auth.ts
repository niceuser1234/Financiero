import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { APIError } from "better-auth/api";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { user, session, account, verification } from "@/db/auth-schema";

export const auth = betterAuth({
  baseURL: process.env.BETTER_AUTH_URL ?? "http://localhost:3000",
  secret: process.env.BETTER_AUTH_SECRET,
  database: drizzleAdapter(db, {
    provider: "pg",
    schema: { user, session, account, verification },
  }),
  emailAndPassword: { enabled: true },
  databaseHooks: {
    user: {
      create: {
        before: async (data) => {
          // Single-User-App: nach dem ersten registrierten User keine weitere Registrierung.
          const [{ count }] = await db
            .select({ count: sql<number>`count(*)::int` })
            .from(user);
          if (count > 0) {
            throw new APIError("FORBIDDEN", {
              message: "Registrierung ist deaktiviert (Single-User-App).",
            });
          }
          return { data };
        },
      },
    },
  },
});
