"use client";

import { useState } from "react";
import { initialFor } from "@/lib/ds/format";
import { logoUrlFor } from "@/lib/merchants/logo";
import { cn } from "@/lib/utils";

/**
 * Händler-Avatar: Logo der Marke wenn auflösbar, sonst getöntes Quadrat mit Initiale.
 */
export function MerchantAvatar({
  name,
  className,
}: {
  name: string | null | undefined;
  className?: string;
}) {
  const src = logoUrlFor(name);
  const [failed, setFailed] = useState(false);

  if (src && !failed) {
    return (
      <span
        aria-hidden
        className={cn(
          "grid size-[38px] shrink-0 place-items-center overflow-hidden rounded-sm bg-white ring-1 ring-hairline",
          className,
        )}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt=""
          width={28}
          height={28}
          className="size-7 object-contain"
          loading="lazy"
          referrerPolicy="no-referrer"
          onError={() => setFailed(true)}
        />
      </span>
    );
  }

  return (
    <span
      aria-hidden
      className={cn(
        "grid size-[38px] shrink-0 place-items-center rounded-sm bg-accent-soft text-sm font-semibold text-[var(--accent)]",
        className,
      )}
    >
      {initialFor(name)}
    </span>
  );
}
