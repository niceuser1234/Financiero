"use client";

import { useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { PickerCategory } from "@/lib/transactions/actions";

export function CategoryPicker({
  categories,
  value,
  onChange,
  triggerLabel,
}: {
  categories: PickerCategory[];
  value: string | null;
  onChange: (categoryId: string) => void;
  triggerLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");

  const groups = useMemo(() => {
    const parents = categories.filter((c) => !c.parentId);
    return parents.map((p) => ({
      parent: p,
      children: categories.filter((c) => c.parentId === p.id),
    }));
  }, [categories]);

  const ql = q.toLowerCase();
  const current = categories.find((c) => c.id === value);

  return (
    <>
      <Button variant="outline" className="justify-start" onClick={() => setOpen(true)}>
        {triggerLabel ?? current?.name ?? "Kategorie wählen"}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-h-[80dvh] overflow-hidden">
        <DialogHeader>
          <DialogTitle>Kategorie wählen</DialogTitle>
        </DialogHeader>
        <Input autoFocus placeholder="Suchen…" value={q} onChange={(e) => setQ(e.target.value)} />
        <div className="mt-2 max-h-[55dvh] space-y-4 overflow-y-auto pr-1">
          {groups.map(({ parent, children }) => {
            const matches = (c: PickerCategory) => !ql || c.name.toLowerCase().includes(ql);
            const visibleChildren = children.filter(matches);
            const showParent = matches(parent) || visibleChildren.length > 0;
            if (!showParent) return null;
            return (
              <div key={parent.id}>
                <button
                  className={cn(
                    "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm font-medium",
                    value === parent.id ? "bg-primary/10 text-primary" : "hover:bg-muted",
                  )}
                  onClick={() => {
                    onChange(parent.id);
                    setOpen(false);
                  }}
                >
                  <span className="size-2 rounded-full" style={{ background: parent.color }} />
                  {parent.name}
                </button>
                <div className="ml-4 mt-0.5">
                  {(ql ? visibleChildren : children).map((c) => (
                    <button
                      key={c.id}
                      className={cn(
                        "block w-full rounded-md px-2 py-1 text-left text-sm",
                        value === c.id ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted",
                      )}
                      onClick={() => {
                        onChange(c.id);
                        setOpen(false);
                      }}
                    >
                      {c.name}
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </DialogContent>
      </Dialog>
    </>
  );
}
