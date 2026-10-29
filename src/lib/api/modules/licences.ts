import { z } from "zod";
import { ALL_ROLES, OPERATORS, defineEndpoint, must, rpc } from "../core";
import { CICC_CHUNK, CsvError, readCiccCsv, sha256Hex } from "../cicc-csv";
import { ApiError } from "../errors";
import { isoTime, limit, offset, optionalCode, uuid } from "../schemas";

export const LICENCE_QUEUE_KINDS = ["due", "overdue", "never_checked", "adverse", "needs_review", "all"] as const;

type CredentialDetail = { credential: { id: string; organization_id: string } } & Record<string, unknown>;

const registerHttps = z
  .string()
  .trim()
  .url("Paste the register page link")
  .refine((v) => {
    try {
      const u = new URL(v);
      return u.protocol === "https:" && u.hostname === "register.college-ic.ca";
    } catch {
      return false;
    }
  }, "Licence evidence must cite https://register.college-ic.ca");

export const licenceCheckInput = z
  .object({
    id: uuid,
    sourceUrl: registerHttps,
    retrievedAt: isoTime,
    registerStatus: z.enum(["active", "inactive"]),
    entitledToPractise: z.boolean(),
    disciplineSuspended: z.boolean(),
    disciplineRevoked: z.boolean(),
    disciplineRestricted: z.boolean(),
    restrictionDetail: z.string().trim().max(1000, "The restriction detail is at most 1000 characters").optional().nullable(),
    proofLocator: z.string().trim().min(1, "Say where the screenshot or PDF of the register page is kept").max(500),
    notes: z.string().trim().max(1000).optional().nullable(),
    code: optionalCode,
  })
  .superRefine((v, ctx) => {
    if (Date.parse(v.retrievedAt) > Date.now() + 60_000) ctx.addIssue({ code: "custom", path: ["retrievedAt"], message: "The retrieval time is in the future" });
    if (v.disciplineRestricted && !v.restrictionDetail) ctx.addIssue({ code: "custom", path: ["restrictionDetail"], message: "A restriction needs the register detail" });
    if (!v.disciplineRestricted && v.restrictionDetail) ctx.addIssue({ code: "custom", path: ["restrictionDetail"], message: "Restriction detail needs the restriction flag" });
  });

export const ciccImportInput = z.object({
  sourceNote: z.string().trim().min(1, "Describe where the list came from (1 to 500 characters)").max(500),
  fileName: z.string().trim().min(1).max(200),
  fileLocator: z.string().trim().max(500).optional().nullable(),
  csv: z.string().min(1, "The file is empty").max(8_000_000, "The file is larger than 8 MB"),
  dryRun: z.boolean().default(true),
});

export const licenceEndpoints = [
  defineEndpoint({
    method: "GET",
    path: "/licences/queue",
    summary: "Credentials by bucket: adverse, needs_review, never_checked, overdue, due (within 7 days), ok.",
    roles: ALL_ROLES,
    input: z.object({ kind: z.enum(LICENCE_QUEUE_KINDS).default("due"), limit: limit(200, 50), offset }),
    handler: ({ db, input }) => rpc(db, "platform_licence_queue", { p_kind: input.kind, p_limit: input.limit, p_offset: input.offset }),
  }),
  defineEndpoint({
    method: "GET",
    path: "/licences/credentials/:id",
    summary: "One credential with its check history (metadata only).",
    roles: ALL_ROLES,
    input: z.object({ id: uuid }),
    handler: async ({ db, input }) => must(await rpc<CredentialDetail | null>(db, "platform_credential_detail", { p_credential_id: input.id }), "Credential"),
  }),
  defineEndpoint({
    method: "POST",
    path: "/licences/credentials/:id/checks",
    summary: "Record a manual check against the public CICC register. Your own session with a fresh step-up.",
    roles: OPERATORS,
    input: licenceCheckInput,
    session: "step_up",
    audit: { action: "licences.check_recorded", table: "public.consultant_credentials" },
    async handler({ db, input, audit, userClient }) {
      const detail = must(await rpc<CredentialDetail | null>(db, "platform_credential_detail", { p_credential_id: input.id }), "Credential");
      audit.organizationId = detail.credential.organization_id;
      const client = await userClient();
      const checkId = await rpc<string>(client, "record_licence_check", {
        p_credential_id: input.id,
        p_source_url: input.sourceUrl,
        p_retrieved_at: input.retrievedAt,
        p_register_status: input.registerStatus,
        p_entitlement_to_practise: input.entitledToPractise,
        p_discipline_suspended: input.disciplineSuspended,
        p_discipline_revoked: input.disciplineRevoked,
        p_discipline_restricted: input.disciplineRestricted,
        p_discipline_restriction_detail: input.restrictionDetail || null,
        p_proof_locator: input.proofLocator,
        p_notes: input.notes || null,
      });
      audit.context = { check_id: checkId };
      return { checkId, credential: await rpc(db, "platform_credential_detail", { p_credential_id: input.id }) };
    },
  }),
  defineEndpoint({
    method: "POST",
    path: "/licences/credentials/:id/cicc-check",
    summary: "Re-check one credential against the latest imported CICC list.",
    roles: OPERATORS,
    input: z.object({ id: uuid }),
    audit: { action: "licences.cicc_check", table: "public.consultant_credentials" },
    async handler({ db, input, audit }) {
      const detail = must(await rpc<CredentialDetail | null>(db, "platform_credential_detail", { p_credential_id: input.id }), "Credential");
      audit.organizationId = detail.credential.organization_id;
      const checkId = await rpc<string>(db, "check_licence_against_cicc_list", { p_credential_id: input.id });
      audit.context = { check_id: checkId };
      return { checkId, credential: await rpc(db, "platform_credential_detail", { p_credential_id: input.id }) };
    },
  }),
  defineEndpoint({
    method: "GET",
    path: "/licences/cicc-imports",
    summary: "Recent CICC list imports and the credentials that need review after them.",
    roles: ALL_ROLES,
    input: z.object({ limit: limit(100, 20) }),
    handler: ({ db, input }) => rpc(db, "platform_cicc_imports", { p_limit: input.limit }),
  }),
  defineEndpoint({
    method: "POST",
    path: "/licences/cicc-imports",
    summary: "Upload the College's CSV. dryRun (default true) returns counts only; dryRun false imports and re-checks every credential.",
    roles: OPERATORS,
    input: ciccImportInput,
    audit: { action: "licences.cicc_import", table: "public.cicc_register_imports" },
    async handler({ db, input, audit, admin }) {
      let parsed: ReturnType<typeof readCiccCsv>;
      try {
        parsed = readCiccCsv(input.csv);
      } catch (error) {
        if (error instanceof CsvError) throw new ApiError("validation_failed", error.message, { issues: [{ path: "csv", message: error.message }] });
        throw error;
      }
      const sha256 = await sha256Hex(input.csv);
      audit.context = { dry_run: input.dryRun, rows: parsed.summary.rows, sha256 };
      if (input.dryRun) return { dryRun: true, sha256, summary: parsed.summary, importId: null, result: null };
      if (!parsed.rows.length) throw new ApiError("validation_failed", "The file has no rows with a licence number");
      const importId = await rpc<string>(db, "start_cicc_register_import", {
        p_source_note: `${input.sourceNote} (${input.fileName})`.slice(0, 500),
        p_file_locator: input.fileLocator || null,
        p_file_sha256: sha256,
        p_imported_by: admin.userId,
      });
      audit.objectId = importId;
      for (let i = 0; i < parsed.rows.length; i += CICC_CHUNK) {
        try {
          await rpc(db, "import_cicc_register", { p_import_id: importId, p_rows: parsed.rows.slice(i, i + CICC_CHUNK) });
        } catch (error) {
          if (error instanceof ApiError) {
            throw new ApiError(error.code, `Rows ${i + 1}-${Math.min(i + CICC_CHUNK, parsed.rows.length)} failed: ${error.message}. Import ${importId} stays open and unused.`, { importId });
          }
          throw error;
        }
      }
      const result = await rpc(db, "finish_cicc_register_import", { p_import_id: importId });
      return { dryRun: false, sha256, summary: parsed.summary, importId, result };
    },
  }),
];
