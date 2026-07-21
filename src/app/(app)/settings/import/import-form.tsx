"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  importCsv,
  previewCsv,
  type ImportResult,
  type PreviewResult,
} from "@/lib/import/actions";
import type { ProfileId } from "@/lib/import/profiles";

type Account = { id: string; name: string; type: string; currency: string };

export function ImportForm({ accounts }: { accounts: Account[] }) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [profile, setProfile] = useState<ProfileId>("dkb");
  const [accountId, setAccountId] = useState<string>(accounts[0]?.id ?? "__new__");
  const [newName, setNewName] = useState("");
  const [content, setContent] = useState<string | null>(null);
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [pending, startTransition] = useTransition();

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    setContent(text);
    setPreview(null);
    startTransition(async () => {
      const p = await previewCsv(profile, text);
      setPreview(p);
    });
  }

  function onImport() {
    if (!content) return;
    startTransition(async () => {
      try {
        const res: ImportResult = await importCsv(
          profile,
          accountId,
          content,
          accountId === "__new__" ? { name: newName || "CSV-Konto", type: "emoney" } : undefined,
        );
        toast.success(`Import fertig: ${res.inserted} neu, ${res.skipped} übersprungen`, {
          description: res.errors.length ? `${res.errors.length} Fehlerzeilen` : undefined,
        });
        setContent(null);
        setPreview(null);
        if (fileRef.current) fileRef.current.value = "";
        router.refresh();
      } catch (e) {
        toast.error("Import fehlgeschlagen", { description: (e as Error).message });
      }
    });
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label>Profil</Label>
          <Select value={profile} onValueChange={(v) => v && setProfile(v as ProfileId)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="dkb">DKB Girokonto</SelectItem>
              <SelectItem value="dkb_visa">DKB Visa Kreditkarte</SelectItem>
              <SelectItem value="revolut">Revolut</SelectItem>
              <SelectItem value="paypal">PayPal</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Konto</Label>
          <Select value={accountId} onValueChange={(v) => v && setAccountId(v)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {accounts.map((a) => (
                <SelectItem key={a.id} value={a.id}>
                  {a.name}
                </SelectItem>
              ))}
              <SelectItem value="__new__">+ Neues Konto anlegen</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {accountId === "__new__" && (
        <div className="space-y-1.5">
          <Label htmlFor="newName">Name des neuen Kontos</Label>
          <Input
            id="newName"
            placeholder="z.B. PayPal"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
          />
        </div>
      )}

      <div className="space-y-1.5">
        <Label htmlFor="file">CSV-Datei</Label>
        <Input id="file" type="file" accept=".csv,text/csv" ref={fileRef} onChange={onFile} />
      </div>

      {preview && (
        <Card>
          <CardContent className="pt-6">
            <p className="mb-3 text-sm text-muted-foreground">
              {preview.total} Buchungen erkannt · Vorschau der ersten {preview.rows.length}
              {preview.errors.length > 0 && (
                <span className="text-destructive"> · {preview.errors.length} Fehlerzeilen</span>
              )}
            </p>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Datum</TableHead>
                    <TableHead>Empfänger</TableHead>
                    <TableHead>Zweck</TableHead>
                    <TableHead className="text-right">Betrag</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {preview.rows.map((r, i) => (
                    <TableRow key={i}>
                      <TableCell className="whitespace-nowrap">{r.bookingDate}</TableCell>
                      <TableCell className="max-w-40 truncate">{r.counterparty}</TableCell>
                      <TableCell className="max-w-56 truncate text-muted-foreground">{r.purpose}</TableCell>
                      <TableCell className="text-right tabular-nums">{r.amount}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            {preview.errors.length > 0 && (
              <ul className="mt-3 space-y-1 text-xs text-destructive">
                {preview.errors.slice(0, 5).map((e, i) => (
                  <li key={i}>{e}</li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      )}

      <Button onClick={onImport} disabled={!content || pending}>
        {pending ? "Verarbeite…" : "Importieren"}
      </Button>
    </div>
  );
}
