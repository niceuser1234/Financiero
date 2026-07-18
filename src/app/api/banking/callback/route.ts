import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { bankAccounts, connections } from "@/db/schema";
import { encrypt } from "@/lib/crypto";
import { enableBankingFromEnv } from "@/lib/banking/enable-banking";
import { verifyState } from "@/lib/banking/state";

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  const state = req.nextUrl.searchParams.get("state");
  const base = process.env.APP_BASE_URL ?? req.nextUrl.origin;

  if (!code || !state) {
    return NextResponse.redirect(`${base}/settings/connections?error=missing_params`);
  }
  const parsed = verifyState(state);
  if (!parsed) {
    return NextResponse.redirect(`${base}/settings/connections?error=bad_state`);
  }

  try {
    const result = await enableBankingFromEnv().completeAuth(code);
    const validUntil = result.validUntil ? new Date(result.validUntil) : null;

    let connectionId = parsed.reconnect;
    if (connectionId) {
      await db
        .update(connections)
        .set({
          sessionIdEnc: encrypt(result.sessionId),
          status: "active",
          consentValidUntil: validUntil,
        })
        .where(eq(connections.id, connectionId));
    } else {
      const [conn] = await db
        .insert(connections)
        .values({
          provider: "enable_banking",
          aspspName: parsed.aspsp ?? "Bank",
          aspspCountry: parsed.country ?? "DE",
          sessionIdEnc: encrypt(result.sessionId),
          status: "active",
          consentValidUntil: validUntil,
        })
        .returning();
      connectionId = conn.id;
    }

    // Konten upserten (Match auf ebAccountUid).
    for (const a of result.accounts) {
      const existing = await db
        .select()
        .from(bankAccounts)
        .where(eq(bankAccounts.ebAccountUid, a.uid));
      if (existing.length === 0) {
        await db.insert(bankAccounts).values({
          connectionId,
          ebAccountUid: a.uid,
          name: a.name,
          ibanMasked: a.ibanMasked,
          type: a.type,
          currency: a.currency,
        });
      } else {
        await db
          .update(bankAccounts)
          .set({ connectionId, name: a.name, ibanMasked: a.ibanMasked, currency: a.currency })
          .where(eq(bankAccounts.ebAccountUid, a.uid));
      }
    }

    return NextResponse.redirect(`${base}/settings/connections?connected=1`);
  } catch (e) {
    const msg = encodeURIComponent((e as Error).message.slice(0, 120));
    return NextResponse.redirect(`${base}/settings/connections?error=${msg}`);
  }
}
