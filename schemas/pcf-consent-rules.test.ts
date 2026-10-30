/**
 * Owner consent rules of 2026-10-30 19:27Z, as far as the PCF evaluator and the
 * ITI-108 client carry them: rule 2 (a Consent counts only for the agreement
 * version its `policy.uri` names) and rule 4 (registry results may be cached,
 * and an entry ends when its Consent is withdrawn).
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { Iti108ConsentClient } from "./iti-108-consent-client.ts";
import {
  HL7_ACT_REASON_SYSTEM,
  PCF_CONSENT_BASIC_PROFILE,
  consentsCitingAgreement,
  createPcfConsentEvaluator,
  type FhirConsent,
} from "./pcf-consent.ts";

const V1 = "https://example.org/dsa/research-registry/1.0.0";
const V2 = "https://example.org/dsa/research-registry/2.0.0";

function consent(id: string, policyUri: string | undefined, end = "2026-12-31"): FhirConsent {
  return {
    resourceType: "Consent",
    id,
    meta: { versionId: "1", profile: [PCF_CONSENT_BASIC_PROFILE] },
    status: "active",
    scope: { coding: [{ system: "http://terminology.hl7.org/CodeSystem/consentscope", code: "patient-privacy" }] },
    category: [{ coding: [{ system: "http://loinc.org", code: "59284-0" }] }],
    patient: { reference: "Patient/p1" },
    ...(policyUri ? { policy: [{ uri: policyUri }] } : {}),
    provision: {
      type: "permit",
      period: { start: "2026-01-01", end },
      purpose: [{ system: HL7_ACT_REASON_SYSTEM, code: "TREAT" }],
    },
  } as FhirConsent;
}

const req = {
  actor: "Practitioner/x",
  action: "odrl:use",
  scope: { "odrl:purpose": "TREAT", "odrl:dateTime": "2026-06-15T12:00:00Z" },
} as never;

describe("rule 2: a Consent counts only for the agreement version it cites", () => {
  test("consentsCitingAgreement keeps only Consents whose policy.uri is that version", () => {
    const kept = consentsCitingAgreement([consent("a", V1), consent("b", V2), consent("c", undefined)], V1);
    expect(kept.map((c) => (c as FhirConsent).id)).toEqual(["a"]);
  });

  test("a Consent for version 1 permits under version 1 and is not counted under version 2", () => {
    const evaluate = createPcfConsentEvaluator([consent("a", V1)]);
    expect(evaluate(req, undefined, undefined, { uid: V1 } as never)).toMatchObject({ verdict: "permit" });
    expect(evaluate(req, undefined, undefined, { uid: V2 } as never)).toEqual({ verdict: "unknown" });
  });

  test("agreementPolicyUri overrides the agreement's uid; with neither, Consents are not filtered", () => {
    expect(createPcfConsentEvaluator([consent("a", V1)], { agreementPolicyUri: V2 })(req)).toEqual({ verdict: "unknown" });
    expect(createPcfConsentEvaluator([consent("c", undefined)])(req)).toMatchObject({ verdict: "permit" });
  });
});

describe("rule 4: cached registry results end when a Consent is withdrawn", () => {
  let server: ReturnType<typeof Bun.serve>;
  let baseUrl: string;
  let hits = 0;
  let status = "active";

  beforeAll(() => {
    server = Bun.serve({
      port: 0,
      fetch() {
        hits++;
        const c = { ...consent("c1", V1), status };
        const entry = status === "active" ? [{ fullUrl: `${baseUrl}/Consent/c1`, resource: c, search: { mode: "match" } }] : [];
        return new Response(JSON.stringify({ resourceType: "Bundle", type: "searchset", total: entry.length, entry }), {
          headers: { "content-type": "application/fhir+json" },
        });
      },
    });
    baseUrl = `http://localhost:${server.port}`;
  });
  afterAll(() => server.stop(true));

  test("a second lookup is served from cache until the Consent is withdrawn", async () => {
    let now = Date.parse("2026-06-15T12:00:00Z");
    const client = new Iti108ConsentClient(baseUrl, { now: "2026-06-15T12:00:00Z" }, { ttlMs: 60_000, clock: () => now });
    const first = await client.findAccessConsents({ patient: "Patient/p1" });
    expect(first.status).toBe("determined");
    await client.findAccessConsents({ patient: "Patient/p1" });
    expect(hits).toBe(1);

    status = "inactive";
    expect(client.consentWithdrawn("Consent/c1/_history/1")).toBe(1);
    const after = await client.findAccessConsents({ patient: "Patient/p1" });
    expect(hits).toBe(2);
    if (after.status !== "determined") throw new Error("expected determined");
    expect(after.consents).toEqual([]);

    now += 61_000;
    await client.findAccessConsents({ patient: "Patient/p1" });
    expect(hits).toBe(3);
  });

  test("an entry ends no later than its Consent's provision.period.end", async () => {
    status = "active";
    const before = hits;
    let now = Date.parse("2026-12-31T23:59:00Z");
    const client = new Iti108ConsentClient(baseUrl, { now: "2026-12-31T23:59:00Z" }, { ttlMs: 86_400_000, clock: () => now });
    await client.findAccessConsents({ patient: "Patient/p1" });
    now = Date.parse("2027-01-01T00:00:01Z");
    await client.findAccessConsents({ patient: "Patient/p1", now: "2027-01-01T00:00:01Z" });
    expect(hits).toBe(before + 2);
  });
});
