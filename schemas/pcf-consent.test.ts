/**
 * Unit tests for IHE PCF 1.1.0 Consent → ODRL 2.2 translation (`consentToOdrl`)
 * and three-valued access-control decisions (`decide`), plus the four IHE PCF
 * Volume 1 §1:53.2.1 implicit-policy ODRL `Set`s (bean `jx7m`, PCF5).
 */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";

import {
  ANYONE,
  HL7_ACT_CODE_SYSTEM,
  HL7_ACT_REASON_SYSTEM,
  HL7_CONFIDENTIALITY_SYSTEM,
  HL7_CONSENT_SCOPE_SYSTEM,
  HL7_PARTICIPATION_TYPE_SYSTEM,
  LOINC_CONSENT_CODE,
  LOINC_SYSTEM,
  PCF_BASIC_PURPOSES,
  PCF_CONSENT_ADVANCED_PROFILE,
  PCF_CONSENT_BASIC_PROFILE,
  PCF_CONSENT_INTERMEDIATE_PROFILE,
  PCF_IG_CANONICAL,
  PCF_IMPLICIT_ALL_NORMAL_SET,
  PCF_IMPLICIT_BASIC_NORMAL_SET,
  PCF_IMPLICIT_BREAK_GLASS_ONLY_SET,
  PCF_IMPLICIT_DENY_SET,
  PCF_IMPLICIT_POLICY_SETS,
  PCF_POLICY_ALL_NORMAL_URI,
  PCF_POLICY_BASIC_NORMAL_URI,
  PCF_POLICY_BREAK_GLASS_ONLY_URI,
  PCF_POLICY_DENY_URI,
  consentPolicyUid,
  consentToOdrl,
  decide,
  detectPcfProfile,
  extractConsentCitation,
  getImplicitPolicySet,
  isConsentExpired,
  type FhirCoding,
  type FhirConsent,
  type FhirConsentProvision,
} from "./pcf-consent.js";

const TPO_PURPOSES: readonly FhirCoding[] = PCF_BASIC_PURPOSES.map((code) => ({
  system: HL7_ACT_REASON_SYSTEM,
  code,
}));

function makeConsent(
  id: string,
  provision: FhirConsentProvision,
  overrides: Partial<FhirConsent> = {},
): FhirConsent {
  return {
    resourceType: "Consent",
    id,
    meta: {
      profile: [PCF_CONSENT_BASIC_PROFILE],
      ...(overrides.meta ?? {}),
    },
    status: "active",
    scope: {
      coding: [{ system: HL7_CONSENT_SCOPE_SYSTEM, code: "patient-privacy" }],
    },
    category: [
      {
        coding: [{ system: LOINC_SYSTEM, code: LOINC_CONSENT_CODE, display: "Consent" }],
      },
    ],
    patient: { reference: "Patient/ex-patient" },
    dateTime: "2022-06-13",
    performer: [{ reference: "Patient/ex-patient" }],
    organization: [{ reference: "Organization/ex-organization" }],
    sourceReference: { reference: "DocumentReference/ex-documentreference" },
    policy: [{ uri: "http://example.org/policies/basePrivacyConsentPolicy.txt" }],
    provision,
    ...overrides,
  };
}

describe("Four IHE PCF 1.1.0 Volume 1 §1:53.2.1 implicit-policy ODRL Sets", () => {
  test("exports all four canonical implicit policy Sets and resolves them by URI and alias", () => {
    expect(Object.keys(PCF_IMPLICIT_POLICY_SETS)).toEqual([
      PCF_POLICY_BASIC_NORMAL_URI,
      PCF_POLICY_ALL_NORMAL_URI,
      PCF_POLICY_BREAK_GLASS_ONLY_URI,
      PCF_POLICY_DENY_URI,
    ]);
    for (const set of Object.values(PCF_IMPLICIT_POLICY_SETS)) {
      expect(set["@type"]).toBe("Set");
      expect(set.profile).toBe(PCF_IG_CANONICAL);
    }
    expect(getImplicitPolicySet(PCF_POLICY_BASIC_NORMAL_URI)).toBe(PCF_IMPLICIT_BASIC_NORMAL_SET);
    expect(getImplicitPolicySet("basic-normal")).toBe(PCF_IMPLICIT_BASIC_NORMAL_SET);
    expect(getImplicitPolicySet(PCF_POLICY_ALL_NORMAL_URI)).toBe(PCF_IMPLICIT_ALL_NORMAL_SET);
    expect(getImplicitPolicySet("opt-out")).toBe(PCF_IMPLICIT_ALL_NORMAL_SET);
    expect(getImplicitPolicySet(PCF_POLICY_BREAK_GLASS_ONLY_URI)).toBe(PCF_IMPLICIT_BREAK_GLASS_ONLY_SET);
    expect(getImplicitPolicySet("break-glass-only")).toBe(PCF_IMPLICIT_BREAK_GLASS_ONLY_SET);
    expect(getImplicitPolicySet(PCF_POLICY_DENY_URI)).toBe(PCF_IMPLICIT_DENY_SET);
    expect(getImplicitPolicySet("opt-in")).toBe(PCF_IMPLICIT_DENY_SET);
    expect(getImplicitPolicySet("nonexistent")).toBeUndefined();
  });

  test("1. Policy-basic-normal permits TREAT (and sub-codes), denies non-treatment, unknown without purpose", () => {
    expect(decide(PCF_IMPLICIT_BASIC_NORMAL_SET, { actor: "Practitioner/ex-practitioner", purpose: "TREAT" })).toBe(
      "permit",
    );
    expect(decide(PCF_IMPLICIT_BASIC_NORMAL_SET, { actor: "Practitioner/ex-practitioner", purpose: "ETREAT" })).toBe(
      "permit",
    );
    expect(decide(PCF_IMPLICIT_BASIC_NORMAL_SET, { actor: "Practitioner/ex-practitioner", purpose: "BTG" })).toBe(
      "permit",
    );
    expect(decide(PCF_IMPLICIT_BASIC_NORMAL_SET, { actor: "Practitioner/ex-practitioner", purpose: "CAREMGT" })).toBe(
      "permit",
    );
    expect(decide(PCF_IMPLICIT_BASIC_NORMAL_SET, { actor: "Practitioner/ex-practitioner", purpose: "HRESCH" })).toBe(
      "deny",
    );
    expect(decide(PCF_IMPLICIT_BASIC_NORMAL_SET, { actor: "Practitioner/ex-practitioner", purpose: "HPAYMT" })).toBe(
      "deny",
    );
    expect(decide(PCF_IMPLICIT_BASIC_NORMAL_SET, { actor: "Practitioner/ex-practitioner" })).toBe("unknown");
  });

  test("2. Policy-all-normal permits any valid HL7 PurposeOfUse, denies draft dpv:*, unknown without purpose", () => {
    for (const purpose of ["TREAT", "HPAYMT", "HOPERAT", "HRESCH", "CLINTRCH", "PUBHLTH", "PATRQT", "BTG"]) {
      expect(decide(PCF_IMPLICIT_ALL_NORMAL_SET, { actor: "Practitioner/ex-practitioner", purpose })).toBe("permit");
    }
    expect(decide(PCF_IMPLICIT_ALL_NORMAL_SET, { actor: "Practitioner/ex-practitioner", purpose: "dpv:ResearchAndDevelopment" })).toBe(
      "deny",
    );
    expect(decide(PCF_IMPLICIT_ALL_NORMAL_SET, { actor: "Practitioner/ex-practitioner" })).toBe("unknown");
  });

  test("3. Policy-break-glass-only permits BTG, denies all other purposes, unknown without purpose", () => {
    expect(decide(PCF_IMPLICIT_BREAK_GLASS_ONLY_SET, { actor: "Practitioner/ex-practitioner", purpose: "BTG" })).toBe(
      "permit",
    );
    expect(decide(PCF_IMPLICIT_BREAK_GLASS_ONLY_SET, { actor: "Practitioner/ex-practitioner", purpose: "TREAT" })).toBe(
      "deny",
    );
    expect(decide(PCF_IMPLICIT_BREAK_GLASS_ONLY_SET, { actor: "Practitioner/ex-practitioner", purpose: "HRESCH" })).toBe(
      "deny",
    );
    expect(decide(PCF_IMPLICIT_BREAK_GLASS_ONLY_SET, { actor: "Practitioner/ex-practitioner" })).toBe("unknown");
  });

  test("4. Policy-deny denies all requests unconditionally", () => {
    expect(decide(PCF_IMPLICIT_DENY_SET, { actor: "Practitioner/ex-practitioner", purpose: "TREAT" })).toBe("deny");
    expect(decide(PCF_IMPLICIT_DENY_SET, { actor: "Practitioner/ex-practitioner", purpose: "BTG" })).toBe("deny");
    expect(decide(PCF_IMPLICIT_DENY_SET, { actor: "Practitioner/ex-practitioner" })).toBe("deny");
  });
});

describe("IHE PCF Basic Consent & Additional PurposeOfUse (consentToOdrl + decide)", () => {
  test("ex-consent-basic-treat: translates to ODRL Set with TREAT/HPAYMT/HOPERAT isA rules", () => {
    const consent = makeConsent("ex-consent-basic-treat", {
      type: "permit",
      purpose: TPO_PURPOSES,
    });
    expect(detectPcfProfile(consent)).toBe(PCF_CONSENT_BASIC_PROFILE);

    const set = consentToOdrl(consent);
    expect(set["@type"]).toBe("Set");
    expect(set.uid).toBe("urn:ihe:pcf:consent:ex-consent-basic-treat");
    expect(set.assigner).toBe("Patient/ex-patient");
    expect(set.permission).toHaveLength(3);
    expect(set.prohibition).toHaveLength(0);
    expect(set.permission.map((r) => r.constraint?.[0])).toEqual([
      { leftOperand: "odrl:purpose", operator: "odrl:isA", rightOperand: "TREAT" },
      { leftOperand: "odrl:purpose", operator: "odrl:isA", rightOperand: "HPAYMT" },
      { leftOperand: "odrl:purpose", operator: "odrl:isA", rightOperand: "HOPERAT" },
    ]);

    // Direct TPO codes and sub-codes permit
    for (const purpose of ["TREAT", "CLINTRL", "ETREAT", "BTG", "CAREMGT", "HPAYMT", "COVAUTH", "HOPERAT", "PATADMIN"]) {
      expect(decide(consent, { actor: "Practitioner/ex-practitioner", purpose })).toBe("permit");
    }
    // Non-TPO codes deny
    expect(decide(consent, { actor: "Practitioner/ex-practitioner", purpose: "HRESCH" })).toBe("deny");
    expect(decide(consent, { actor: "Practitioner/ex-practitioner", purpose: "HMARKT" })).toBe("deny");
    // Missing purpose -> unknown
    expect(decide(consent, { actor: "Practitioner/ex-practitioner" })).toBe("unknown");
  });

  test("ex-consent-basic-treat-infant & versionId: cites performer and versionId in policy uid", () => {
    const consent = makeConsent(
      "ex-consent-basic-treat-infant",
      { type: "permit", purpose: TPO_PURPOSES },
      {
        meta: { versionId: "2", profile: [PCF_CONSENT_BASIC_PROFILE] },
        performer: [{ reference: "Patient/ex-mother" }],
      },
    );
    expect(consentPolicyUid(consent)).toBe("urn:ihe:pcf:consent:ex-consent-basic-treat-infant:v2");
    const citation = extractConsentCitation(consent);
    expect(citation).toEqual({
      id: "ex-consent-basic-treat-infant",
      versionId: "2",
      uid: "urn:ihe:pcf:consent:ex-consent-basic-treat-infant:v2",
      status: "active",
      patient: "Patient/ex-patient",
      performer: "Patient/ex-mother",
      policyUris: ["http://example.org/policies/basePrivacyConsentPolicy.txt"],
    });
    const set = consentToOdrl(consent);
    expect(set.assigner).toBe("Patient/ex-mother");
    expect(decide(set, { actor: "Practitioner/ex-practitioner", purpose: "TREAT" })).toBe("permit");
  });

  test("ex-consent-basic-research (Additional PurposeOfUse HRESCH): ontological subsumption permits sub-concepts", () => {
    const consent = makeConsent(
      "ex-consent-basic-research",
      {
        type: "permit",
        purpose: [{ system: HL7_ACT_REASON_SYSTEM, code: "HRESCH" }],
      },
      {
        policy: [{ uri: "http://example.org/policies/researchPrivacyConsentPolicy.txt" }],
      },
    );
    const set = consentToOdrl(consent);
    expect(set.permission).toEqual([
      {
        assignee: ANYONE,
        action: "odrl:use",
        constraint: [{ leftOperand: "odrl:purpose", operator: "odrl:isA", rightOperand: "HRESCH" }],
      },
    ]);

    for (const researchCode of ["HRESCH", "BIORCH", "CLINTRCH", "CLINTRCHNPC", "CLINTRCHPC", "PRECLINTRCH", "DSRCH", "POARCH", "TRANSRCH"]) {
      expect(decide(consent, { actor: "Organization/ex-org-researcher", purpose: researchCode })).toBe("permit");
    }
    expect(decide(consent, { actor: "Practitioner/ex-practitioner", purpose: "TREAT" })).toBe("deny");
    expect(decide(consent, { actor: "Organization/ex-org-researcher" })).toBe("unknown");
  });

  test("ex-consent-basic-reject: base deny translates to prohibition rules and overrides implicit permit", () => {
    const consent = makeConsent("ex-consent-basic-reject", {
      type: "deny",
      purpose: TPO_PURPOSES,
    });
    const set = consentToOdrl(consent);
    expect(set.permission).toHaveLength(0);
    expect(set.prohibition).toHaveLength(3);

    expect(decide(consent, { actor: "Practitioner/ex-practitioner", purpose: "TREAT" })).toBe("deny");
    expect(decide(consent, { actor: "Practitioner/ex-practitioner", purpose: "HPAYMT" })).toBe("deny");
    expect(decide(consent, { actor: "Practitioner/ex-practitioner", purpose: "HOPERAT" })).toBe("deny");
    expect(
      decide(consent, { actor: "Practitioner/ex-practitioner", purpose: "TREAT" }, { implicitPolicy: "all-normal" }),
    ).toBe("deny");
    expect(decide(consent, { actor: "Practitioner/ex-practitioner" })).toBe("unknown");
  });

  test("ex-consent-expired-treat: provision.period enforces expiration and falls back to implicit policy when expired", () => {
    const consent = makeConsent("ex-consent-expired-treat", {
      type: "permit",
      period: { end: "2022-12-31" },
      purpose: TPO_PURPOSES,
    });
    expect(isConsentExpired(consent, "2022-06-15")).toBe(false);
    expect(isConsentExpired(consent, "2022-12-31T18:00:00Z")).toBe(false);
    expect(isConsentExpired(consent, "2023-01-01")).toBe(true);

    // Inside validity period -> permit
    expect(
      decide(consent, { actor: "Practitioner/ex-practitioner", purpose: "TREAT", dateTime: "2022-06-15" }),
    ).toBe("permit");
    expect(
      decide(consent, { actor: "Practitioner/ex-practitioner", purpose: "TREAT", dateTime: "2022-12-31" }),
    ).toBe("permit");

    // Past period.end -> deny when no implicit policy, or fallback to implicit policy per PCF Vol 1 §1:53.4.2.5
    expect(
      decide(consent, { actor: "Practitioner/ex-practitioner", purpose: "TREAT", dateTime: "2023-01-01" }),
    ).toBe("deny");
    expect(
      decide(
        consent,
        { actor: "Practitioner/ex-practitioner", purpose: "TREAT", dateTime: "2023-01-01" },
        { implicitPolicy: "deny" },
      ),
    ).toBe("deny");
    expect(
      decide(
        consent,
        { actor: "Practitioner/ex-practitioner", purpose: "TREAT", dateTime: "2023-01-01" },
        { implicitPolicy: "basic-normal" },
      ),
    ).toBe("permit");

    // Missing dateTime when Consent has period -> unknown
    expect(decide(consent, { actor: "Practitioner/ex-practitioner", purpose: "TREAT" })).toBe("unknown");
  });

  test("inactive, rejected, draft, entered-in-error or missing Consent -> unknown (or implicit policy)", () => {
    expect(decide(null, { actor: "Practitioner/ex-practitioner", purpose: "TREAT" })).toBe("unknown");
    expect(
      decide(null, { actor: "Practitioner/ex-practitioner", purpose: "TREAT" }, { implicitPolicy: "basic-normal" }),
    ).toBe("permit");
    expect(
      decide(null, { actor: "Practitioner/ex-practitioner", purpose: "TREAT" }, { implicitPolicy: "deny" }),
    ).toBe("deny");

    for (const status of ["inactive", "rejected", "draft", "proposed", "entered-in-error"] as const) {
      const nonActive = makeConsent("ex-non-active", { type: "permit", purpose: TPO_PURPOSES }, { status });
      const set = consentToOdrl(nonActive);
      expect(set.permission).toEqual([]);
      expect(set.prohibition).toEqual([]);
      expect(decide(nonActive, { actor: "Practitioner/ex-practitioner", purpose: "TREAT" })).toBe("unknown");
    }
  });
});

describe("IHE PCF Intermediate & Advanced Consent examples (nested exceptions, data & securityLabel scoping)", () => {
  test("ex-consent-intermediate-purpose: specific research project code (FooBar) and actor", () => {
    const consent = makeConsent(
      "ex-consent-intermediate-purpose",
      {
        type: "permit",
        actor: [
          {
            role: { coding: [{ system: HL7_PARTICIPATION_TYPE_SYSTEM, code: "IRCP" }] },
            reference: { reference: "Organization/ex-org-researcher" },
          },
        ],
        purpose: [{ system: "http://example.org/policies/purposeOfUse", code: "FooBar" }],
      },
      {
        meta: { profile: [PCF_CONSENT_INTERMEDIATE_PROFILE] },
        policy: [{ uri: PCF_POLICY_BASIC_NORMAL_URI }],
      },
    );
    expect(detectPcfProfile(consent)).toBe(PCF_CONSENT_INTERMEDIATE_PROFILE);
    expect(decide(consent, { actor: "Organization/ex-org-researcher", purpose: "FooBar" })).toBe("permit");
    expect(decide(consent, { actor: "Organization/ex-other", purpose: "FooBar" })).toBe("deny");
    expect(decide(consent, { actor: "Organization/ex-org-researcher", purpose: "TREAT" })).toBe("deny");
    expect(decide(consent, { actor: null, purpose: "FooBar" })).toBe("unknown");
  });

  test("ex-dissent-intermediate-break-glass: root deny with nested BTG permit exception", () => {
    const consent = makeConsent(
      "ex-dissent-intermediate-break-glass",
      {
        type: "deny",
        provision: [
          {
            type: "permit",
            actor: [
              {
                role: { coding: [{ system: HL7_PARTICIPATION_TYPE_SYSTEM, code: "IRCP" }] },
                reference: { reference: "Group/ex-privilegedUsers" },
              },
            ],
            purpose: [{ system: HL7_ACT_REASON_SYSTEM, code: "BTG" }],
          },
        ],
      },
      {
        meta: { profile: [PCF_CONSENT_INTERMEDIATE_PROFILE] },
        policy: [{ uri: PCF_POLICY_BREAK_GLASS_ONLY_URI }],
      },
    );
    const set = consentToOdrl(consent);
    expect(set.conflict).toBe("odrl:perm");

    // Privileged user with BTG permits (directly or via actorGroups)
    expect(decide(consent, { actor: "Group/ex-privilegedUsers", purpose: "BTG" })).toBe("permit");
    expect(
      decide(consent, {
        actor: "Practitioner/ex-practitioner",
        actorGroups: ["Group/ex-privilegedUsers"],
        purpose: "BTG",
      }),
    ).toBe("permit");

    // Non-BTG purpose or non-privileged user denies
    expect(decide(consent, { actor: "Group/ex-privilegedUsers", purpose: "TREAT" })).toBe("deny");
    expect(decide(consent, { actor: "Practitioner/ex-clerk", purpose: "BTG" })).toBe("deny");
  });

  test("ex-consent-intermediate-data & not-data: positive and negative data instance scoping", () => {
    const allowData = makeConsent(
      "ex-consent-intermediate-data",
      {
        type: "permit",
        purpose: TPO_PURPOSES,
        data: [
          { meaning: "instance", reference: { reference: "Encounter/ex-encounter" } },
          { meaning: "instance", reference: { reference: "Observation/ex-bloodPressure" } },
        ],
      },
      { meta: { profile: [PCF_CONSENT_INTERMEDIATE_PROFILE] } },
    );
    expect(
      decide(allowData, {
        actor: "Practitioner/ex-practitioner",
        purpose: "TREAT",
        target: "Observation/ex-bloodPressure",
      }),
    ).toBe("permit");
    expect(
      decide(allowData, {
        actor: "Practitioner/ex-practitioner",
        purpose: "TREAT",
        target: "Observation/ex-alcoholUse",
      }),
    ).toBe("deny");
    expect(decide(allowData, { actor: "Practitioner/ex-practitioner", purpose: "TREAT" })).toBe("unknown");

    const denyData = makeConsent(
      "ex-consent-intermediate-not-data",
      {
        type: "permit",
        purpose: TPO_PURPOSES,
        provision: [
          {
            type: "deny",
            data: [{ meaning: "instance", reference: { reference: "Observation/ex-alcoholUse" } }],
          },
        ],
      },
      { meta: { profile: [PCF_CONSENT_INTERMEDIATE_PROFILE] } },
    );
    expect(
      decide(denyData, {
        actor: "Practitioner/ex-practitioner",
        purpose: "TREAT",
        target: "Observation/ex-bloodPressure",
      }),
    ).toBe("permit");
    expect(
      decide(denyData, {
        actor: "Practitioner/ex-practitioner",
        purpose: "TREAT",
        target: "Observation/ex-alcoholUse",
      }),
    ).toBe("deny");
    expect(decide(denyData, { actor: "Practitioner/ex-practitioner", purpose: "TREAT" })).toBe("unknown");
  });

  test("ex-consent-intermediate-authoredby, encounter, and timeframe (positive and negative)", () => {
    const notAuthor = makeConsent(
      "ex-consent-intermediate-not-authoredby",
      {
        type: "permit",
        purpose: TPO_PURPOSES,
        provision: [
          {
            type: "deny",
            data: [{ meaning: "authoredby", reference: { reference: "Practitioner/ex-practitioner" } }],
          },
        ],
      },
      { meta: { profile: [PCF_CONSENT_INTERMEDIATE_PROFILE] } },
    );
    expect(
      decide(notAuthor, {
        actor: "Practitioner/ex-clerk",
        purpose: "TREAT",
        author: "Practitioner/ex-author",
      }),
    ).toBe("permit");
    expect(
      decide(notAuthor, {
        actor: "Practitioner/ex-clerk",
        purpose: "TREAT",
        author: "Practitioner/ex-practitioner",
      }),
    ).toBe("deny");

    const notEncounter = makeConsent(
      "ex-consent-intermediate-not-encounter",
      {
        type: "permit",
        purpose: TPO_PURPOSES,
        provision: [
          {
            type: "deny",
            data: [{ meaning: "related", reference: { reference: "Encounter/ex-encounter" } }],
          },
        ],
      },
      { meta: { profile: [PCF_CONSENT_INTERMEDIATE_PROFILE] } },
    );
    expect(
      decide(notEncounter, {
        actor: "Practitioner/ex-practitioner",
        purpose: "TREAT",
        encounter: "Encounter/ex-other",
      }),
    ).toBe("permit");
    expect(
      decide(notEncounter, {
        actor: "Practitioner/ex-practitioner",
        purpose: "TREAT",
        encounter: "Encounter/ex-encounter",
      }),
    ).toBe("deny");

    const timeframe = makeConsent(
      "ex-consent-intermediate-timeframe",
      {
        type: "permit",
        purpose: TPO_PURPOSES,
        dataPeriod: { start: "2022-01-01", end: "2022-12-31" },
      },
      { meta: { profile: [PCF_CONSENT_INTERMEDIATE_PROFILE] } },
    );
    expect(
      decide(timeframe, {
        actor: "Practitioner/ex-practitioner",
        purpose: "TREAT",
        dataPeriod: "2022-06-01",
      }),
    ).toBe("permit");
    expect(
      decide(timeframe, {
        actor: "Practitioner/ex-practitioner",
        purpose: "TREAT",
        dataPeriod: "2023-03-01",
      }),
    ).toBe("deny");
  });

  test("ex-consent-advanced-normal-focused-psy-or-sdv & break-glass-restricted: securityLabel scoping", () => {
    const focused = makeConsent(
      "ex-consent-advanced-normal-focused-psy-or-sdv",
      {
        type: "permit",
        securityLabel: [{ system: HL7_CONFIDENTIALITY_SYSTEM, code: "N" }],
        purpose: TPO_PURPOSES,
        provision: [
          {
            type: "permit",
            actor: [
              {
                role: { coding: [{ system: HL7_PARTICIPATION_TYPE_SYSTEM, code: "IRCP" }] },
                reference: { reference: "Practitioner/ex-practitioner" },
              },
            ],
            securityLabel: [
              { system: HL7_ACT_CODE_SYSTEM, code: "PSY" },
              { system: HL7_ACT_CODE_SYSTEM, code: "SDV" },
            ],
          },
        ],
      },
      { meta: { profile: [PCF_CONSENT_ADVANCED_PROFILE] } },
    );
    expect(detectPcfProfile(focused)).toBe(PCF_CONSENT_ADVANCED_PROFILE);
    expect(
      decide(focused, { actor: "Practitioner/ex-other", purpose: "TREAT", securityLabel: "N" }),
    ).toBe("permit");
    expect(
      decide(focused, { actor: "Practitioner/ex-other", purpose: "TREAT", securityLabel: "PSY" }),
    ).toBe("deny");
    expect(
      decide(focused, { actor: "Practitioner/ex-practitioner", purpose: "TREAT", securityLabel: "PSY" }),
    ).toBe("permit");
    expect(
      decide(focused, { actor: "Practitioner/ex-practitioner", purpose: "TREAT", securityLabel: "SDV" }),
    ).toBe("permit");

    const breakGlassAdv = makeConsent(
      "ex-consent-advanced-normal-break-glass-restricted",
      {
        type: "permit",
        securityLabel: [{ system: HL7_CONFIDENTIALITY_SYSTEM, code: "N" }],
        purpose: TPO_PURPOSES,
        provision: [
          {
            type: "permit",
            actor: [
              {
                role: { coding: [{ system: HL7_PARTICIPATION_TYPE_SYSTEM, code: "IRCP" }] },
                reference: { reference: "Group/ex-privilegedUsers" },
              },
            ],
            securityLabel: [{ system: HL7_CONFIDENTIALITY_SYSTEM, code: "R" }],
            purpose: [{ system: HL7_ACT_REASON_SYSTEM, code: "BTG" }],
          },
        ],
      },
      { meta: { profile: [PCF_CONSENT_ADVANCED_PROFILE] } },
    );
    expect(
      decide(breakGlassAdv, { actor: "Practitioner/ex-other", purpose: "TREAT", securityLabel: "N" }),
    ).toBe("permit");
    expect(
      decide(breakGlassAdv, { actor: "Practitioner/ex-other", purpose: "TREAT", securityLabel: "R" }),
    ).toBe("deny");
    expect(
      decide(breakGlassAdv, { actor: "Group/ex-privilegedUsers", purpose: "BTG", securityLabel: "R" }),
    ).toBe("permit");
    expect(
      decide(breakGlassAdv, { actor: "Group/ex-privilegedUsers", purpose: "TREAT", securityLabel: "R" }),
    ).toBe("deny");
  });


  test("all remaining Intermediate and Advanced PCF examples (authoredby, encounter, not-timeframe, normal, restricted, not-restricted, focused-restricted, focused-psy)", () => {
    const authoredBy = makeConsent(
      "ex-consent-intermediate-authoredby",
      {
        type: "permit",
        purpose: TPO_PURPOSES,
        data: [{ meaning: "authoredby", reference: { reference: "Practitioner/ex-practitioner" } }],
      },
      { meta: { profile: [PCF_CONSENT_INTERMEDIATE_PROFILE] } },
    );
    expect(
      decide(authoredBy, { actor: "Practitioner/ex-clerk", purpose: "TREAT", author: "Practitioner/ex-practitioner" }),
    ).toBe("permit");
    expect(
      decide(authoredBy, { actor: "Practitioner/ex-clerk", purpose: "TREAT", author: "Practitioner/ex-author" }),
    ).toBe("deny");
    expect(decide(authoredBy, { actor: "Practitioner/ex-clerk", purpose: "TREAT" })).toBe("unknown");

    const encounter = makeConsent(
      "ex-consent-intermediate-encounter",
      {
        type: "permit",
        purpose: TPO_PURPOSES,
        data: [{ meaning: "related", reference: { reference: "Encounter/ex-encounter" } }],
      },
      { meta: { profile: [PCF_CONSENT_INTERMEDIATE_PROFILE] } },
    );
    expect(
      decide(encounter, { actor: "Practitioner/ex-practitioner", purpose: "TREAT", encounter: "Encounter/ex-encounter" }),
    ).toBe("permit");
    expect(
      decide(encounter, { actor: "Practitioner/ex-practitioner", purpose: "TREAT", encounter: "Encounter/ex-other" }),
    ).toBe("deny");

    const notTimeframe = makeConsent(
      "ex-consent-intermediate-not-timeframe",
      {
        type: "permit",
        purpose: TPO_PURPOSES,
        provision: [{ type: "deny", dataPeriod: { start: "2022-01-01", end: "2022-12-31" } }],
      },
      { meta: { profile: [PCF_CONSENT_INTERMEDIATE_PROFILE] } },
    );
    expect(
      decide(notTimeframe, { actor: "Practitioner/ex-practitioner", purpose: "TREAT", dataPeriod: "2023-06-01" }),
    ).toBe("permit");
    expect(
      decide(notTimeframe, { actor: "Practitioner/ex-practitioner", purpose: "TREAT", dataPeriod: "2022-06-01" }),
    ).toBe("deny");

    const advNormal = makeConsent(
      "ex-consent-advanced-normal",
      {
        type: "permit",
        securityLabel: [{ system: HL7_CONFIDENTIALITY_SYSTEM, code: "N" }],
        purpose: TPO_PURPOSES,
      },
      { meta: { profile: [PCF_CONSENT_ADVANCED_PROFILE] } },
    );
    expect(decide(advNormal, { actor: "Practitioner/ex-practitioner", purpose: "TREAT", securityLabel: "N" })).toBe(
      "permit",
    );
    expect(decide(advNormal, { actor: "Practitioner/ex-practitioner", purpose: "TREAT", securityLabel: "R" })).toBe(
      "deny",
    );

    const advNormalRestricted = makeConsent(
      "ex-consent-advanced-normal-restricted",
      {
        type: "permit",
        securityLabel: [
          { system: HL7_CONFIDENTIALITY_SYSTEM, code: "N" },
          { system: HL7_CONFIDENTIALITY_SYSTEM, code: "R" },
        ],
        purpose: TPO_PURPOSES,
      },
      { meta: { profile: [PCF_CONSENT_ADVANCED_PROFILE] } },
    );
    expect(
      decide(advNormalRestricted, { actor: "Practitioner/ex-practitioner", purpose: "TREAT", securityLabel: "N" }),
    ).toBe("permit");
    expect(
      decide(advNormalRestricted, { actor: "Practitioner/ex-practitioner", purpose: "TREAT", securityLabel: "R" }),
    ).toBe("permit");
    expect(
      decide(advNormalRestricted, { actor: "Practitioner/ex-practitioner", purpose: "TREAT", securityLabel: "V" }),
    ).toBe("deny");

    const advNotRestricted = makeConsent(
      "ex-consent-advanced-normal-not-restricted",
      {
        type: "permit",
        securityLabel: [{ system: HL7_CONFIDENTIALITY_SYSTEM, code: "N" }],
        purpose: TPO_PURPOSES,
        provision: [{ type: "deny", securityLabel: [{ system: HL7_CONFIDENTIALITY_SYSTEM, code: "R" }] }],
      },
      { meta: { profile: [PCF_CONSENT_ADVANCED_PROFILE] } },
    );
    expect(
      decide(advNotRestricted, { actor: "Practitioner/ex-practitioner", purpose: "TREAT", securityLabel: "N" }),
    ).toBe("permit");
    expect(
      decide(advNotRestricted, { actor: "Practitioner/ex-practitioner", purpose: "TREAT", securityLabel: "R" }),
    ).toBe("deny");

    const advFocusedRestricted = makeConsent(
      "ex-consent-advanced-normal-focused-restricted",
      {
        type: "permit",
        securityLabel: [{ system: HL7_CONFIDENTIALITY_SYSTEM, code: "N" }],
        purpose: TPO_PURPOSES,
        provision: [
          {
            type: "permit",
            actor: [{ reference: { reference: "Practitioner/ex-practitioner" } }],
            securityLabel: [{ system: HL7_CONFIDENTIALITY_SYSTEM, code: "R" }],
          },
        ],
      },
      { meta: { profile: [PCF_CONSENT_ADVANCED_PROFILE] } },
    );
    expect(
      decide(advFocusedRestricted, { actor: "Practitioner/ex-practitioner", purpose: "TREAT", securityLabel: "R" }),
    ).toBe("permit");
    expect(
      decide(advFocusedRestricted, { actor: "Practitioner/ex-other", purpose: "TREAT", securityLabel: "R" }),
    ).toBe("deny");

    const advFocusedPsy = makeConsent(
      "ex-consent-advanced-normal-focused-psy",
      {
        type: "permit",
        securityLabel: [{ system: HL7_CONFIDENTIALITY_SYSTEM, code: "N" }],
        purpose: TPO_PURPOSES,
        provision: [
          {
            type: "permit",
            actor: [{ reference: { reference: "Practitioner/ex-practitioner" } }],
            securityLabel: [{ system: HL7_ACT_CODE_SYSTEM, code: "PSY" }],
          },
        ],
      },
      { meta: { profile: [PCF_CONSENT_ADVANCED_PROFILE] } },
    );
    expect(
      decide(advFocusedPsy, { actor: "Practitioner/ex-practitioner", purpose: "TREAT", securityLabel: "PSY" }),
    ).toBe("permit");
    expect(
      decide(advFocusedPsy, { actor: "Practitioner/ex-other", purpose: "TREAT", securityLabel: "PSY" }),
    ).toBe("deny");
  });
});

const DEFAULT_PCF_PKG_EXAMPLES = join(homedir(), ".fhir/packages/ihe.iti.pcf#1.1.0/package/example");
const PCF_EXAMPLES_DIR =
  process.env.IHE_PCF_EXAMPLES_DIR ?? (existsSync(DEFAULT_PCF_PKG_EXAMPLES) ? DEFAULT_PCF_PKG_EXAMPLES : undefined);

describe.skipIf(!PCF_EXAMPLES_DIR)("Published ihe.iti.pcf#1.1.0 package Consent examples sweep", () => {
  test("every Consent-ex-*.json in ihe.iti.pcf#1.1.0 translates and decides per PCF Volume 1", () => {
    const files = readdirSync(PCF_EXAMPLES_DIR!)
      .filter((f) => f.startsWith("Consent-") && f.endsWith(".json"))
      .sort();
    expect(files.length).toBeGreaterThanOrEqual(23);

    for (const file of files) {
      const consent = JSON.parse(readFileSync(join(PCF_EXAMPLES_DIR!, file), "utf-8")) as FhirConsent;
      const set = consentToOdrl(consent);
      expect(set["@type"]).toBe("Set");
      expect(set.permission.length + set.prohibition.length).toBeGreaterThan(0);

      // Missing scope always yields unknown
      expect(decide(consent, { actor: null })).toBe("unknown");
    }
  });
});
