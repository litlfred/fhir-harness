/**
 * IHE Privacy Consent on FHIR (PCF 1.1.0) → W3C ODRL 2.2 policy translation
 * and three-valued access-control decision engine (`permit` | `deny` | `unknown`).
 *
 * Owner decision, 2026-10-30 (bean `jx7m`, issue #2702): IHE PCF 1.1.0 (Trial
 * Implementation) and FHIR R4 `Consent` (Trial Use) approved; no IUA claim;
 * profiles referenced by canonical URL only; Basic consent + Additional
 * `PurposeOfUse` first, plus the four IHE PCF Volume 1 §1:53.2.1 implicit
 * overarching policies as ODRL 2.2 `Set` policies.
 *
 * ## How FHIR `Consent` maps to ODRL 2.2
 *
 * - An active FHIR R4 `Consent` (`status: "active"`) translates to an ODRL
 *   `Set` (`@type: "Set"`) whose `uid` cites `Consent.id` (and
 *   `Consent.meta.versionId` when present) and whose `assigner` names the
 *   consenting party (`Consent.performer[0]` or `Consent.patient`).
 * - A non-active `Consent` (`draft`, `proposed`, `rejected`, `inactive`,
 *   `entered-in-error`) translates to an ODRL `Set` with no active rules
 *   (`permission: []`, `prohibition: []`), which evaluates to `"unknown"`
 *   (or falls back to the configured implicit policy).
 * - `Consent.provision` and nested `Consent.provision.provision` rules map to
 *   `permission` (`type: "permit"`) and `prohibition` (`type: "deny"`) rules:
 *   - `provision.purpose` codes from HL7 `v3-ActReason` (`PurposeOfUse`) become
 *     `{ leftOperand: "odrl:purpose", operator: "odrl:isA", rightOperand: code }`
 *     constraints, so ontological parent codes such as `TREAT` or `HRESCH`
 *     permit their sub-concepts (`CLINTRL`, `ETREAT`, `BTG`, `CLINTRCH`,
 *     `BIORCH`, …) as required by IHE PCF Volume 3 §3:5.8.2; local project
 *     `purposeOfUse` codes outside `v3-ActReason` become `odrl:eq` constraints.
 *   - `provision.period` bounds become `odrl:dateTime` `odrl:gteq` (`start`)
 *     and `odrl:lteq` (`end`) constraints.
 *   - `provision.actor` references become rule `assignee`s (defaulting to
 *     {@link ANYONE} when omitted).
 *   - `provision.data` instance references become rule `target`s; author
 *     (`meaning: "authoredby"`), encounter (`meaning: "related"`),
 *     `provision.dataPeriod` and `provision.securityLabel` become PCF scope
 *     constraints.
 *   - A root `permit` with nested `deny` exceptions uses `conflict: "odrl:prohibit"`;
 *     a root `deny` with nested `permit` exceptions (e.g. dissent except for
 *     Break-Glass) uses `conflict: "odrl:perm"`.
 *
 * @module fhir-harness/schemas/pcf-consent
 * @graphNode schema
 * @conformsTo hl7-fhir
 * @conformsTo w3c-odrl
 */
import {
  ANYONE,
  FOLIO_DEFAULT_CONFLICT,
  ODRL_ACTIONS,
  ODRL_NS,
  actionGraph,
  broaderOrSelf,
  type ActionGraph,
  type Decision,
} from "@litlfred/cat-harness-tools/schemas/content/odrl.js";

export { ANYONE, FOLIO_DEFAULT_CONFLICT, ODRL_ACTIONS, ODRL_NS, actionGraph, broaderOrSelf, type ActionGraph, type Decision };

// ── Canonical URLs & CodeSystems (referenced by URL only) ──────────────

export const ODRL_CONTEXT_URL = "http://www.w3.org/ns/odrl.jsonld" as const;
export const PCF_IG_CANONICAL = "https://profiles.ihe.net/ITI/PCF" as const;

export const PCF_CONSENT_BASIC_PROFILE =
  "https://profiles.ihe.net/ITI/PCF/StructureDefinition/IHE.PCF.consentBasic" as const;
export const PCF_CONSENT_INTERMEDIATE_PROFILE =
  "https://profiles.ihe.net/ITI/PCF/StructureDefinition/IHE.PCF.consentIntermediate" as const;
export const PCF_CONSENT_ADVANCED_PROFILE =
  "https://profiles.ihe.net/ITI/PCF/StructureDefinition/IHE.PCF.consentAdvanced" as const;

export const PCF_CONSENT_PROFILES = [
  PCF_CONSENT_BASIC_PROFILE,
  PCF_CONSENT_INTERMEDIATE_PROFILE,
  PCF_CONSENT_ADVANCED_PROFILE,
] as const;
export type PcfConsentProfile = (typeof PCF_CONSENT_PROFILES)[number];

export const PCF_BASIC_PURPOSE_VS = "https://profiles.ihe.net/ITI/PCF/ValueSet/BasicPurposeVS" as const;
export const PCF_ADVANCED_SECURITY_TAG_VS =
  "https://profiles.ihe.net/ITI/PCF/ValueSet/AdvancedSecurityTagVS" as const;

export const HL7_ACT_REASON_SYSTEM = "http://terminology.hl7.org/CodeSystem/v3-ActReason" as const;
export const HL7_CONFIDENTIALITY_SYSTEM = "http://terminology.hl7.org/CodeSystem/v3-Confidentiality" as const;
export const HL7_ACT_CODE_SYSTEM = "http://terminology.hl7.org/CodeSystem/v3-ActCode" as const;
export const HL7_PARTICIPATION_TYPE_SYSTEM = "http://terminology.hl7.org/CodeSystem/v3-ParticipationType" as const;
export const HL7_CONSENT_SCOPE_SYSTEM = "http://terminology.hl7.org/CodeSystem/consentscope" as const;
export const LOINC_SYSTEM = "http://loinc.org" as const;
export const LOINC_CONSENT_CODE = "59284-0" as const;

/**
 * The extensible `BasicPurposeVS` codes in IHE PCF 1.1.0: Treatment, Payment,
 * and Healthcare Operations (TPO).
 */
export const PCF_BASIC_PURPOSES = ["TREAT", "HPAYMT", "HOPERAT"] as const;
export type PcfBasicPurpose = (typeof PCF_BASIC_PURPOSES)[number];

/**
 * HL7 v3 `ActReason` `PurposeOfUse` hierarchy (`child -> parent[]`), walked by
 * {@link broaderOrSelf} for `odrl:purpose` `odrl:isA` constraints.
 */
export const HL7_PURPOSE_OF_USE: Readonly<Record<string, readonly string[]>> = {
  PurposeOfUse: [],
  HMARKT: ["PurposeOfUse"],
  HOPERAT: ["PurposeOfUse"],
  CAREMGT: ["HOPERAT", "TREAT"],
  DONAT: ["HOPERAT"],
  FRAUD: ["HOPERAT"],
  GOV: ["HOPERAT"],
  HACCRED: ["HOPERAT"],
  HCOMPL: ["HOPERAT"],
  HDECD: ["HOPERAT"],
  HDIRECT: ["HOPERAT"],
  HDM: ["HOPERAT"],
  HLEGAL: ["HOPERAT"],
  HOUTCOMS: ["HOPERAT"],
  HPRGRP: ["HOPERAT"],
  HQUALIMP: ["HOPERAT"],
  HSYSADMIN: ["HOPERAT"],
  LABELING: ["HOPERAT"],
  METAMGT: ["HOPERAT"],
  MEMADMIN: ["HOPERAT"],
  MILCDM: ["HOPERAT"],
  PATADMIN: ["HOPERAT"],
  PATSFTY: ["HOPERAT"],
  PERFMSR: ["HOPERAT"],
  RECORDMGT: ["HOPERAT"],
  SYSDEV: ["HOPERAT"],
  HTEST: ["HOPERAT"],
  TRAIN: ["HOPERAT"],
  HPAYMT: ["PurposeOfUse"],
  CLMATTCH: ["HPAYMT"],
  COVAUTH: ["HPAYMT"],
  COVERAGE: ["HPAYMT"],
  ELIGDTRM: ["COVERAGE"],
  ELIGVER: ["COVERAGE"],
  ENROLLM: ["COVERAGE"],
  MILDCRG: ["COVERAGE"],
  HAAUTH: ["HPAYMT"],
  REMITADV: ["HPAYMT"],
  HRESCH: ["PurposeOfUse"],
  BIORCH: ["HRESCH"],
  CLINTRCH: ["HRESCH"],
  CLINTRCHNPC: ["CLINTRCH"],
  CLINTRCHPC: ["CLINTRCH"],
  PRECLINTRCH: ["CLINTRCH"],
  DSRCH: ["HRESCH"],
  POARCH: ["HRESCH"],
  TRANSRCH: ["HRESCH"],
  PATRQT: ["PurposeOfUse"],
  FAMRQT: ["PATRQT"],
  PWATRNY: ["PATRQT"],
  SUPNWK: ["PATRQT"],
  PUBHLTH: ["PurposeOfUse"],
  DISASTER: ["PUBHLTH"],
  THREAT: ["PUBHLTH"],
  TREAT: ["PurposeOfUse"],
  CLINTRL: ["TREAT"],
  ETREAT: ["TREAT"],
  BTG: ["ETREAT"],
  ERTREAT: ["ETREAT"],
  POPHLTH: ["TREAT"],
};

const PURPOSE_GRAPH: ReadonlyMap<string, readonly string[]> = new Map(Object.entries(HL7_PURPOSE_OF_USE));
const DEFAULT_ACTION_GRAPH: ActionGraph = actionGraph([]);

/** Strip optional `http://terminology.hl7.org/CodeSystem/v3-ActReason#` or `v3-ActReason:` prefix. */
export function normalizePurposeCode(code: string): string {
  if (code.startsWith(`${HL7_ACT_REASON_SYSTEM}#`) || code.startsWith(`${HL7_ACT_REASON_SYSTEM}/`)) {
    return code.slice(HL7_ACT_REASON_SYSTEM.length + 1);
  }
  if (code.startsWith("v3-ActReason:") || code.startsWith("hl7:")) {
    return code.slice(code.indexOf(":") + 1);
  }
  return code;
}

/** Whether `code` is in the HL7 v3 `ActReason` `PurposeOfUse` hierarchy. */
export function isKnownHl7PurposeOfUse(code: string): boolean {
  if (code.startsWith("dpv:") || code.includes("/dpv")) return false;
  return PURPOSE_GRAPH.has(normalizePurposeCode(code));
}

// ── ODRL Set types produced by consentToOdrl() ─────────────────────────

export type PcfLeftOperand =
  | "cat-harness:process"
  | "cat-harness:task"
  | "cat-harness:role"
  | "odrl:purpose"
  | "odrl:dateTime"
  | "odrl:elapsedTime"
  | "purpose"
  | "dateTime"
  | "elapsedTime"
  | "pcf:securityLabel"
  | "pcf:dataPeriod"
  | "pcf:author"
  | "pcf:encounter";

export type PcfOperator =
  | "odrl:eq"
  | "odrl:neq"
  | "odrl:isAnyOf"
  | "odrl:isNoneOf"
  | "odrl:lt"
  | "odrl:lteq"
  | "odrl:gt"
  | "odrl:gteq"
  | "odrl:isA"
  | "eq"
  | "neq"
  | "isAnyOf"
  | "isNoneOf"
  | "lt"
  | "lteq"
  | "gt"
  | "gteq"
  | "isA";

export interface PcfOdrlConstraint {
  leftOperand: PcfLeftOperand;
  operator: PcfOperator;
  rightOperand: string | readonly string[];
}

export interface PcfOdrlRule {
  assignee: string;
  action: string;
  target?: string;
  constraint?: PcfOdrlConstraint[];
}

export interface PcfOdrlSet {
  "@context": string | readonly unknown[] | Record<string, unknown>;
  "@type": "Set";
  uid: string;
  profile: string;
  inheritFrom?: string[];
  conflict?: "odrl:perm" | "odrl:prohibit" | "odrl:invalid";
  assigner?: string;
  assignee?: string;
  permission: PcfOdrlRule[];
  prohibition: PcfOdrlRule[];
}

// ── Four IHE PCF 1.1.0 Volume 1 §1:53.2.1 Implicit-Policy ODRL Sets ────

export const PCF_POLICY_BASIC_NORMAL_URI = "https://profiles.ihe.net/ITI/PCF/Policy-basic-normal" as const;
export const PCF_POLICY_ALL_NORMAL_URI = "https://profiles.ihe.net/ITI/PCF/Policy-all-normal" as const;
export const PCF_POLICY_BREAK_GLASS_ONLY_URI = "https://profiles.ihe.net/ITI/PCF/Policy-break-glass-only" as const;
export const PCF_POLICY_DENY_URI = "https://profiles.ihe.net/ITI/PCF/Policy-deny" as const;

export const PCF_IMPLICIT_POLICY_URIS = [
  PCF_POLICY_BASIC_NORMAL_URI,
  PCF_POLICY_ALL_NORMAL_URI,
  PCF_POLICY_BREAK_GLASS_ONLY_URI,
  PCF_POLICY_DENY_URI,
] as const;
export type PcfImplicitPolicyUri = (typeof PCF_IMPLICIT_POLICY_URIS)[number];

/**
 * 1. `https://profiles.ihe.net/ITI/PCF/Policy-basic-normal` (IHE PCF Vol 1
 *    §1:53.2.1 & §1:53.4.2.4.1 *Permit Clinical Treatment*):
 *    "Permit for clinicians that have authorization for Treatment use, but
 *    does not authorize other access."
 */
export const PCF_IMPLICIT_BASIC_NORMAL_SET: PcfOdrlSet = {
  "@context": ODRL_CONTEXT_URL,
  "@type": "Set",
  uid: PCF_POLICY_BASIC_NORMAL_URI,
  profile: PCF_IG_CANONICAL,
  conflict: "odrl:prohibit",
  permission: [
    {
      assignee: ANYONE,
      action: "odrl:use",
      constraint: [
        {
          leftOperand: "odrl:purpose",
          operator: "odrl:isA",
          rightOperand: "TREAT",
        },
      ],
    },
  ],
  prohibition: [],
};

/**
 * 2. `https://profiles.ihe.net/ITI/PCF/Policy-all-normal` (IHE PCF Vol 1
 *    §1:53.2.1 & §1:53.4.2.4.2 *Permit All Authorized*, opt-out baseline):
 *    "Permit for all authorized uses. This presumes that basic user access
 *    control will only allow authorized users and purposes of use."
 */
export const PCF_IMPLICIT_ALL_NORMAL_SET: PcfOdrlSet = {
  "@context": ODRL_CONTEXT_URL,
  "@type": "Set",
  uid: PCF_POLICY_ALL_NORMAL_URI,
  profile: PCF_IG_CANONICAL,
  conflict: "odrl:prohibit",
  permission: [
    {
      assignee: ANYONE,
      action: "odrl:use",
      constraint: [
        {
          leftOperand: "odrl:purpose",
          operator: "odrl:isA",
          rightOperand: "PurposeOfUse",
        },
      ],
    },
  ],
  prohibition: [],
};

/**
 * 3. `https://profiles.ihe.net/ITI/PCF/Policy-break-glass-only` (IHE PCF Vol 1
 *    §1:53.2.1 *Break-Glass Only*):
 *    "Deny for all use, except when the user is a clinician with authorization
 *    to declare a medical patient-safety override (a.k.a. Break-Glass)."
 */
export const PCF_IMPLICIT_BREAK_GLASS_ONLY_SET: PcfOdrlSet = {
  "@context": ODRL_CONTEXT_URL,
  "@type": "Set",
  uid: PCF_POLICY_BREAK_GLASS_ONLY_URI,
  profile: PCF_IG_CANONICAL,
  conflict: "odrl:prohibit",
  permission: [
    {
      assignee: ANYONE,
      action: "odrl:use",
      constraint: [
        {
          leftOperand: "odrl:purpose",
          operator: "odrl:isA",
          rightOperand: "BTG",
        },
      ],
    },
  ],
  prohibition: [
    {
      assignee: ANYONE,
      action: "odrl:use",
      constraint: [
        {
          leftOperand: "odrl:purpose",
          operator: "odrl:isNoneOf",
          rightOperand: ["BTG"],
        },
      ],
    },
  ],
};

/**
 * 4. `https://profiles.ihe.net/ITI/PCF/Policy-deny` (IHE PCF Vol 1 §1:53.2.1 &
 *    §1:53.4.2.4.3 *Deny All*, opt-in baseline):
 *    "Deny all."
 */
export const PCF_IMPLICIT_DENY_SET: PcfOdrlSet = {
  "@context": ODRL_CONTEXT_URL,
  "@type": "Set",
  uid: PCF_POLICY_DENY_URI,
  profile: PCF_IG_CANONICAL,
  conflict: "odrl:prohibit",
  permission: [],
  prohibition: [
    {
      assignee: ANYONE,
      action: "odrl:use",
    },
  ],
};

/**
 * All four IHE PCF Volume 1 §1:53.2.1 implicit-policy ODRL `Set`s, keyed by
 * their canonical URI.
 */
export const PCF_IMPLICIT_POLICY_SETS: Readonly<Record<PcfImplicitPolicyUri, PcfOdrlSet>> = {
  [PCF_POLICY_BASIC_NORMAL_URI]: PCF_IMPLICIT_BASIC_NORMAL_SET,
  [PCF_POLICY_ALL_NORMAL_URI]: PCF_IMPLICIT_ALL_NORMAL_SET,
  [PCF_POLICY_BREAK_GLASS_ONLY_URI]: PCF_IMPLICIT_BREAK_GLASS_ONLY_SET,
  [PCF_POLICY_DENY_URI]: PCF_IMPLICIT_DENY_SET,
};

export type PcfImplicitPolicyAlias =
  | PcfImplicitPolicyUri
  | "basic-normal"
  | "all-normal"
  | "break-glass-only"
  | "deny"
  | "opt-in"
  | "opt-out";

/** Resolve one of the four IHE PCF implicit-policy `Set`s by canonical URI or short alias. */
export function getImplicitPolicySet(uriOrAlias: string): PcfOdrlSet | undefined {
  switch (uriOrAlias) {
    case PCF_POLICY_BASIC_NORMAL_URI:
    case "basic-normal":
    case "Policy-basic-normal":
      return PCF_IMPLICIT_BASIC_NORMAL_SET;
    case PCF_POLICY_ALL_NORMAL_URI:
    case "all-normal":
    case "Policy-all-normal":
    case "opt-out":
      return PCF_IMPLICIT_ALL_NORMAL_SET;
    case PCF_POLICY_BREAK_GLASS_ONLY_URI:
    case "break-glass-only":
    case "Policy-break-glass-only":
      return PCF_IMPLICIT_BREAK_GLASS_ONLY_SET;
    case PCF_POLICY_DENY_URI:
    case "deny":
    case "Policy-deny":
    case "opt-in":
      return PCF_IMPLICIT_DENY_SET;
    default:
      return undefined;
  }
}

// ── FHIR R4 Consent model (IHE PCF 1.1.0 Basic / Intermediate / Advanced) ──

export type FhirConsentStatus =
  | "draft"
  | "proposed"
  | "active"
  | "rejected"
  | "inactive"
  | "entered-in-error";

export interface FhirCoding {
  system?: string;
  version?: string;
  code?: string;
  display?: string;
}

export interface FhirCodeableConcept {
  coding?: readonly FhirCoding[];
  text?: string;
}

export interface FhirIdentifier {
  system?: string;
  value?: string;
}

export interface FhirReference {
  reference?: string;
  type?: string;
  identifier?: FhirIdentifier;
  display?: string;
}

export interface FhirPeriod {
  start?: string;
  end?: string;
}

export interface FhirConsentActor {
  role?: FhirCodeableConcept;
  reference: FhirReference;
}

export type FhirConsentDataMeaning = "instance" | "related" | "dependents" | "authoredby";

export interface FhirConsentData {
  meaning: FhirConsentDataMeaning;
  reference: FhirReference;
}

export interface FhirConsentPolicy {
  authority?: string;
  uri?: string;
}

export interface FhirConsentProvision {
  type?: "deny" | "permit";
  period?: FhirPeriod;
  actor?: readonly FhirConsentActor[];
  action?: readonly FhirCodeableConcept[];
  securityLabel?: readonly FhirCoding[];
  purpose?: readonly FhirCoding[];
  class?: readonly FhirCoding[];
  code?: readonly FhirCodeableConcept[];
  dataPeriod?: FhirPeriod;
  data?: readonly FhirConsentData[];
  provision?: readonly FhirConsentProvision[];
}

export interface FhirConsentMeta {
  versionId?: string;
  lastUpdated?: string;
  profile?: readonly string[];
  security?: readonly FhirCoding[];
}

export interface FhirConsent {
  resourceType: "Consent";
  id?: string;
  meta?: FhirConsentMeta;
  status: FhirConsentStatus;
  scope?: FhirCodeableConcept;
  category?: readonly FhirCodeableConcept[];
  patient?: FhirReference;
  dateTime?: string;
  performer?: readonly FhirReference[];
  organization?: readonly FhirReference[];
  sourceAttachment?: Record<string, unknown>;
  sourceReference?: FhirReference;
  policy?: readonly FhirConsentPolicy[];
  policyRule?: FhirCodeableConcept;
  provision?: FhirConsentProvision;
}

export interface ConsentCitation {
  id: string;
  versionId?: string;
  uid: string;
  status: FhirConsentStatus;
  patient?: string;
  performer?: string;
  policyUris: string[];
}

export interface ConsentToOdrlOptions {
  /** ODRL profile URI written into `Set.profile` (default: {@link PCF_IG_CANONICAL}). */
  profile?: string;
  /** Prefix for minted policy `uid`s (default: `"urn:ihe:pcf:consent:"`). */
  uidPrefix?: string;
  /** Default ODRL action when `provision.action` is omitted (default: `"odrl:use"`). */
  defaultAction?: string;
}

const DEFAULT_UID_PREFIX = "urn:ihe:pcf:consent:";

/**
 * Deterministic ODRL `uid` for a FHIR `Consent`, citing both `Consent.id` and
 * `Consent.meta.versionId` when present (for PROV-O decision traceability,
 * bean `2egb`).
 */
export function consentPolicyUid(consent: FhirConsent, uidPrefix = DEFAULT_UID_PREFIX): string {
  const id = consent.id?.trim() || "anonymous";
  const versionId = consent.meta?.versionId?.trim();
  return versionId ? `${uidPrefix}${id}:v${versionId}` : `${uidPrefix}${id}`;
}

/** Extract citation metadata (`id`, `versionId`, `uid`, `status`, `patient`, `policyUris`) from a FHIR `Consent`. */
export function extractConsentCitation(consent: FhirConsent, uidPrefix = DEFAULT_UID_PREFIX): ConsentCitation {
  const id = consent.id?.trim() || "anonymous";
  const versionId = consent.meta?.versionId?.trim();
  const uid = consentPolicyUid(consent, uidPrefix);
  const patient = referenceId(consent.patient);
  const performer = referenceId(consent.performer?.[0]) ?? patient;
  const policyUris = (consent.policy ?? [])
    .map((p) => p.uri?.trim())
    .filter((u): u is string => Boolean(u));
  return {
    id,
    ...(versionId ? { versionId } : {}),
    uid,
    status: consent.status,
    ...(patient ? { patient } : {}),
    ...(performer ? { performer } : {}),
    policyUris,
  };
}

/**
 * Detect which IHE PCF profile (`consentBasic`, `consentIntermediate`,
 * `consentAdvanced`) a FHIR `Consent` declares or structurally uses.
 */
export function detectPcfProfile(consent: FhirConsent): PcfConsentProfile {
  const declared = consent.meta?.profile ?? [];
  if (declared.includes(PCF_CONSENT_ADVANCED_PROFILE)) return PCF_CONSENT_ADVANCED_PROFILE;
  if (declared.includes(PCF_CONSENT_INTERMEDIATE_PROFILE)) return PCF_CONSENT_INTERMEDIATE_PROFILE;
  if (declared.includes(PCF_CONSENT_BASIC_PROFILE)) return PCF_CONSENT_BASIC_PROFILE;

  const prov = consent.provision;
  if (!prov) return PCF_CONSENT_BASIC_PROFILE;
  const allProvisions = [prov, ...(prov.provision ?? [])];
  if (allProvisions.some((p) => (p.securityLabel?.length ?? 0) > 0)) {
    return PCF_CONSENT_ADVANCED_PROFILE;
  }
  if (
    (prov.provision?.length ?? 0) > 0 ||
    allProvisions.some(
      (p) =>
        p.dataPeriod !== undefined ||
        (p.data?.length ?? 0) > 0 ||
        (p.purpose ?? []).some((coding) => coding.code && ! isKnownHl7PurposeOfUse(coding.code)),
    )
  ) {
    return PCF_CONSENT_INTERMEDIATE_PROFILE;
  }
  return PCF_CONSENT_BASIC_PROFILE;
}

function referenceId(ref: FhirReference | undefined): string | undefined {
  if (!ref) return undefined;
  if (ref.reference && ref.reference.trim().length > 0) return ref.reference.trim();
  if (ref.identifier?.value && ref.identifier.value.trim().length > 0) {
    return ref.identifier.system
      ? `${ref.identifier.system}|${ref.identifier.value.trim()}`
      : ref.identifier.value.trim();
  }
  return undefined;
}

function mapFhirActionToOdrl(concept: FhirCodeableConcept): string {
  const code = concept.coding?.[0]?.code?.toLowerCase();
  switch (code) {
    case "read":
      return "odrl:display";
    case "correct":
      return "odrl:modify";
    case "access":
    case "collect":
    case "use":
    case "disclose":
    default:
      return "odrl:use";
  }
}

interface EffectiveProvisionContext {
  type: "permit" | "deny";
  period?: FhirPeriod;
  actor?: readonly FhirConsentActor[];
  action?: readonly FhirCodeableConcept[];
  securityLabel?: readonly FhirCoding[];
  purpose?: readonly FhirCoding[];
  dataPeriod?: FhirPeriod;
  data?: readonly FhirConsentData[];
}

function purposeConstraintForCoding(coding: FhirCoding): PcfOdrlConstraint | undefined {
  const rawCode = coding.code?.trim();
  if (!rawCode) return undefined;
  const isHl7System = !coding.system || coding.system === HL7_ACT_REASON_SYSTEM;
  if (isHl7System && isKnownHl7PurposeOfUse(rawCode)) {
    return {
      leftOperand: "odrl:purpose",
      operator: "odrl:isA",
      rightOperand: normalizePurposeCode(rawCode),
    };
  }
  return {
    leftOperand: "odrl:purpose",
    operator: "odrl:eq",
    rightOperand: rawCode,
  };
}

function expandProvisionToRules(
  prov: EffectiveProvisionContext,
  defaultAction: string,
): PcfOdrlRule[] {
  const assignees = (prov.actor ?? [])
    .map((a) => referenceId(a.reference))
    .filter((a): a is string => Boolean(a));
  const effectiveAssignees = assignees.length > 0 ? assignees : [ANYONE];

  const actions = (prov.action ?? []).map(mapFhirActionToOdrl);
  const effectiveActions = actions.length > 0 ? Array.from(new Set(actions)) : [defaultAction];

  const dataEntries = prov.data ?? [];
  const instanceTargets = dataEntries
    .filter((d) => d.meaning === "instance" || d.meaning === "dependents")
    .map((d) => referenceId(d.reference))
    .filter((r): r is string => Boolean(r));
  const effectiveTargets: readonly (string | undefined)[] =
    instanceTargets.length > 0 ? instanceTargets : [undefined];

  const authors = dataEntries
    .filter((d) => d.meaning === "authoredby")
    .map((d) => referenceId(d.reference))
    .filter((r): r is string => Boolean(r));

  const encounters = dataEntries
    .filter((d) => d.meaning === "related")
    .map((d) => referenceId(d.reference))
    .filter((r): r is string => Boolean(r));

  const sharedConstraints: PcfOdrlConstraint[] = [];

  if (prov.period?.start) {
    sharedConstraints.push({
      leftOperand: "odrl:dateTime",
      operator: "odrl:gteq",
      rightOperand: prov.period.start,
    });
  }
  if (prov.period?.end) {
    sharedConstraints.push({
      leftOperand: "odrl:dateTime",
      operator: "odrl:lteq",
      rightOperand: prov.period.end,
    });
  }

  if (prov.dataPeriod?.start) {
    sharedConstraints.push({
      leftOperand: "pcf:dataPeriod",
      operator: "odrl:gteq",
      rightOperand: prov.dataPeriod.start,
    });
  }
  if (prov.dataPeriod?.end) {
    sharedConstraints.push({
      leftOperand: "pcf:dataPeriod",
      operator: "odrl:lteq",
      rightOperand: prov.dataPeriod.end,
    });
  }

  const securityCodes = (prov.securityLabel ?? [])
    .map((s) => s.code?.trim())
    .filter((c): c is string => Boolean(c));
  if (securityCodes.length === 1) {
    sharedConstraints.push({
      leftOperand: "pcf:securityLabel",
      operator: "odrl:eq",
      rightOperand: securityCodes[0]!,
    });
  } else if (securityCodes.length > 1) {
    sharedConstraints.push({
      leftOperand: "pcf:securityLabel",
      operator: "odrl:isAnyOf",
      rightOperand: securityCodes,
    });
  }

  if (authors.length === 1) {
    sharedConstraints.push({
      leftOperand: "pcf:author",
      operator: "odrl:eq",
      rightOperand: authors[0]!,
    });
  } else if (authors.length > 1) {
    sharedConstraints.push({
      leftOperand: "pcf:author",
      operator: "odrl:isAnyOf",
      rightOperand: authors,
    });
  }

  if (encounters.length === 1) {
    sharedConstraints.push({
      leftOperand: "pcf:encounter",
      operator: "odrl:eq",
      rightOperand: encounters[0]!,
    });
  } else if (encounters.length > 1) {
    sharedConstraints.push({
      leftOperand: "pcf:encounter",
      operator: "odrl:isAnyOf",
      rightOperand: encounters,
    });
  }

  const purposeConstraints = (prov.purpose ?? [])
    .map(purposeConstraintForCoding)
    .filter((c): c is PcfOdrlConstraint => c !== undefined);

  const effectivePurposes: readonly (PcfOdrlConstraint | undefined)[] =
    purposeConstraints.length > 0 ? purposeConstraints : [undefined];

  const rules: PcfOdrlRule[] = [];
  for (const assignee of effectiveAssignees) {
    for (const action of effectiveActions) {
      for (const target of effectiveTargets) {
        for (const purposeConstraint of effectivePurposes) {
          const constraints: PcfOdrlConstraint[] = [
            ...(purposeConstraint ? [purposeConstraint] : []),
            ...sharedConstraints,
          ];
          rules.push({
            assignee,
            action,
            ...(target !== undefined ? { target } : {}),
            ...(constraints.length > 0 ? { constraint: constraints } : {}),
          });
        }
      }
    }
  }
  return rules;
}

function mergePeriods(parent?: FhirPeriod, child?: FhirPeriod): FhirPeriod | undefined {
  if (!parent && !child) return undefined;
  const start = child?.start ?? parent?.start;
  const end = child?.end ?? parent?.end;
  return {
    ...(start ? { start } : {}),
    ...(end ? { end } : {}),
  };
}

/**
 * Translate a FHIR R4 `Consent` (conforming to IHE PCF 1.1.0 Basic,
 * Intermediate, or Advanced) into a W3C ODRL 2.2 `Set` policy.
 */
export function consentToOdrl(consent: FhirConsent, options: ConsentToOdrlOptions = {}): PcfOdrlSet {
  if (!consent || consent.resourceType !== "Consent") {
    throw new Error("consentToOdrl expects a FHIR Consent resource (resourceType: 'Consent')");
  }
  const profile = options.profile ?? PCF_IG_CANONICAL;
  const uid = consentPolicyUid(consent, options.uidPrefix ?? DEFAULT_UID_PREFIX);
  const assigner = referenceId(consent.performer?.[0]) ?? referenceId(consent.patient);
  const defaultAction = options.defaultAction ?? "odrl:use";

  if (consent.status !== "active" || !consent.provision) {
    return {
      "@context": ODRL_CONTEXT_URL,
      "@type": "Set",
      uid,
      profile,
      conflict: FOLIO_DEFAULT_CONFLICT,
      ...(assigner ? { assigner } : {}),
      permission: [],
      prohibition: [],
    };
  }

  const root = consent.provision;
  const rootType: "permit" | "deny" = root.type ?? "permit";
  const permission: PcfOdrlRule[] = [];
  const prohibition: PcfOdrlRule[] = [];

  const rootRules = expandProvisionToRules(
    {
      type: rootType,
      period: root.period,
      actor: root.actor,
      action: root.action,
      securityLabel: root.securityLabel,
      purpose: root.purpose,
      dataPeriod: root.dataPeriod,
      data: root.data,
    },
    defaultAction,
  );
  if (rootType === "permit") {
    permission.push(...rootRules);
  } else {
    prohibition.push(...rootRules);
  }

  const visitChildren = (parent: EffectiveProvisionContext, children: readonly FhirConsentProvision[]) => {
    for (const child of children) {
      const childType: "permit" | "deny" = child.type ?? (parent.type === "permit" ? "deny" : "permit");
      const effectiveChild: EffectiveProvisionContext =
        childType === "permit"
          ? {
              type: "permit",
              period: mergePeriods(parent.period, child.period),
              actor: child.actor && child.actor.length > 0 ? child.actor : parent.actor,
              action: child.action && child.action.length > 0 ? child.action : parent.action,
              securityLabel:
                child.securityLabel && child.securityLabel.length > 0
                  ? child.securityLabel
                  : parent.type === "permit"
                    ? parent.securityLabel
                    : undefined,
              purpose:
                child.purpose && child.purpose.length > 0
                  ? child.purpose
                  : parent.type === "permit"
                    ? parent.purpose
                    : undefined,
              dataPeriod: child.dataPeriod ?? (parent.type === "permit" ? parent.dataPeriod : undefined),
              data: child.data && child.data.length > 0 ? child.data : parent.type === "permit" ? parent.data : undefined,
            }
          : {
              type: "deny",
              period: mergePeriods(parent.period, child.period),
              actor: child.actor,
              action: child.action,
              securityLabel: child.securityLabel,
              purpose: child.purpose,
              dataPeriod: child.dataPeriod,
              data: child.data,
            };

      const childRules = expandProvisionToRules(effectiveChild, defaultAction);
      if (childType === "permit") {
        permission.push(...childRules);
      } else {
        prohibition.push(...childRules);
      }

      if (child.provision && child.provision.length > 0) {
        visitChildren(effectiveChild, child.provision);
      }
    }
  };

  if (root.provision && root.provision.length > 0) {
    visitChildren(
      {
        type: rootType,
        period: root.period,
        actor: root.actor,
        action: root.action,
        securityLabel: root.securityLabel,
        purpose: root.purpose,
        dataPeriod: root.dataPeriod,
        data: root.data,
      },
      root.provision,
    );
  }

  // When a root `deny` carries nested `permit` exceptions (e.g. IHE PCF's
  // `ex-dissent-intermediate-break-glass`), ODRL's `odrl:perm` conflict
  // strategy lets the specific break-glass permission override the base
  // prohibition; otherwise `odrl:prohibit` lets nested `deny` exceptions
  // override a base `permit`.
  const hasNestedPermitUnderDeny = rootType === "deny" && permission.length > 0;
  const conflict = hasNestedPermitUnderDeny ? "odrl:perm" : FOLIO_DEFAULT_CONFLICT;

  return {
    "@context": ODRL_CONTEXT_URL,
    "@type": "Set",
    uid,
    profile,
    conflict,
    ...(assigner ? { assigner } : {}),
    permission,
    prohibition,
  };
}

// ── Decision Evaluation (`decide()` & `isConsentExpired()`) ────────────

export interface PcfRequestScope {
  "cat-harness:process"?: string;
  "cat-harness:task"?: string;
  "cat-harness:role"?: string;
  "odrl:purpose"?: string;
  purpose?: string;
  "odrl:dateTime"?: string;
  dateTime?: string;
  "odrl:elapsedTime"?: string | number;
  elapsedTime?: string | number;
  target?: string;
  "pcf:securityLabel"?: string | readonly string[];
  securityLabel?: string | readonly string[];
  "pcf:dataPeriod"?: string;
  dataPeriod?: string;
  dataDateTime?: string;
  "pcf:author"?: string;
  author?: string;
  "pcf:encounter"?: string;
  encounter?: string;
}

export interface PcfDecisionRequest {
  /** Requesting actor (FHIR reference such as `"Practitioner/ex-practitioner"`, DID, actor id, or `null`). */
  actor?: string | null;
  /** Roles the actor holds (or group memberships). */
  actorRoles?: readonly string[];
  /** Groups or organizations the actor belongs to (e.g. `["Group/ex-privilegedUsers"]`). */
  actorGroups?: readonly string[];
  /** Requested ODRL action (defaults to `"odrl:use"`). */
  action?: string;
  /** Request context: `purpose`, `dateTime`, `target`, `securityLabel`, `dataPeriod`, `author`, `encounter`. */
  scope?: PcfRequestScope;
  /** Convenience shorthand: top-level `purpose` when `scope.purpose` is not passed. */
  purpose?: string;
  /** Convenience shorthand: top-level `dateTime` when `scope.dateTime` is not passed. */
  dateTime?: string;
  /** Convenience shorthand: top-level `target` when `scope.target` is not passed. */
  target?: string;
  /** Convenience shorthand: top-level `securityLabel` when `scope.securityLabel` is not passed. */
  securityLabel?: string | readonly string[];
  /** Convenience shorthand: top-level `dataPeriod` / `dataDateTime` when `scope.dataPeriod` is not passed. */
  dataPeriod?: string;
  /** Convenience shorthand: top-level `author` when `scope.author` is not passed. */
  author?: string;
  /** Convenience shorthand: top-level `encounter` when `scope.encounter` is not passed. */
  encounter?: string;
}

export interface PcfDecideOptions {
  /**
   * Overarching implicit policy (`Policy-basic-normal`, `Policy-all-normal`,
   * `Policy-break-glass-only`, `Policy-deny`, or a custom `PcfOdrlSet`) used
   * when no active Consent is on file or when the Consent has expired (IHE PCF
   * Volume 1 §1:53.2.1 & §1:53.4.2.5).
   */
  implicitPolicy?: PcfOdrlSet | PcfImplicitPolicyAlias | string;
  /** Custom ODRL action graph (defaults to `ODRL_ACTIONS`). */
  actionGraph?: ActionGraph;
}

function parseBoundMs(dateStr: string, bound: "start" | "end" | "point"): number {
  const s = dateStr.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    return Date.parse(bound === "end" ? `${s}T23:59:59.999Z` : `${s}T00:00:00.000Z`);
  }
  return Date.parse(s);
}

/**
 * Whether a FHIR `Consent`'s root `provision.period` is outside `atDateTime`
 * (expired after `period.end` or not yet in effect before `period.start`).
 */
export function isConsentExpired(consent: FhirConsent, atDateTime?: string): boolean {
  const period = consent.provision?.period;
  if (!period || !atDateTime) return false;
  const nowMs = parseBoundMs(atDateTime, "point");
  if (Number.isNaN(nowMs)) return false;
  if (period.start) {
    const startMs = parseBoundMs(period.start, "start");
    if (!Number.isNaN(startMs) && nowMs < startMs) return true;
  }
  if (period.end) {
    const endMs = parseBoundMs(period.end, "end");
    if (!Number.isNaN(endMs) && nowMs > endMs) return true;
  }
  return false;
}

function normalizeScope(req: PcfDecisionRequest): PcfRequestScope {
  const base = req.scope ?? {};
  return {
    ...base,
    ...(base.purpose === undefined && base["odrl:purpose"] === undefined && req.purpose !== undefined
      ? { purpose: req.purpose }
      : {}),
    ...(base.dateTime === undefined && base["odrl:dateTime"] === undefined && req.dateTime !== undefined
      ? { dateTime: req.dateTime }
      : {}),
    ...(base.target === undefined && req.target !== undefined ? { target: req.target } : {}),
    ...(base.securityLabel === undefined &&
    base["pcf:securityLabel"] === undefined &&
    req.securityLabel !== undefined
      ? { securityLabel: req.securityLabel }
      : {}),
    ...(base.dataPeriod === undefined &&
    base["pcf:dataPeriod"] === undefined &&
    base.dataDateTime === undefined &&
    req.dataPeriod !== undefined
      ? { dataPeriod: req.dataPeriod }
      : {}),
    ...(base.author === undefined && base["pcf:author"] === undefined && req.author !== undefined
      ? { author: req.author }
      : {}),
    ...(base.encounter === undefined && base["pcf:encounter"] === undefined && req.encounter !== undefined
      ? { encounter: req.encounter }
      : {}),
  };
}

function canonicalLeftOperand(op: PcfLeftOperand): string {
  if (op === "purpose" || op === "dateTime" || op === "elapsedTime") return `odrl:${op}`;
  return op;
}

function canonicalOperator(op: PcfOperator): string {
  return op.startsWith("odrl:") ? op : `odrl:${op}`;
}

function readScopeOperand(
  leftOperand: PcfLeftOperand,
  scope: PcfRequestScope,
): string | number | readonly string[] | undefined {
  switch (canonicalLeftOperand(leftOperand)) {
    case "odrl:purpose":
      return scope["odrl:purpose"] ?? scope.purpose;
    case "odrl:dateTime":
      return scope["odrl:dateTime"] ?? scope.dateTime;
    case "odrl:elapsedTime":
      return scope["odrl:elapsedTime"] ?? scope.elapsedTime;
    case "pcf:securityLabel":
      return scope["pcf:securityLabel"] ?? scope.securityLabel;
    case "pcf:dataPeriod":
      return scope["pcf:dataPeriod"] ?? scope.dataPeriod ?? scope.dataDateTime;
    case "pcf:author":
      return scope["pcf:author"] ?? scope.author;
    case "pcf:encounter":
      return scope["pcf:encounter"] ?? scope.encounter;
    case "cat-harness:process":
      return scope["cat-harness:process"];
    case "cat-harness:task":
      return scope["cat-harness:task"];
    case "cat-harness:role":
      return scope["cat-harness:role"];
    default:
      return undefined;
  }
}

function compareNumbers(lhs: number, rhs: number, op: string): boolean {
  switch (op) {
    case "odrl:eq":
      return lhs === rhs;
    case "odrl:neq":
      return lhs !== rhs;
    case "odrl:lt":
      return lhs < rhs;
    case "odrl:lteq":
      return lhs <= rhs;
    case "odrl:gt":
      return lhs > rhs;
    case "odrl:gteq":
      return lhs >= rhs;
    default:
      return false;
  }
}

function evaluateConstraint(c: PcfOdrlConstraint, scope: PcfRequestScope): boolean {
  const raw = readScopeOperand(c.leftOperand, scope);
  if (raw === undefined) return false;
  const left = canonicalLeftOperand(c.leftOperand);
  const op = canonicalOperator(c.operator);
  const rhs = c.rightOperand;

  if (left === "odrl:purpose") {
    const v = String(raw);
    if (v.startsWith("dpv:") || v.includes("/dpv")) return false;
    const normV = normalizePurposeCode(v);
    if (op === "odrl:isA") {
      if (Array.isArray(rhs)) return false;
      const normRhs = normalizePurposeCode(rhs as string);
      if (!isKnownHl7PurposeOfUse(normV) || !isKnownHl7PurposeOfUse(normRhs)) return false;
      return broaderOrSelf(normV, PURPOSE_GRAPH).has(normRhs);
    }
    if (op === "odrl:eq") return !Array.isArray(rhs) && normV === normalizePurposeCode(rhs as string);
    if (op === "odrl:neq") return !Array.isArray(rhs) && normV !== normalizePurposeCode(rhs as string);
    if (op === "odrl:isAnyOf") {
      return Array.isArray(rhs) && rhs.map(normalizePurposeCode).includes(normV);
    }
    if (op === "odrl:isNoneOf") {
      if (!Array.isArray(rhs)) return false;
      const normList = rhs.map(normalizePurposeCode);
      if (isKnownHl7PurposeOfUse(normV)) {
        const ancestors = broaderOrSelf(normV, PURPOSE_GRAPH);
        return !normList.some((code) => ancestors.has(code));
      }
      return !normList.includes(normV);
    }
    return false;
  }

  if (left === "odrl:dateTime" || left === "pcf:dataPeriod") {
    if (Array.isArray(rhs)) return false;
    const boundKind =
      op === "odrl:lteq" || op === "odrl:lt" ? "end" : op === "odrl:gteq" || op === "odrl:gt" ? "start" : "point";
    const lhsMs = parseBoundMs(String(raw), "point");
    const rhsMs = parseBoundMs(rhs as string, boundKind);
    if (Number.isNaN(lhsMs) || Number.isNaN(rhsMs)) return false;
    return compareNumbers(lhsMs, rhsMs, op);
  }

  if (left === "pcf:securityLabel") {
    const tags = Array.isArray(raw) ? raw.map(String) : [String(raw)];
    if (op === "odrl:eq") {
      return !Array.isArray(rhs) && tags.includes(rhs as string);
    }
    if (op === "odrl:neq") {
      return !Array.isArray(rhs) && !tags.includes(rhs as string);
    }
    if (op === "odrl:isAnyOf") {
      return Array.isArray(rhs) && tags.some((t) => (rhs as readonly string[]).includes(t));
    }
    if (op === "odrl:isNoneOf") {
      return Array.isArray(rhs) && !tags.some((t) => (rhs as readonly string[]).includes(t));
    }
    return false;
  }

  const v = String(raw);
  switch (op) {
    case "odrl:eq":
      return !Array.isArray(rhs) && v === rhs;
    case "odrl:neq":
      return !Array.isArray(rhs) && v !== rhs;
    case "odrl:isAnyOf":
      return Array.isArray(rhs) && (rhs as readonly string[]).includes(v);
    case "odrl:isNoneOf":
      return Array.isArray(rhs) && !(rhs as readonly string[]).includes(v);
    default:
      return false;
  }
}

function actorMatchesAssignee(assignee: string, req: PcfDecisionRequest): boolean {
  if (assignee === ANYONE) return true;
  const who = req.actor;
  if (who && assignee === who) return true;
  if (req.actorGroups && req.actorGroups.includes(assignee)) return true;
  if (req.actorRoles && req.actorRoles.includes(assignee)) return true;
  return false;
}

type RuleOutcome = "permitted" | "violated" | "unknown" | "no-match";

function evaluatePermission(
  r: PcfOdrlRule,
  req: PcfDecisionRequest,
  action: string,
  scope: PcfRequestScope,
  graph: ActionGraph,
): RuleOutcome {
  if (!broaderOrSelf(action, graph).has(r.action)) return "no-match";

  let hasUnknown = false;

  if (r.assignee !== ANYONE) {
    const hasActor = (req.actor !== undefined && req.actor !== null) || Boolean(req.actorGroups?.length) || Boolean(req.actorRoles?.length);
    if (!hasActor) {
      hasUnknown = true;
    } else if (!actorMatchesAssignee(r.assignee, req)) {
      return "violated";
    }
  }

  if (r.target !== undefined) {
    if (scope.target === undefined) {
      hasUnknown = true;
    } else if (scope.target !== r.target) {
      return "violated";
    }
  }

  for (const c of r.constraint ?? []) {
    if (readScopeOperand(c.leftOperand, scope) === undefined) {
      hasUnknown = true;
    } else if (!evaluateConstraint(c, scope)) {
      return "violated";
    }
  }
  return hasUnknown ? "unknown" : "permitted";
}

function evaluateProhibition(
  r: PcfOdrlRule,
  req: PcfDecisionRequest,
  action: string,
  scope: PcfRequestScope,
  graph: ActionGraph,
): "prohibited" | "not-prohibited" | "unknown" {
  if (!broaderOrSelf(action, graph).has(r.action)) return "not-prohibited";

  let hasUnknown = false;

  if (r.assignee !== ANYONE) {
    const hasActor = (req.actor !== undefined && req.actor !== null) || Boolean(req.actorGroups?.length) || Boolean(req.actorRoles?.length);
    if (!hasActor) {
      hasUnknown = true;
    } else if (!actorMatchesAssignee(r.assignee, req)) {
      return "not-prohibited";
    }
  }

  if (r.target !== undefined) {
    if (scope.target === undefined) {
      hasUnknown = true;
    } else if (scope.target !== r.target) {
      return "not-prohibited";
    }
  }

  for (const c of r.constraint ?? []) {
    if (readScopeOperand(c.leftOperand, scope) === undefined) {
      hasUnknown = true;
    } else if (!evaluateConstraint(c, scope)) {
      return "not-prohibited";
    }
  }
  return hasUnknown ? "unknown" : "prohibited";
}

/** Evaluate a single PCF ODRL `Set` against a decision request. */
export function evaluatePcfPolicy(
  policy: PcfOdrlSet,
  req: PcfDecisionRequest,
  graph: ActionGraph = DEFAULT_ACTION_GRAPH,
): Decision {
  if (policy.permission.length === 0 && policy.prohibition.length === 0) {
    return "unknown";
  }

  const action = req.action ?? "odrl:use";
  const scope = normalizeScope(req);

  const permOutcomes = policy.permission.map((r) => evaluatePermission(r, req, action, scope, graph));
  const prohOutcomes = policy.prohibition.map((r) => evaluateProhibition(r, req, action, scope, graph));

  const permitted = permOutcomes.includes("permitted");
  const permViolated = permOutcomes.includes("violated");
  const permUnknown = permOutcomes.includes("unknown");

  const prohibited = prohOutcomes.includes("prohibited");
  const prohUnknown = prohOutcomes.includes("unknown");

  if (prohibited && permitted) {
    const strategy = policy.conflict ?? FOLIO_DEFAULT_CONFLICT;
    return strategy === "odrl:perm" ? "permit" : "deny";
  }
  if (prohibited) {
    // Under odrl:perm (e.g. dissent except for Break-Glass), if a permission
    // exception is still unknown due to missing scope, report unknown rather
    // than prematurely denying.
    if (policy.conflict === "odrl:perm" && permUnknown) return "unknown";
    return "deny";
  }
  if (prohUnknown && (permitted || policy.permission.length === 0)) {
    return "unknown";
  }
  if (permitted) {
    const role = scope["cat-harness:role"];
    if (role && req.actorRoles && req.actorRoles.length > 0 && !req.actorRoles.includes(role)) {
      return "deny";
    }
    return "permit";
  }
  if (permUnknown) return "unknown";
  if (permViolated) return "deny";
  return "unknown";
}

function resolveImplicitPolicy(
  implicit: PcfOdrlSet | PcfImplicitPolicyAlias | string | undefined,
): PcfOdrlSet | undefined {
  if (!implicit) return undefined;
  if (typeof implicit === "string") {
    const resolved = getImplicitPolicySet(implicit);
    if (!resolved) {
      throw new Error(`Unknown IHE PCF implicit policy URI or alias: "${implicit}"`);
    }
    return resolved;
  }
  return implicit;
}

function isFhirConsent(x: unknown): x is FhirConsent {
  return Boolean(x && typeof x === "object" && (x as { resourceType?: unknown }).resourceType === "Consent");
}

function isPcfOdrlSet(x: unknown): x is PcfOdrlSet {
  return Boolean(
    x &&
      typeof x === "object" &&
      "@type" in (x as Record<string, unknown>) &&
      Array.isArray((x as { permission?: unknown }).permission),
  );
}

export type ConsentOrPolicyInput =
  | FhirConsent
  | PcfOdrlSet
  | readonly (FhirConsent | PcfOdrlSet)[]
  | ReadonlyMap<string, FhirConsent | PcfOdrlSet>
  | null
  | undefined;

/**
 * Three-valued IHE PCF access-control decision (`"permit"` | `"deny"` | `"unknown"`)
 * over a FHIR `Consent`, a translated ODRL `Set`, a collection of Consents/Sets,
 * or `null`/`undefined` (with optional fallback to one of the four IHE PCF
 * Volume 1 §1:53.2.1 implicit-policy `Set`s).
 *
 * Per IHE PCF Volume 1 §1:53.2.2 & §1:53.4.2.5:
 * - When an active, non-expired `Consent` is present, its terms govern (and override
 *   any implicit policy).
 * - When no `Consent` is found, or its `status` is not `"active"`, or it has
 *   expired at the request's `dateTime`, `options.implicitPolicy` is enforced if
 *   configured; otherwise `"unknown"` is returned when no active Consent exists.
 */
export function decide(
  consentOrPolicy: ConsentOrPolicyInput,
  req: PcfDecisionRequest,
  options: PcfDecideOptions = {},
): Decision {
  const graph = options.actionGraph ?? DEFAULT_ACTION_GRAPH;
  const fallback = resolveImplicitPolicy(options.implicitPolicy);
  const scope = normalizeScope(req);
  const reqDateTime = scope["odrl:dateTime"] ?? scope.dateTime;

  const items: (FhirConsent | PcfOdrlSet)[] = [];
  if (consentOrPolicy === null || consentOrPolicy === undefined) {
    // empty
  } else if (consentOrPolicy instanceof Map) {
    for (const v of consentOrPolicy.values()) items.push(v);
  } else if (Array.isArray(consentOrPolicy)) {
    items.push(...consentOrPolicy);
  } else if (isFhirConsent(consentOrPolicy) || isPcfOdrlSet(consentOrPolicy)) {
    items.push(consentOrPolicy);
  }

  const activeSets: PcfOdrlSet[] = [];
  let hadExpiredActiveConsent = false;

  for (const item of items) {
    if (isFhirConsent(item)) {
      if (item.status !== "active") continue;
      if (reqDateTime && isConsentExpired(item, String(reqDateTime))) {
        hadExpiredActiveConsent = true;
        if (!fallback) {
          activeSets.push(consentToOdrl(item));
        }
        continue;
      }
      activeSets.push(consentToOdrl(item));
    } else if (isPcfOdrlSet(item)) {
      if (item.permission.length > 0 || item.prohibition.length > 0) {
        activeSets.push(item);
      }
    }
  }

  if (activeSets.length === 0) {
    if (fallback) {
      return evaluatePcfPolicy(fallback, req, graph);
    }
    return hadExpiredActiveConsent ? "deny" : "unknown";
  }

  let anyPermit = false;
  let anyUnknown = false;
  for (const set of activeSets) {
    const d = evaluatePcfPolicy(set, req, graph);
    if (d === "deny") return "deny";
    if (d === "permit") anyPermit = true;
    if (d === "unknown") anyUnknown = true;
  }
  if (anyPermit) return "permit";
  return anyUnknown ? "unknown" : "unknown";
}
