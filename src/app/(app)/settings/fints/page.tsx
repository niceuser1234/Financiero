import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { connections } from "@/db/schema";
import { PageHeader } from "@/components/page-header";
import { FintsConnect } from "./fints-connect";

export default async function FintsPage() {
  const [existing] = await db
    .select({ id: connections.id, status: connections.status })
    .from(connections)
    .where(eq(connections.provider, "fints"))
    .orderBy(desc(connections.createdAt))
    .limit(1);

  return (
    <>
      <PageHeader title="DKB verbinden (FinTS)" />
      <p className="mb-4 max-w-prose text-sm text-muted-foreground">
        BLZ, Anmeldename, PIN und deine FinTS-Produkt-ID eingeben. Anschließend die
        Verbindung einmalig in der DKB-App per Tap bestätigen.
      </p>
      <FintsConnect existing={existing ?? null} />
    </>
  );
}
