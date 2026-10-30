"use client";
import type { ReactNode } from "react";
import { FirmPicker } from "./firm-picker";
import { useQueryState } from "./hooks";

/** Firm filter kept in the URL as `?firm=<id>&firmName=<name>`; the id is what the API gets. */
export function useFirmFilter(): { firmId: string | null; field: (id: string) => ReactNode } {
  const [q, setQ] = useQueryState();
  const firmId = q.get("firm");
  const name = q.get("firmName") ?? "Selected firm";
  return {
    firmId,
    field: (id) => (
      <FirmPicker id={id} label="Firm" value={firmId ? [{ id: firmId, display_name: name }] : []}
        onChange={(v) => setQ({ firm: v[0]?.id ?? null, firmName: v[0]?.display_name ?? null, offset: null })} />
    ),
  };
}
