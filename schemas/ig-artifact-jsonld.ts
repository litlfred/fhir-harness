/**
 * One FHIR IG artefact as a JSON-LD node — the asset an artefact's thin page
 * renders (`kg-viewer` rule 3: one IRI per asset, its page a separate
 * resource that loads it).
 *
 * @module fhir-harness/schemas/ig-artifact-jsonld
 * @covers ig-artifact-jsonld
 *
 * ## Borrowed vocabularies, nothing minted
 *
 * Owner, 2026-10-11 (option A): *"tiny html w/ dynamic load from json(ld)
 * KG"*, with the JSON-LD free of anything WHO's (fhir-harness/AGENTS.md).
 *
 * | term | what it says |
 * |---|---|
 * | `@type` `fhir:<resourceType>` | the FHIR RDF class (`http://hl7.org/fhir/`), as FHIR's own Turtle types a resource |
 * | `dcterms:identifier` | the index key, `<resourceType>/<id>` |
 * | `schema:name`, `dcterms:title`, `dcterms:description`, `schema:version` | the resource's own `name`, `title`, `description`, `version` |
 * | `dcterms:type` | the Publisher's `artifacts.html` grouping |
 * | `schema:sameAs` | the FHIR canonical URL: the artefact's identity, never where its bytes are |
 * | `schema:encoding` | each representation as a `schema:MediaObject` (`schema:contentUrl`, `schema:encodingFormat`) |
 * | `schema:creativeWorkStatus` | `materialized` or `referenced`, the index's own two states |
 * | `prov:wasGeneratedBy` | for a compiled copy, the toolchain (`schema:instrument`) and the revision it built (`prov:used`) |
 * | `dcterms:isPartOf` | the IG, by package id, version and canonical base |
 *
 * FHIR RDF is used for the CLASS only. Its property shape (`fhir:url [ fhir:v
 * "…" ]`) describes a whole resource, which this node deliberately is not:
 * the resource's bytes are one of its `schema:encoding`s, and the page fetches
 * them. A node that restated half a resource in FHIR RDF would be a second,
 * partial copy that could disagree with the first.
 *
 * The node carries NO link to its renderings: the page points at the node,
 * never the other way round (`thin-page.ts`).
 *
 * `$schema` names the family for `check:kind-validators`. It is not a term
 * of the context, so a JSON-LD processor drops it on expansion and it adds no
 * triple.
 */
import { z } from "zod";

export const IG_ARTIFACT_JSONLD_SCHEMA_TAG = "folio-ig-artifact-jsonld/v1";

export const IG_ARTIFACT_JSONLD_CONTEXT = {
  fhir: "http://hl7.org/fhir/",
  dcterms: "http://purl.org/dc/terms/",
  schema: "https://schema.org/",
  prov: "http://www.w3.org/ns/prov#",
} as const;

/** The media type FHIR registers for its JSON. */
export const FHIR_JSON = "application/fhir+json";

const IdRef = z.object({ "@id": z.string().min(1) }).strict();

export const IgArtifactEncodingSchema = z
  .object({
    "@type": z.literal("schema:MediaObject"),
    "schema:contentUrl": IdRef,
    "schema:encodingFormat": z.string().min(1),
    /** `local`: a copy this site serves; `upstream`: the file where the IG publishes it. */
    "dcterms:source": z.enum(["local", "upstream"]),
  })
  .strict();
export type IgArtifactEncoding = z.infer<typeof IgArtifactEncodingSchema>;

export const IgArtifactJsonLdSchema = z
  .object({
    "@context": z.object({ fhir: z.literal(IG_ARTIFACT_JSONLD_CONTEXT.fhir), dcterms: z.string(), schema: z.string(), prov: z.string() }).strict(),
    $schema: z.literal(IG_ARTIFACT_JSONLD_SCHEMA_TAG),
    "@id": z.string().min(1),
    "@type": z.string().regex(/^fhir:[A-Z][A-Za-z]+$/, "a FHIR RDF class, fhir:<ResourceType>"),
    "dcterms:identifier": z.string().regex(/^[A-Z][A-Za-z]+\/[A-Za-z0-9\-.]{1,64}$/, "<resourceType>/<id>"),
    "schema:name": z.string().min(1).optional(),
    "dcterms:title": z.string().min(1).optional(),
    "dcterms:description": z.string().min(1).optional(),
    "schema:version": z.string().min(1).optional(),
    "dcterms:type": z.string().min(1).optional(),
    "schema:sameAs": IdRef.optional(),
    "schema:creativeWorkStatus": z.enum(["materialized", "referenced"]),
    "schema:encoding": z.array(IgArtifactEncodingSchema),
    "prov:wasGeneratedBy": z
      .object({
        "@type": z.literal("prov:Activity"),
        "schema:instrument": z.string().min(1),
        "prov:used": z.string().min(1),
      })
      .strict()
      .optional(),
    "dcterms:isPartOf": z
      .object({
        "@type": z.literal("fhir:ImplementationGuide"),
        "dcterms:identifier": z.string().min(1).optional(),
        "schema:version": z.string().min(1).optional(),
        "schema:sameAs": IdRef.optional(),
      })
      .strict(),
  })
  .strict()
  .superRefine((n, ctx) => {
    // The type and the key are two statements of one fact; a node whose two
    // disagree is a generator bug, not a choice.
    if (n["@type"] !== `fhir:${n["dcterms:identifier"].split("/")[0]}`) {
      ctx.addIssue({ code: "custom", path: ["@type"], message: `${n["@type"]} does not match the key ${n["dcterms:identifier"]}` });
    }
  });
export type IgArtifactJsonLd = z.infer<typeof IgArtifactJsonLdSchema>;
