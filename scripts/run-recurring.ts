import { runRecurringDetection } from "../src/lib/recurring/apply";

async function main() {
  const r = await runRecurringDetection("2026-07-21");
  console.log(JSON.stringify(r));
  process.exit(0);
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
