import { NextRequest, NextResponse } from "next/server";
import { runSync } from "@/lib/banking/sync";
import { runPipeline } from "@/lib/classify/pipeline";

export const maxDuration = 300;

export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // Klassifizierung läuft jetzt synchron innerhalb der Pipeline — kein Batch-Poll mehr.
  const stats = await runSync("cron", { postProcess: (ids) => runPipeline(ids) });

  return NextResponse.json({ ok: true, stats });
}
