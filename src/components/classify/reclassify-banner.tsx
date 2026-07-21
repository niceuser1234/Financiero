"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { retryClassification } from "@/lib/classify/actions";

export function ReclassifyBanner({ count }: { count: number }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  if (count === 0) return null;

  return (
    <div className="mb-3 flex items-center justify-between gap-3 rounded-md bg-review-soft px-4 py-3 text-sm text-review">
      <span>
        {count} Umsatz{count === 1 ? "" : "e"} nicht klassifiziert.
      </span>
      <Button
        size="sm"
        variant="outline"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const { classified } = await retryClassification();
            toast.success(`${classified} Umsätze klassifiziert`);
            router.refresh();
          })
        }
      >
        {pending ? "Läuft…" : "Erneut versuchen"}
      </Button>
    </div>
  );
}
