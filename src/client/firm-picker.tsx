"use client";
import { X } from "lucide-react";
import { useState } from "react";
import { withQuery } from "./api";
import { useApi, useDebounced } from "./hooks";
import type { FirmRow, Page } from "./types";
import { Field } from "@/components/ui";

export type PickedFirm = { id: string; display_name: string };

/** Firm combobox backed by `GET /firms?search=` (spec 2.6 / 2.12). Single or multi select. */
export function FirmPicker({ id, label, value, onChange, multi, error, hint }: {
  id: string; label: string; value: PickedFirm[]; onChange: (v: PickedFirm[]) => void; multi?: boolean; error?: string | null; hint?: string;
}) {
  const [text, setText] = useState("");
  const search = useDebounced(text.trim(), 300);
  const results = useApi<Page<FirmRow>>(search.length >= 1 ? withQuery("/firms", { search, limit: 8 }) : null);
  const choose = (f: FirmRow) => {
    const picked = { id: f.id, display_name: f.display_name };
    onChange(multi ? (value.some((v) => v.id === f.id) ? value : [...value, picked]) : [picked]);
    setText("");
  };
  const showInput = multi || value.length === 0;
  return (
    <Field id={id} label={label} error={error} hint={hint}>
      {value.length ? (
        <div className="picked">
          {value.map((f) => (
            <span key={f.id}>{f.display_name}<button type="button" aria-label={`Remove ${f.display_name}`} onClick={() => onChange(value.filter((v) => v.id !== f.id))}><X className="ic" style={{ width: 14, height: 14 }} /></button></span>
          ))}
        </div>
      ) : null}
      {showInput ? (
        <input id={id} className="inp" role="combobox" aria-controls={`${id}-list`} aria-expanded={Boolean(search && results.data)} aria-autocomplete="list" placeholder="Search firm name, slug or id" value={text} maxLength={100} onChange={(e) => setText(e.target.value)} autoComplete="off" />
      ) : null}
      {showInput && search && results.data ? (
        <div className="picker" role="listbox" id={`${id}-list`}>
          {results.data.items.length ? results.data.items.map((f) => (
            <button key={f.id} type="button" role="option" aria-selected={value.some((v) => v.id === f.id)} onClick={() => choose(f)}>
              {f.display_name}{f.sample_mode ? <small>sample</small> : <small>{f.slug}</small>}
            </button>
          )) : <p className="muted" style={{ margin: 0, padding: 10, fontSize: 13 }}>No firm matches “{search}”.</p>}
        </div>
      ) : null}
    </Field>
  );
}
