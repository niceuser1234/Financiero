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
      <PageHeader
        title="DKB verbinden (FinTS)"
        lead="BLZ, Anmeldename und PIN eingeben. Anschließend die Verbindung einmalig in der DKB-App per Tap bestätigen."
      />
      <FintsConnect existing={existing ?? null} />
    </>
  );
}
