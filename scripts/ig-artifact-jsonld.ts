#!/usr/bin/env bun
/**
 * One JSON-LD node per FHIR IG artefact, from the artefact index — and the QA
 * check that the nodes a site publishes are the ones its index says.
 *
 * @module fhir-harness/scripts/ig-artifact-jsonld
 * @covers ig-artifact-jsonld, fhir-artifact-index — it reads the index and its `check` grades every node it writes
 *
 * Usage:
 *   bun run fhir-harness/scripts/ig-artifact-jsonld.ts write --index <index.json> --out <dir>
 *     [--base <site-root-url>] [--compiled-data <path from the docs root>]
 *   bun run fhir-harness/scripts/ig-artifact-jsonld.ts check --index <index.json> --dir <dir>
 *
 * ## Why here
 *
 * The owner, 2026-10-11, option A: IG artefact pages as *"tiny html w/ dynamic
 * load from json(ld) KG"*, as the OpenAPI operation pages already are. The
 * only per-artefact JSON-LD until now was written by an overlay one layer
 * up, which is WHO's and which a non-WHO IG may not depend on.
 * Nothing here is: the vocabulary is FHIR RDF's classes, Dublin Core,
 * schema.org and PROV (`schemas/ig-artifact-jsonld.ts` says which term says
 * what), and the input is `fhir-artifact-index`, which any IG has.
 *
 * ## Where the nodes go
 *
 * Beside the pages that render them, `<docs>/artifact/<Type>-<id>.jsonld`,
 * with a `.json` twin because GitHub Pages serves no JSON-LD media type (the
 * `todo-graph` and OpenAPI precedent). `gen-ig-pages.ts --thin` writes them
 * with the pages; this CLI writes them alone, and checks a built site.
 *
 * ## IRIs
 *
 * With `--base`, each `@id` is absolute: `<base>artifact/<Type>-<id>.jsonld`.
 * Without it the `@id` is the file's own name, which a JSON-LD processor
 * resolves against the document's URL — the same node wherever the site is
 * served, a staging preview included. Every `schema:contentUrl` follows the
 * same rule.
 *
 * Nothing here may know about WHO (fhir-harness/AGENTS.md).
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, posix, resolve } from "node:path";

import { FhirArtifactIndexSchema, type FhirArtifact, type FhirArtifactIndex } from "../schemas/fhir-artifact-index.js";
import {
  FHIR_JSON,
  IG_ARTIFACT_JSONLD_CONTEXT,
  IG_ARTIFACT_JSONLD_SCHEMA_TAG,
  IgArtifactJsonLdSchema,
  type IgArtifactEncoding,
  type IgArtifactJsonLd,
} from "../schemas/ig-artifact-jsonld.js";

/** The directory under the docs root the artefact pages and nodes share. */
export const ARTIFACT_DIR = "artifact";

/** A filesystem-safe page name for an artefact key (`ValueSet/Actors` → `ValueSet-Actors`) — `gen-ig-pages`' own. */
export function artifactPageName(a: Pick<FhirArtifact, "resourceType" | "id">): string {
  return `${a.resourceType}-${a.id}`.replace(/[^A-Za-z0-9._-]/g, "_");
}

export interface JsonLdOptions {
  /** The docs root's absolute URL, ending in `/`. Absent: every IRI is relative to the node's own file. */
  base?: string;
  /**
   * Where a compiled index's resource files are served, as a path from the
   * docs root (`gen-ig-pages --compiled-data`, e.g. `../ast-data`). Absent: no
   * local copy is claimed.
   */
  compiledData?: string;
}

/** The served path of a compiled copy, relative to an artefact page or node, or undefined. */
export function localResourceHref(a: FhirArtifact, compiledData: string | undefined): string | undefined {
  const m = a.materialization;
  if (!compiledData || m.state !== "materialized" || m.purpose !== "compiled" || !m.localPath) return undefined;
  // `artifact/X.jsonld` → the docs root is `../`; the served tree mirrors the
  // AST directory, so its own name is dropped (as `compiledResourceSection`).
  return `../${compiledData.replace(/\/+$/, "")}/${m.localPath.replace(/^[^/]+\//, "")}`;
}

/** `href`, relative to `artifact/<file>`, as an IRI: absolute under `base`, else as written. */
function iriFor(href: string, base: string | undefined): string {
  return base ? new URL(href, new URL(`${ARTIFACT_DIR}/`, base)).href : href;
}

/** The node for one artefact. Deterministic: the same index gives the same bytes. */
export function artifactJsonLd(ix: FhirArtifactIndex, a: FhirArtifact, o: JsonLdOptions = {}): IgArtifactJsonLd {
  const file = `${artifactPageName(a)}.jsonld`;
  const encodings: IgArtifactEncoding[] = [];
  const local = localResourceHref(a, o.compiledData);
  if (local) {
    encodings.push({ "@type": "schema:MediaObject", "schema:contentUrl": { "@id": iriFor(local, o.base) }, "schema:encodingFormat": FHIR_JSON, "dcterms:source": "local" });
  }
  // The upstream files, where the IG publishes them. The html is the
  // Publisher's page, which this node does not point at: the page that renders
  // this node is the html, and the node names no rendering.
  for (const [k, type] of [["json", FHIR_JSON], ["xml", "application/fhir+xml"], ["ttl", "text/turtle"]] as const) {
    const r = a.published[k];
    if (r) encodings.push({ "@type": "schema:MediaObject", "schema:contentUrl": { "@id": r.url }, "schema:encodingFormat": type, "dcterms:source": "upstream" });
  }
  const m = a.materialization;
  const inputs = m.state === "materialized" && m.purpose === "compiled" ? m.inputs : undefined;
  const node: IgArtifactJsonLd = {
    "@context": { ...IG_ARTIFACT_JSONLD_CONTEXT },
    $schema: IG_ARTIFACT_JSONLD_SCHEMA_TAG,
    "@id": iriFor(file, o.base),
    "@type": `fhir:${a.resourceType}`,
    "dcterms:identifier": a.key,
    ...(a.name ? { "schema:name": a.name } : {}),
    ...(a.title ? { "dcterms:title": a.title } : {}),
    ...(a.description ? { "dcterms:description": a.description } : {}),
    ...(a.version ? { "schema:version": a.version } : {}),
    ...(a.category ? { "dcterms:type": a.category } : {}),
    ...(a.canonical ? { "schema:sameAs": { "@id": a.canonical } } : {}),
    "schema:creativeWorkStatus": m.state === "materialized" ? "materialized" : "referenced",
    "schema:encoding": encodings,
    ...(inputs ? { "prov:wasGeneratedBy": { "@type": "prov:Activity" as const, "schema:instrument": inputs.toolchain, "prov:used": inputs.sourceRevision } } : {}),
    "dcterms:isPartOf": {
      "@type": "fhir:ImplementationGuide",
      ...(ix.packageId ? { "dcterms:identifier": ix.packageId } : {}),
      ...(ix.version ? { "schema:version": ix.version } : {}),
      ...(ix.canonicalBase ? { "schema:sameAs": { "@id": ix.canonicalBase } } : {}),
    },
  };
  return node;
}

/** Every file a run writes, keyed by its path under the docs root: `<page>.jsonld` and its `.json` twin. */
export function artifactJsonLdFiles(ix: FhirArtifactIndex, o: JsonLdOptions = {}): Map<string, string> {
  const out = new Map<string, string>();
  for (const a of ix.artifacts) {
    const text = `${JSON.stringify(artifactJsonLd(ix, a, o), null, 2)}\n`;
    const stem = posix.join(ARTIFACT_DIR, artifactPageName(a));
    out.set(`${stem}.jsonld`, text);
    out.set(`${stem}.json`, text);
  }
  return out;
}

/**
 * QA over a BUILT docs root: what a reader's browser will fetch, judged
 * against the index it was written from. Beyond shape:
 *
 * - every artefact has its node, and no node names an artefact the index lacks;
 * - each node's key, type and `@id` are its own file's (a node copied to the
 *   wrong name would render another artefact's page);
 * - its `.json` twin is byte-identical;
 * - every LOCAL `schema:contentUrl` resolves to a file under the site — the
 *   resource the page will draw. An upstream URL is not fetched: this check
 *   runs without the network, and says so.
 *
 * Returns the findings; empty is a pass.
 */
export function checkArtifactJsonLd(ix: FhirArtifactIndex, docsRoot: string): string[] {
  const dir = join(docsRoot, ARTIFACT_DIR);
  const findings: string[] = [];
  if (!existsSync(dir)) return [`${dir} does not exist — no node was written, and that is not a pass`];
  const want = new Map(ix.artifacts.map((a) => [`${artifactPageName(a)}.jsonld`, a]));
  const have = readdirSync(dir).filter((f) => f.endsWith(".jsonld"));
  for (const f of have) if (!want.has(f)) findings.push(`${ARTIFACT_DIR}/${f}: an orphan — no artefact in the index has this name`);
  for (const [f, a] of want) {
    const p = join(dir, f);
    if (!existsSync(p)) {
      findings.push(`${ARTIFACT_DIR}/${f}: missing — ${a.key} has no node`);
      continue;
    }
    const text = readFileSync(p, "utf8");
    const twin = p.replace(/\.jsonld$/, ".json");
    if (!existsSync(twin) || readFileSync(twin, "utf8") !== text) findings.push(`${ARTIFACT_DIR}/${f}: its .json twin is missing or differs`);
    let raw: unknown;
    try {
      raw = JSON.parse(text);
    } catch (e) {
      findings.push(`${ARTIFACT_DIR}/${f}: not JSON (${(e as Error).message})`);
      continue;
    }
    const parsed = IgArtifactJsonLdSchema.safeParse(raw);
    if (!parsed.success) {
      findings.push(`${ARTIFACT_DIR}/${f}: ${parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}`);
      continue;
    }
    const n = parsed.data;
    if (n["dcterms:identifier"] !== a.key) findings.push(`${ARTIFACT_DIR}/${f}: names ${n["dcterms:identifier"]}, but the file is ${a.key}'s`);
    if (!n["@id"].endsWith(`/${f}`) && n["@id"] !== f) findings.push(`${ARTIFACT_DIR}/${f}: its @id ${n["@id"]} is not its own address`);
    for (const e of n["schema:encoding"]) {
      if (e["dcterms:source"] !== "local") continue;
      const url = e["schema:contentUrl"]["@id"];
      // Relative to the node, or absolute under the node's own @id's base:
      // either way the path from the node's directory decides.
      const rel = /^[a-z][a-z0-9+.-]*:/i.test(url) && /^[a-z][a-z0-9+.-]*:/i.test(n["@id"])
        ? posix.relative(posix.dirname(new URL(n["@id"]).pathname), new URL(url).pathname)
        : url;
      const target = resolve(dir, decodeURI(rel));
      if (!existsSync(target)) findings.push(`${ARTIFACT_DIR}/${f}: its resource ${url} is not on the site (${target})`);
    }
  }
  return findings;
}

function readIndex(path: string): FhirArtifactIndex {
  const parsed = FhirArtifactIndexSchema.safeParse(JSON.parse(readFileSync(path, "utf8")));
  if (!parsed.success) {
    throw new Error(`${path} is not a valid artefact index: ${parsed.error.issues.slice(0, 3).map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}`);
  }
  return parsed.data;
}

if (import.meta.main) {
  const argv = process.argv.slice(2);
  const at = (flag: string): string | undefined => {
    const i = argv.indexOf(flag);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  const cmd = argv[0];
  const index = at("--index");
  if ((cmd !== "write" && cmd !== "check") || !index) {
    console.error("usage: ig-artifact-jsonld.ts write --index <index.json> --out <docs-root> [--base <url>] [--compiled-data <path>]\n       ig-artifact-jsonld.ts check --index <index.json> --dir <docs-root>");
    process.exit(2);
  }
  const ix = readIndex(resolve(index));
  if (cmd === "write") {
    const out = at("--out");
    if (!out) {
      console.error("write needs --out <docs-root>");
      process.exit(2);
    }
    const base = at("--base");
    const files = artifactJsonLdFiles(ix, { ...(base ? { base: base.endsWith("/") ? base : `${base}/` } : {}), ...(at("--compiled-data") ? { compiledData: at("--compiled-data")! } : {}) });
    for (const [rel, text] of files) {
      const p = join(resolve(out), rel);
      mkdirSync(dirname(p), { recursive: true });
      writeFileSync(p, text);
    }
    console.log(`wrote ${files.size / 2} artefact node(s) (.jsonld + .json) under ${join(out, ARTIFACT_DIR)}/`);
  } else {
    const dir = at("--dir");
    if (!dir) {
      console.error("check needs --dir <docs-root>");
      process.exit(2);
    }
    const findings = checkArtifactJsonLd(ix, resolve(dir));
    if (findings.length) {
      console.error(`✗ ${findings.length} finding(s) over ${ix.count} artefact node(s):`);
      for (const f of findings.slice(0, 20)) console.error(`    ${f}`);
      if (findings.length > 20) console.error(`    …and ${findings.length - 20} more`);
      process.exit(1);
    }
    console.log(`✓ ${ix.count} artefact node(s) current, each with its resource on the site (upstream URLs not fetched)`);
  }
}
