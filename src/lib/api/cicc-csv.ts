/**
 * The College (CICC) register list as a CSV, mapped to the rows public.import_cicc_register takes.
 * Same rules as casevoya/scripts/ops/import-cicc-list.mjs (keep the two in step).
 */
export const CICC_COLUMNS: Record<string, string[]> = {
  licence_number: ["Licence Number", "License Number", "Licence #", "Registration Number", "College ID", "Member ID"],
  full_name: ["Name", "Full Name", "Licensee Name"],
  first_name: ["First Name", "Given Name", "Given Names"],
  last_name: ["Last Name", "Surname", "Family Name"],
  status: ["Status", "Licence Status", "License Status"],
  entitlement: ["Entitlement to Practise", "Entitlement to Practice", "Entitled to Practise"],
  licence_class: ["Class", "Licence Class", "License Class", "Licence Type", "Category"],
};

export const CICC_STATUS_MAP: Record<string, string> = { active: "Active", inactive: "Inactive", suspended: "Suspended", revoked: "Revoked" };
export const CICC_CHUNK = 1000;
export const CICC_MAX_ROWS = 20000;

export class CsvError extends Error {}

export function parseCsv(text: string, delimiter = ","): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let value = "";
  let quoted = false;
  const input = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  for (let i = 0; i < input.length; i += 1) {
    const ch = input[i];
    if (quoted) {
      if (ch === '"' && input[i + 1] === '"') {
        value += '"';
        i += 1;
      } else if (ch === '"') quoted = false;
      else value += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === delimiter) {
      row.push(value);
      value = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && input[i + 1] === "\n") i += 1;
      row.push(value);
      rows.push(row);
      row = [];
      value = "";
    } else value += ch;
  }
  if (quoted) throw new CsvError("The CSV ends inside a quoted value.");
  if (value !== "" || row.length) {
    row.push(value);
    rows.push(row);
  }
  return rows.filter((cells) => cells.some((cell) => cell.trim() !== ""));
}

export type HeaderMap = { index: Record<string, number>; extra: [string, number][] };

export function mapHeaders(headers: string[], columns = CICC_COLUMNS): HeaderMap {
  const lower = headers.map((h) => h.trim().toLowerCase());
  const index: Record<string, number> = {};
  for (const [field, names] of Object.entries(columns)) {
    const at = names.map((name) => lower.indexOf(name.toLowerCase())).find((i) => i >= 0);
    if (at !== undefined) index[field] = at;
  }
  const list = headers.join(" | ");
  if (index.licence_number === undefined) throw new CsvError(`No licence number column. Headers: ${list}`);
  if (index.status === undefined) throw new CsvError(`No status column. Headers: ${list}`);
  if (index.full_name === undefined && (index.first_name === undefined || index.last_name === undefined)) {
    throw new CsvError(`No name column (Name, or First Name and Last Name). Headers: ${list}`);
  }
  const used = new Set(Object.values(index));
  const extra = headers.map((h, i) => [h.trim(), i] as [string, number]).filter(([h, i]) => h && !used.has(i));
  return { index, extra };
}

export type CiccRow = {
  licence_number: string;
  full_name: string;
  first_name: string | null;
  last_name: string | null;
  status: string;
  entitlement: string | null;
  licence_class: string | null;
  fields: Record<string, string>;
};

export function toRow(cells: string[], { index, extra }: HeaderMap, statusMap = CICC_STATUS_MAP): CiccRow | null {
  const cell = (field: string) => (index[field] === undefined ? "" : (cells[index[field]] ?? "").trim());
  const number = cell("licence_number");
  if (!number) return null;
  const raw = cell("status");
  const fields: Record<string, string> = {};
  for (const [header, i] of extra) fields[header] = (cells[i] ?? "").trim();
  return {
    licence_number: number,
    full_name: cell("full_name") || [cell("first_name"), cell("last_name")].filter(Boolean).join(" "),
    first_name: cell("first_name") || null,
    last_name: cell("last_name") || null,
    status: statusMap[raw.toLowerCase()] ?? raw,
    entitlement: cell("entitlement") || null,
    licence_class: cell("licence_class") || null,
    fields,
  };
}

export type CiccSummary = {
  mapped: Record<string, string>;
  keptAsFields: string[];
  rows: number;
  skippedWithoutNumber: number;
  statuses: Record<string, number>;
  unrecognisedStatuses: string[];
};

/** Parses the whole file. Returns counts only (never names or numbers) plus the rows to send. */
export function readCiccCsv(text: string): { rows: CiccRow[]; summary: CiccSummary } {
  const [headers, ...body] = parseCsv(text);
  if (!headers) throw new CsvError("The CSV is empty.");
  const mapping = mapHeaders(headers);
  const rows: CiccRow[] = [];
  let skipped = 0;
  const statuses: Record<string, number> = {};
  for (const cells of body) {
    const row = toRow(cells, mapping);
    if (!row) {
      skipped += 1;
      continue;
    }
    statuses[row.status] = (statuses[row.status] ?? 0) + 1;
    rows.push(row);
  }
  if (rows.length > CICC_MAX_ROWS) throw new CsvError(`The file has ${rows.length} rows; the portal takes at most ${CICC_MAX_ROWS}.`);
  const known = new Set(Object.values(CICC_STATUS_MAP));
  return {
    rows,
    summary: {
      mapped: Object.fromEntries(Object.entries(mapping.index).map(([field, i]) => [field, headers[i].trim()])),
      keptAsFields: mapping.extra.map(([h]) => h),
      rows: rows.length,
      skippedWithoutNumber: skipped,
      statuses,
      unrecognisedStatuses: Object.keys(statuses).filter((s) => !known.has(s)),
    },
  };
}

export async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
