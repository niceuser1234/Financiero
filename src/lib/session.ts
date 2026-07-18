import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";

/** Erzwingt eine gültige Session in Server Components / Server Actions. */
export async function requireSession() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/login");
  return session;
}

export async function getSession() {
  return auth.api.getSession({ headers: await headers() });
}
