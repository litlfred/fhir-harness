/**
 * IHE ITI-108 (*Find Access Consent* / *Access Consent* `[ITI-108]`) Consent
 * Registry read client for IHE Privacy Consent on FHIR (PCF) 1.1.0 and HL7
 * FHIR R4 `Consent`.
 *
 * Queries a FHIR R4 Consent Registry (`GET [base]/Consent` with ITI-108 search
 * parameters `patient`, `patient.identifier`, `status=active`, `actor`,
 * `purpose`, `category`, `security-label`, `date`, `action`, `source-reference`,
 * `_profile`), validates the returned searchset `Bundle`, filters out
 * non-`active`, expired (`provision.period.end < now`), and not-yet-valid
 * (`provision.period.start > now`) `Consent` resources (as well as
 * `OperationOutcome` informational entries), and returns a three-valued result:
 *
 * - `status: "determined"` with active, non-expired `Consent` resources when
 *   the registry responds with a valid searchset `Bundle`;
 * - `status: "unknown"` (never silent empty and never permit) with a
 *   diagnostic `reason` when the registry is unreachable, times out, returns a
 *   non-2xx HTTP status, or returns malformed JSON / a non-searchset payload.
 *
 * No IUA claim is required or assumed; optional HTTP headers (such as a
 * standard `Authorization` header) may be supplied by the caller. IHE PCF
 * profiles are referenced by canonical URL only.
 *
 * @module fhir-harness/schemas/iti-108-consent-client
 * @graphNode schema
 * @conformsTo hl7-fhir
 */
import { z } from "zod";

export const ITI_108_TRANSACTION = "ITI-108" as const;
export const FHIR_JSON_MEDIA_TYPE = "application/fhir+json" as const;

export const PCF_CONSENT_PROFILE_URLS = {
  basic: "https://profiles.ihe.net/ITI/PCF/StructureDefinition/IHE.PCF.consentBasic",
  intermediate: "https://profiles.ihe.net/ITI/PCF/StructureDefinition/IHE.PCF.consentIntermediate",
  advanced: "https://profiles.ihe.net/ITI/PCF/StructureDefinition/IHE.PCF.consentAdvanced",
} as const;

export const FhirCodingSchema = z
  .object({
    system: z.string().min(1).optional(),
    version: z.string().min(1).optional(),
    code: z.string().min(1).optional(),
    display: z.string().optional(),
    userSelected: z.boolean().optional(),
  })
  .passthrough();
export type FhirCoding = z.infer<typeof FhirCodingSchema>;

export const FhirCodeableConceptSchema = z
  .object({
    coding: z.array(FhirCodingSchema).optional(),
    text: z.string().optional(),
  })
  .passthrough();
export type FhirCodeableConcept = z.infer<typeof FhirCodeableConceptSchema>;

export const FhirIdentifierSchema = z
  .object({
    use: z.string().optional(),
    type: FhirCodeableConceptSchema.optional(),
    system: z.string().optional(),
    value: z.string().optional(),
  })
  .passthrough();
export type FhirIdentifier = z.infer<typeof FhirIdentifierSchema>;

export const FhirReferenceSchema = z
  .object({
    reference: z.string().min(1).optional(),
    type: z.string().min(1).optional(),
    identifier: FhirIdentifierSchema.optional(),
    display: z.string().optional(),
  })
  .passthrough();
export type FhirReference = z.infer<typeof FhirReferenceSchema>;

export const FhirPeriodSchema = z
  .object({
    start: z.string().min(1).optional(),
    end: z.string().min(1).optional(),
  })
  .passthrough();
export type FhirPeriod = z.infer<typeof FhirPeriodSchema>;

export const FhirConsentActorSchema = z
  .object({
    role: FhirCodeableConceptSchema.optional(),
    reference: FhirReferenceSchema,
  })
  .passthrough();
export type FhirConsentActor = z.infer<typeof FhirConsentActorSchema>;

export const FhirConsentDataMeaningSchema = z.enum(["instance", "related", "dependents", "authoredby"]);
export type FhirConsentDataMeaning = z.infer<typeof FhirConsentDataMeaningSchema>;

export const FhirConsentDataSchema = z
  .object({
    meaning: FhirConsentDataMeaningSchema,
    reference: FhirReferenceSchema,
  })
  .passthrough();
export type FhirConsentData = z.infer<typeof FhirConsentDataSchema>;

export const FhirConsentProvisionTypeSchema = z.enum(["deny", "permit"]);
export type FhirConsentProvisionType = z.infer<typeof FhirConsentProvisionTypeSchema>;

export interface FhirConsentProvision {
  type?: FhirConsentProvisionType;
  period?: FhirPeriod;
  actor?: FhirConsentActor[];
  action?: FhirCodeableConcept[];
  securityLabel?: FhirCoding[];
  purpose?: FhirCoding[];
  class?: FhirCoding[];
  code?: FhirCodeableConcept[];
  dataPeriod?: FhirPeriod;
  data?: FhirConsentData[];
  provision?: FhirConsentProvision[];
  [key: string]: unknown;
}

export const FhirConsentProvisionSchema: z.ZodType<FhirConsentProvision> = z.lazy(() =>
  z
    .object({
      type: FhirConsentProvisionTypeSchema.optional(),
      period: FhirPeriodSchema.optional(),
      actor: z.array(FhirConsentActorSchema).optional(),
      action: z.array(FhirCodeableConceptSchema).optional(),
      securityLabel: z.array(FhirCodingSchema).optional(),
      purpose: z.array(FhirCodingSchema).optional(),
      class: z.array(FhirCodingSchema).optional(),
      code: z.array(FhirCodeableConceptSchema).optional(),
      dataPeriod: FhirPeriodSchema.optional(),
      data: z.array(FhirConsentDataSchema).optional(),
      provision: z.array(FhirConsentProvisionSchema).optional(),
    })
    .passthrough(),
);

export const FhirConsentStatusSchema = z.enum([
  "draft",
  "proposed",
  "active",
  "rejected",
  "inactive",
  "entered-in-error",
]);
export type FhirConsentStatus = z.infer<typeof FhirConsentStatusSchema>;

export const FhirConsentMetaSchema = z
  .object({
    versionId: z.string().min(1).optional(),
    lastUpdated: z.string().min(1).optional(),
    source: z.string().optional(),
    profile: z.array(z.string().min(1)).optional(),
    security: z.array(FhirCodingSchema).optional(),
    tag: z.array(FhirCodingSchema).optional(),
  })
  .passthrough();
export type FhirConsentMeta = z.infer<typeof FhirConsentMetaSchema>;

export const FhirConsentPolicySchema = z
  .object({
    authority: z.string().optional(),
    uri: z.string().optional(),
  })
  .passthrough();
export type FhirConsentPolicy = z.infer<typeof FhirConsentPolicySchema>;

export const FhirConsentSchema = z
  .object({
    resourceType: z.literal("Consent"),
    id: z.string().min(1).optional(),
    meta: FhirConsentMetaSchema.optional(),
    status: FhirConsentStatusSchema,
    scope: FhirCodeableConceptSchema.optional(),
    category: z.array(FhirCodeableConceptSchema).optional(),
    patient: FhirReferenceSchema.optional(),
    dateTime: z.string().optional(),
    performer: z.array(FhirReferenceSchema).optional(),
    organization: z.array(FhirReferenceSchema).optional(),
    sourceAttachment: z.record(z.string(), z.unknown()).optional(),
    sourceReference: FhirReferenceSchema.optional(),
    policy: z.array(FhirConsentPolicySchema).optional(),
    policyRule: FhirCodeableConceptSchema.optional(),
    provision: FhirConsentProvisionSchema.optional(),
  })
  .passthrough();
export type FhirConsent = z.infer<typeof FhirConsentSchema>;

export const FhirBundleLinkSchema = z
  .object({
    relation: z.string().min(1),
    url: z.string().min(1),
  })
  .passthrough();
export type FhirBundleLink = z.infer<typeof FhirBundleLinkSchema>;

export const FhirBundleEntrySchema = z
  .object({
    fullUrl: z.string().optional(),
    resource: z.record(z.string(), z.unknown()).optional(),
    search: z
      .object({
        mode: z.string().optional(),
        score: z.number().optional(),
      })
      .passthrough()
      .optional(),
  })
  .passthrough();
export type FhirBundleEntry = z.infer<typeof FhirBundleEntrySchema>;

export const FhirSearchsetBundleSchema = z
  .object({
    resourceType: z.literal("Bundle"),
    id: z.string().optional(),
    type: z.string().min(1),
    total: z.number().int().nonnegative().optional(),
    link: z.array(FhirBundleLinkSchema).optional(),
    entry: z.array(FhirBundleEntrySchema).optional(),
  })
  .passthrough();
export type FhirSearchsetBundle = z.infer<typeof FhirSearchsetBundleSchema>;

export interface Iti108Query {
  // Base URL of the FHIR R4 Consent Registry (e.g. "https://registry.example.org/fhir").
  baseUrl: string;
  // Patient reference (e.g. "Patient/pat-1" or "pat-1").
  patient?: string;
  // Patient business identifier token (e.g. "urn:oid:1.2.3|12345"), sent as `patient.identifier`.
  patientIdentifier?: string;
  // Status parameter sent on the query (defaults to "active").
  status?: string | readonly string[];
  // Actor reference(s) (e.g. "Practitioner/prac-1" or "Organization/org-1").
  actor?: string | readonly string[];
  // PurposeOfUse token(s) (e.g. "TREAT", "HRESCH").
  purpose?: string | readonly string[];
  // Category token(s) (e.g. "http://loinc.org|59284-0").
  category?: string | readonly string[];
  // Security label token(s), sent as `security-label`.
  securityLabel?: string | readonly string[];
  // Date filter(s), e.g. "ge2026-01-01".
  date?: string | readonly string[];
  // Action token(s).
  action?: string | readonly string[];
  // Source reference filter, sent as `source-reference`.
  sourceReference?: string;
  // Profile canonical URL filter, sent as `_profile`.
  profile?: string;
  // Reference evaluation time for checking `provision.period` (defaults to current time).
  now?: string | Date;
  // HTTP request timeout in milliseconds (defaults to 10_000).
  timeoutMs?: number;
  // Optional HTTP headers (e.g. Authorization).
  headers?: Readonly<Record<string, string>>;
  // Injectable fetch implementation for testing or custom transport.
  fetchImpl?: typeof fetch;
  // Follow `Bundle.link` with `relation === "next"` (defaults to true).
  followNext?: boolean;
  // Maximum number of pages to fetch when following `next` links (defaults to 10).
  maxPages?: number;
}

export type Iti108IgnoredReason =
  | "not-active"
  | "expired"
  | "not-yet-valid"
  | "invalid-period"
  | "patient-mismatch"
  | "operation-outcome"
  | "invalid-resource";

export interface Iti108IgnoredEntry {
  id?: string;
  resourceType?: string;
  reason: Iti108IgnoredReason;
  detail: string;
}

export interface Iti108DeterminedResult {
  status: "determined";
  consents: FhirConsent[];
  ignored: Iti108IgnoredEntry[];
  requestUrl: string;
  evaluatedAt: string;
  bundleTotal?: number;
}

export type Iti108UnknownReason =
  | "unreachable"
  | "timeout"
  | "http-error"
  | "invalid-json"
  | "invalid-bundle"
  | "invalid-query";

export interface Iti108UnknownResult {
  status: "unknown";
  reason: Iti108UnknownReason;
  detail: string;
  requestUrl?: string;
  httpStatus?: number;
}

export type Iti108Result = Iti108DeterminedResult | Iti108UnknownResult;

function appendParam(params: URLSearchParams, key: string, value: string | readonly string[] | undefined): void {
  if (value === undefined) return;
  if (typeof value === "string") {
    if (value.trim().length > 0) params.append(key, value.trim());
    return;
  }
  for (const item of value) {
    if (item.trim().length > 0) params.append(key, item.trim());
  }
}

/**
 * Construct the IHE ITI-108 `GET [base]/Consent?...` search URL from query parameters.
 * Defaults `status` to `"active"` when omitted.
 */
export function buildIti108SearchUrl(query: Iti108Query): URL {
  const trimmedBase = query.baseUrl.trim().replace(/\/+$/, "");
  if (!trimmedBase) {
    throw new Error("baseUrl must be a non-empty URL");
  }
  const url = new URL(`${trimmedBase}/Consent`);
  const params = url.searchParams;

  appendParam(params, "patient", query.patient);
  appendParam(params, "patient.identifier", query.patientIdentifier);
  appendParam(params, "status", query.status ?? "active");
  appendParam(params, "actor", query.actor);
  appendParam(params, "purpose", query.purpose);
  appendParam(params, "category", query.category);
  appendParam(params, "security-label", query.securityLabel);
  appendParam(params, "date", query.date);
  appendParam(params, "action", query.action);
  appendParam(params, "source-reference", query.sourceReference);
  appendParam(params, "_profile", query.profile);

  return url;
}

/**
 * Parse a FHIR date / dateTime boundary into epoch milliseconds.
 *
 * For `bound === "end"`, date-only values (`YYYY`, `YYYY-MM`, `YYYY-MM-DD`)
 * resolve to the end of that calendar unit in UTC; for `bound === "start"`,
 * they resolve to the start of that unit in UTC. Full ISO-8601 dateTime strings
 * are parsed via `Date.parse`.
 */
export function parseFhirPeriodBound(raw: string, bound: "start" | "end"): number {
  const s = raw.trim();
  if (/^\d{4}$/.test(s)) {
    const year = Number(s);
    return bound === "start"
      ? Date.UTC(year, 0, 1, 0, 0, 0, 0)
      : Date.UTC(year, 11, 31, 23, 59, 59, 999);
  }
  if (/^\d{4}-\d{2}$/.test(s)) {
    const [y, m] = s.split("-").map(Number);
    if (m! < 1 || m! > 12) return Number.NaN;
    return bound === "start"
      ? Date.UTC(y!, m! - 1, 1, 0, 0, 0, 0)
      : Date.UTC(y!, m!, 0, 23, 59, 59, 999);
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const [y, m, d] = s.split("-").map(Number);
    const probe = new Date(Date.UTC(y!, m! - 1, d!));
    if (
      probe.getUTCFullYear() !== y ||
      probe.getUTCMonth() !== m! - 1 ||
      probe.getUTCDate() !== d
    ) {
      return Number.NaN;
    }
    return bound === "start"
      ? Date.UTC(y!, m! - 1, d!, 0, 0, 0, 0)
      : Date.UTC(y!, m! - 1, d!, 23, 59, 59, 999);
  }
  return Date.parse(s);
}

function resolveNowMs(now?: string | Date): number {
  if (now === undefined) return Date.now();
  if (now instanceof Date) return now.getTime();
  return Date.parse(now);
}

/**
 * Normalize a FHIR Patient reference (`"Patient/pat-1"`, `"https://.../Patient/pat-1"`,
 * or `"pat-1"`) to its bare logical id for client-side patient matching.
 */
export function normalizePatientId(ref: string): string {
  const trimmed = ref.trim();
  const match = /(?:^|\/)Patient\/([^/?#]+)$/.exec(trimmed);
  if (match) return match[1]!;
  return trimmed;
}

/**
 * Check whether a FHIR `Consent` is expired at `now` (`provision.period.end < now`).
 */
export function isConsentExpired(consent: FhirConsent, now?: string | Date): boolean {
  const end = consent.provision?.period?.end;
  if (!end) return false;
  const nowMs = resolveNowMs(now);
  const endMs = parseFhirPeriodBound(end, "end");
  if (Number.isNaN(endMs) || Number.isNaN(nowMs)) return true;
  return endMs < nowMs;
}

/**
 * Evaluate whether a FHIR R4 `Consent` resource is active, currently within
 * its `provision.period` (neither expired nor future-dated), and matches the
 * expected patient (when specified).
 */
export function evaluateConsentValidity(
  consent: FhirConsent,
  now?: string | Date,
  expectedPatient?: string,
): { valid: true } | { valid: false; reason: Iti108IgnoredReason; detail: string } {
  if (consent.status !== "active") {
    return {
      valid: false,
      reason: "not-active",
      detail: `Consent${consent.id ? ` ${consent.id}` : ""} has status "${consent.status}" (expected "active")`,
    };
  }

  if (expectedPatient !== undefined && expectedPatient.trim().length > 0) {
    const actualRef = consent.patient?.reference;
    if (!actualRef || normalizePatientId(actualRef) !== normalizePatientId(expectedPatient)) {
      return {
        valid: false,
        reason: "patient-mismatch",
        detail: `Consent${consent.id ? ` ${consent.id}` : ""} patient "${actualRef ?? "(missing)"}" does not match requested patient "${expectedPatient}"`,
      };
    }
  }

  const nowMs = resolveNowMs(now);
  if (Number.isNaN(nowMs)) {
    return {
      valid: false,
      reason: "invalid-period",
      detail: "Evaluation timestamp `now` is not a valid date",
    };
  }

  const period = consent.provision?.period;
  if (period) {
    let startMs: number | undefined;
    let endMs: number | undefined;
    if (period.start !== undefined) {
      startMs = parseFhirPeriodBound(period.start, "start");
      if (Number.isNaN(startMs)) {
        return {
          valid: false,
          reason: "invalid-period",
          detail: `Consent${consent.id ? ` ${consent.id}` : ""} has invalid provision.period.start "${period.start}"`,
        };
      }
    }
    if (period.end !== undefined) {
      endMs = parseFhirPeriodBound(period.end, "end");
      if (Number.isNaN(endMs)) {
        return {
          valid: false,
          reason: "invalid-period",
          detail: `Consent${consent.id ? ` ${consent.id}` : ""} has invalid provision.period.end "${period.end}"`,
        };
      }
    }
    if (startMs !== undefined && endMs !== undefined && startMs > endMs) {
      return {
        valid: false,
        reason: "invalid-period",
        detail: `Consent${consent.id ? ` ${consent.id}` : ""} has provision.period.start "${period.start}" after provision.period.end "${period.end}"`,
      };
    }
    if (endMs !== undefined && endMs < nowMs) {
      return {
        valid: false,
        reason: "expired",
        detail: `Consent${consent.id ? ` ${consent.id}` : ""} expired at "${period.end}" (evaluated at ${new Date(nowMs).toISOString()})`,
      };
    }
    if (startMs !== undefined && startMs > nowMs) {
      return {
        valid: false,
        reason: "not-yet-valid",
        detail: `Consent${consent.id ? ` ${consent.id}` : ""} is not valid until "${period.start}" (evaluated at ${new Date(nowMs).toISOString()})`,
      };
    }
  }

  return { valid: true };
}

/**
 * Validate and filter a single FHIR R4 `Bundle` (`type: "searchset"`) returned
 * by an ITI-108 Consent Registry query.
 */
export function filterIti108Bundle(
  bundlePayload: unknown,
  options: { now?: string | Date; patient?: string; requestUrl?: string } = {},
): Iti108Result {
  const requestUrl = options.requestUrl ?? "";
  const nowMs = resolveNowMs(options.now);
  if (Number.isNaN(nowMs)) {
    return {
      status: "unknown",
      reason: "invalid-query",
      detail: "Evaluation timestamp `now` is not a valid date",
      ...(requestUrl ? { requestUrl } : {}),
    };
  }
  const evaluatedAt = new Date(nowMs).toISOString();

  const parsedBundle = FhirSearchsetBundleSchema.safeParse(bundlePayload);
  if (!parsedBundle.success) {
    const rt =
      bundlePayload !== null && typeof bundlePayload === "object" && "resourceType" in bundlePayload
        ? String((bundlePayload as Record<string, unknown>).resourceType)
        : undefined;
    return {
      status: "unknown",
      reason: "invalid-bundle",
      detail: rt
        ? `Expected FHIR Bundle resource, received resourceType "${rt}"`
        : `Response is not a valid FHIR Bundle: ${parsedBundle.error.issues.map((i) => i.message).join("; ")}`,
      ...(requestUrl ? { requestUrl } : {}),
    };
  }

  const bundle = parsedBundle.data;
  if (bundle.type !== "searchset") {
    return {
      status: "unknown",
      reason: "invalid-bundle",
      detail: `Expected Bundle.type "searchset", received "${bundle.type}"`,
      ...(requestUrl ? { requestUrl } : {}),
    };
  }

  const consents: FhirConsent[] = [];
  const ignored: Iti108IgnoredEntry[] = [];

  for (const entry of bundle.entry ?? []) {
    const resource = entry.resource;
    if (!resource || typeof resource !== "object") {
      ignored.push({
        reason: "invalid-resource",
        detail: "Bundle entry contains no resource object",
      });
      continue;
    }

    const resourceType = typeof resource.resourceType === "string" ? resource.resourceType : undefined;
    const resourceId = typeof resource.id === "string" ? resource.id : undefined;

    if (resourceType === "OperationOutcome") {
      const issues = Array.isArray(resource.issue) ? (resource.issue as Array<Record<string, unknown>>) : [];
      const hasError = issues.some((iss) => iss && (iss.severity === "error" || iss.severity === "fatal"));
      if (hasError) {
        return {
          status: "unknown",
          reason: "invalid-bundle",
          detail: `Searchset Bundle contains error/fatal OperationOutcome${resourceId ? ` (${resourceId})` : ""}`,
          ...(requestUrl ? { requestUrl } : {}),
        };
      }
      ignored.push({
        ...(resourceId ? { id: resourceId } : {}),
        resourceType: "OperationOutcome",
        reason: "operation-outcome",
        detail: "Informational OperationOutcome in searchset Bundle",
      });
      continue;
    }

    if (resourceType !== "Consent") {
      ignored.push({
        ...(resourceId ? { id: resourceId } : {}),
        ...(resourceType ? { resourceType } : {}),
        reason: "invalid-resource",
        detail: `Unexpected resourceType "${resourceType ?? "(missing)"}" in Consent searchset Bundle`,
      });
      continue;
    }

    const parsedConsent = FhirConsentSchema.safeParse(resource);
    if (!parsedConsent.success) {
      ignored.push({
        ...(resourceId ? { id: resourceId } : {}),
        resourceType: "Consent",
        reason: "invalid-resource",
        detail: `Invalid FHIR R4 Consent${resourceId ? ` ${resourceId}` : ""}: ${parsedConsent.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}`,
      });
      continue;
    }

    const validity = evaluateConsentValidity(parsedConsent.data, new Date(nowMs), options.patient);
    if (!validity.valid) {
      ignored.push({
        ...(parsedConsent.data.id ? { id: parsedConsent.data.id } : {}),
        resourceType: "Consent",
        reason: validity.reason,
        detail: validity.detail,
      });
      continue;
    }

    consents.push(parsedConsent.data);
  }

  return {
    status: "determined",
    consents,
    ignored,
    requestUrl,
    evaluatedAt,
    ...(bundle.total !== undefined ? { bundleTotal: bundle.total } : {}),
  };
}

function classifyFetchError(err: unknown, timeoutFired: boolean): { reason: "timeout" | "unreachable"; detail: string } {
  const msg = err instanceof Error ? err.message : String(err);
  const name = err instanceof Error ? err.name : "";
  if (timeoutFired || name === "TimeoutError" || name === "AbortError" || /timed?\s*out|abort/i.test(msg)) {
    return { reason: "timeout", detail: `Consent Registry request timed out: ${msg}` };
  }
  return { reason: "unreachable", detail: `Consent Registry unreachable: ${msg}` };
}

/**
 * Execute an IHE ITI-108 (*Find Access Consent*) query against a FHIR R4
 * Consent Registry (`GET [base]/Consent?...`).
 *
 * Returns:
 * - `{ status: "determined", consents, ignored, ... }` when the server responds
 *   with a valid `searchset` `Bundle` (even when `consents` is empty);
 * - `{ status: "unknown", reason, detail, ... }` when the server is
 *   unreachable, times out, returns a non-2xx HTTP status, or returns a
 *   malformed payload.
 */
export async function findAccessConsents(query: Iti108Query): Promise<Iti108Result> {
  let initialUrl: URL;
  try {
    initialUrl = buildIti108SearchUrl(query);
  } catch (err) {
    return {
      status: "unknown",
      reason: "invalid-query",
      detail: err instanceof Error ? err.message : String(err),
    };
  }

  const nowMs = resolveNowMs(query.now);
  if (Number.isNaN(nowMs)) {
    return {
      status: "unknown",
      reason: "invalid-query",
      detail: "Evaluation timestamp `now` is not a valid date",
      requestUrl: initialUrl.toString(),
    };
  }

  const fetchFn = query.fetchImpl ?? fetch;
  const timeoutMs = query.timeoutMs ?? 10_000;
  const followNext = query.followNext ?? true;
  const maxPages = Math.max(1, query.maxPages ?? 10);

  const allConsents: FhirConsent[] = [];
  const allIgnored: Iti108IgnoredEntry[] = [];
  const seenConsentIds = new Set<string>();
  let bundleTotal: number | undefined;
  let currentUrl: string | undefined = initialUrl.toString();
  let pageCount = 0;

  while (currentUrl !== undefined && pageCount < maxPages) {
    pageCount += 1;
    const controller = new AbortController();
    let timeoutFired = false;
    const timer = setTimeout(() => {
      timeoutFired = true;
      controller.abort();
    }, timeoutMs);

    let response: Response;
    try {
      response = await fetchFn(currentUrl, {
        method: "GET",
        headers: {
          Accept: FHIR_JSON_MEDIA_TYPE,
          ...(query.headers ?? {}),
        },
        signal: controller.signal,
      });
    } catch (err) {
      clearTimeout(timer);
      const classified = classifyFetchError(err, timeoutFired);
      return {
        status: "unknown",
        reason: classified.reason,
        detail: classified.detail,
        requestUrl: currentUrl,
      };
    }

    if (!response.ok) {
      clearTimeout(timer);
      return {
        status: "unknown",
        reason: "http-error",
        httpStatus: response.status,
        detail: `Consent Registry returned HTTP ${response.status} ${response.statusText}`.trim(),
        requestUrl: currentUrl,
      };
    }

    let rawText: string;
    try {
      rawText = await response.text();
    } catch (err) {
      clearTimeout(timer);
      const classified = classifyFetchError(err, timeoutFired);
      return {
        status: "unknown",
        reason: classified.reason,
        detail: classified.detail,
        requestUrl: currentUrl,
      };
    } finally {
      clearTimeout(timer);
    }

    let payload: unknown;
    try {
      payload = JSON.parse(rawText);
    } catch (err) {
      return {
        status: "unknown",
        reason: "invalid-json",
        detail: `Consent Registry response is not valid JSON: ${err instanceof Error ? err.message : String(err)}`,
        requestUrl: currentUrl,
      };
    }

    const pageResult = filterIti108Bundle(payload, {
      now: new Date(nowMs),
      patient: query.patient,
      requestUrl: currentUrl,
    });
    if (pageResult.status === "unknown") {
      return pageResult;
    }

    if (pageCount === 1 && pageResult.bundleTotal !== undefined) {
      bundleTotal = pageResult.bundleTotal;
    }

    for (const c of pageResult.consents) {
      const dedupeKey = c.id ? `${c.id}#${c.meta?.versionId ?? ""}` : undefined;
      if (dedupeKey !== undefined) {
        if (seenConsentIds.has(dedupeKey)) continue;
        seenConsentIds.add(dedupeKey);
      }
      allConsents.push(c);
    }
    allIgnored.push(...pageResult.ignored);

    if (!followNext) break;
    const parsedBundle = FhirSearchsetBundleSchema.parse(payload);
    const nextLink = parsedBundle.link?.find((l) => l.relation === "next")?.url;
    currentUrl = nextLink ? new URL(nextLink, currentUrl).toString() : undefined;
  }

  return {
    status: "determined",
    consents: allConsents,
    ignored: allIgnored,
    requestUrl: initialUrl.toString(),
    evaluatedAt: new Date(nowMs).toISOString(),
    ...(bundleTotal !== undefined ? { bundleTotal } : {}),
  };
}

/**
 * Reusable IHE ITI-108 Consent Registry read client bound to a base URL and
 * default request options.
 */
export class Iti108ConsentClient {
  readonly baseUrl: string;
  private readonly defaults: Omit<Iti108Query, "baseUrl">;

  constructor(baseUrl: string, defaults: Omit<Iti108Query, "baseUrl"> = {}) {
    this.baseUrl = baseUrl;
    this.defaults = defaults;
  }

  async findAccessConsents(query: Omit<Iti108Query, "baseUrl"> = {}): Promise<Iti108Result> {
    return findAccessConsents({
      ...this.defaults,
      ...query,
      baseUrl: this.baseUrl,
      headers: {
        ...(this.defaults.headers ?? {}),
        ...(query.headers ?? {}),
      },
    });
  }
}
