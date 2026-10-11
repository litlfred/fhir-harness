/**
 * The thin IG artefact pages and the JSON-LD node each one renders (owner,
 * 2026-10-11, option A: "tiny html w/ dynamic load from json(ld) KG").
 *
 * Over a non-WHO IG (`ig-fixture.ts`): the node's shape and vocabulary, the
 * kind's QA check failing on each defect it names, and `gen-ig-pages --thin`
 * writing real files into a scratch repository, beside a run without the flag
 * that must be unchanged.
 *
 * Calibrated: each `checkArtifactJsonLd` case below breaks one thing in a site
 * that passes, and asserts the finding names it.
 *
 * @module fhir-harness/scripts/ig-thin-pages.test
 */
import { afterAll, describe, expect, it } from "bun:test";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";

import { FhirArtifactIndexSchema, type FhirArtifactIndex } from "../schemas/fhir-artifact-index.js";
import { IG_ARTIFACT_JSONLD_SCHEMA_TAG, IgArtifactJsonLdSchema } from "../schemas/ig-artifact-jsonld.js";
import { IPS, artifactIndex, scratchRepo } from "../test/support/ig-fixture";
import { artifactJsonLd, artifactJsonLdFiles, checkArtifactJsonLd } from "./ig-artifact-jsonld.ts";
import { THIN_PAGE_CONFIG_ID, thinArtifactPage } from "./ig-thin-pages.ts";
import { thinPageConfigOf } from "../../cat-harness-tools/scripts/thin-page.ts";

const ROOT = resolve(import.meta.dir, "..", "..");
const SCRIPT = join(ROOT, "fhir-harness/scripts/gen-ig-pages.ts");
const RESOURCE = "output-ast/resources/StructureDefinition/Composition-uv-ips--7ae5e8a1.json";

/** IPS's index with its one profile made a compiled copy, and a second, referenced one. */
function compiledIndex(id: string): Record<string, unknown> {
  const ix = artifactIndex(IPS, id) as { artifacts: Record<string, unknown>[]; count: number };
  const [composition] = ix.artifacts;
  const page = `${IPS.published}/StructureDefinition-Patient-uv-ips`;
  ix.artifacts.push({
    ...composition,
    key: "StructureDefinition/Patient-uv-ips",
    id: "Patient-uv-ips",
    published: { json: { url: `${page}.json` }, html: { url: `${page}.html` } },
    materialization: { state: "referenced", provenance: { upstream: `${page}.html` } },
    canonical: `${IPS.canonical}/StructureDefinition/Patient-uv-ips`,
    name: "PatientUvIps",
    title: "Patient (IPS)",
  });
  ix.count = ix.artifacts.length;
  composition.materialization = {
    state: "materialized",
    provenance: { upstream: `${IPS.published}/StructureDefinition-Composition-uv-ips.html`, local: "x.json" },
    localPath: RESOURCE,
    gates: Object.fromEntries(["size", "restrictions", "retention", "sourceLoss", "copyright"].map((g) => [g, { verdict: "unknown", basis: "test" }])),
    purpose: "compiled",
    inputs: { toolchain: "ig-publisher test", sourceRevision: "a".repeat(40) },
  };
  return ix;
}

const IX: FhirArtifactIndex = FhirArtifactIndexSchema.parse(compiledIndex("ips"));
const [COMPOSITION, PATIENT] = IX.artifacts as [FhirArtifactIndex["artifacts"][0], FhirArtifactIndex["artifacts"][0]];

describe("ig-artifact-jsonld: one node per artefact, in borrowed vocabularies", () => {
  it("a compiled artefact: FHIR RDF class, key, canonical as sameAs, the local copy, and PROV", () => {
    const n = artifactJsonLd(IX, COMPOSITION, { compiledData: "ast-data" });
    expect(IgArtifactJsonLdSchema.safeParse(n).success).toBe(true);
    expect(n.$schema).toBe(IG_ARTIFACT_JSONLD_SCHEMA_TAG);
    expect(n["@type"]).toBe("fhir:StructureDefinition");
    expect(n["@context"].fhir).toBe("http://hl7.org/fhir/");
    expect(n["dcterms:identifier"]).toBe("StructureDefinition/Composition-uv-ips");
    expect(n["schema:sameAs"]).toEqual({ "@id": `${IPS.canonical}/StructureDefinition/Composition-uv-ips` });
    // Relative to the node's own file, which is the same directory as its page.
    expect(n["@id"]).toBe("StructureDefinition-Composition-uv-ips.jsonld");
    const local = n["schema:encoding"].filter((e) => e["dcterms:source"] === "local");
    expect(local.map((e) => e["schema:contentUrl"]["@id"])).toEqual(["../ast-data/resources/StructureDefinition/Composition-uv-ips--7ae5e8a1.json"]);
    expect(n["prov:wasGeneratedBy"]).toEqual({ "@type": "prov:Activity", "schema:instrument": "ig-publisher test", "prov:used": "a".repeat(40) });
    expect(n["dcterms:isPartOf"]["dcterms:identifier"]).toBe(IPS.packageId);
  });

  it("with a base: every IRI is absolute under the docs root", () => {
    const n = artifactJsonLd(IX, COMPOSITION, { base: "https://example.org/ig/", compiledData: "ast-data" });
    expect(n["@id"]).toBe("https://example.org/ig/artifact/StructureDefinition-Composition-uv-ips.jsonld");
    expect(n["schema:encoding"][0]!["schema:contentUrl"]["@id"]).toBe("https://example.org/ig/ast-data/resources/StructureDefinition/Composition-uv-ips--7ae5e8a1.json");
  });

  it("a referenced artefact names only its upstream files, and no node links its rendering", () => {
    const n = artifactJsonLd(IX, PATIENT, { compiledData: "ast-data" });
    expect(n["schema:creativeWorkStatus"]).toBe("referenced");
    expect(n["schema:encoding"].every((e) => e["dcterms:source"] === "upstream")).toBe(true);
    expect(n["prov:wasGeneratedBy"]).toBeUndefined();
    expect(JSON.stringify(n)).not.toContain(".html");
  });

  it("the schema refuses a node whose type and key disagree", () => {
    const n = { ...artifactJsonLd(IX, COMPOSITION), "@type": "fhir:ValueSet" };
    expect(IgArtifactJsonLdSchema.safeParse(n).success).toBe(false);
  });

  it("nothing in the node is WHO's", () => {
    const text = [...artifactJsonLdFiles(IX).values()].join("\n");
    expect(text).not.toMatch(/who\.int|smart-base|\bDAK\b/i);
  });
});

/** A built docs root: the nodes, and the resource where the node says it is served. */
function builtSite(): string {
  const root = mkdtempSync(join(tmpdir(), "fhir-harness-thin-"));
  for (const [rel, text] of artifactJsonLdFiles(IX, { compiledData: "ast-data" })) {
    mkdirSync(dirname(join(root, rel)), { recursive: true });
    writeFileSync(join(root, rel), text);
  }
  const res = join(root, "ast-data", RESOURCE.replace(/^[^/]+\//, ""));
  mkdirSync(dirname(res), { recursive: true });
  writeFileSync(res, "{}");
  return root;
}

describe("ig-artifact-jsonld check: the kind's QA, beyond shape", () => {
  const sites: string[] = [];
  const site = () => {
    const s = builtSite();
    sites.push(s);
    return s;
  };
  afterAll(() => sites.forEach((s) => rmSync(s, { recursive: true, force: true })));
  const node = (s: string, a = COMPOSITION) => join(s, "artifact", `${a.resourceType}-${a.id}.jsonld`);

  it("passes on what it wrote", () => {
    expect(checkArtifactJsonLd(IX, site())).toEqual([]);
  });
  it("fails on a missing node", () => {
    const s = site();
    unlinkSync(node(s, PATIENT));
    expect(checkArtifactJsonLd(IX, s).join("\n")).toContain("StructureDefinition/Patient-uv-ips has no node");
  });
  it("fails on an orphan", () => {
    const s = site();
    cpSync(node(s), join(s, "artifact", "ValueSet-gone.jsonld"));
    expect(checkArtifactJsonLd(IX, s).join("\n")).toContain("ValueSet-gone.jsonld: an orphan");
  });
  it("fails on a node copied to another artefact's name", () => {
    const s = site();
    cpSync(node(s, PATIENT), node(s));
    cpSync(node(s, PATIENT).replace(/\.jsonld$/, ".json"), node(s).replace(/\.jsonld$/, ".json"));
    expect(checkArtifactJsonLd(IX, s).join("\n")).toMatch(/names StructureDefinition\/Patient-uv-ips, but the file is StructureDefinition\/Composition-uv-ips's/);
  });
  it("fails when the .json twin differs", () => {
    const s = site();
    writeFileSync(node(s).replace(/\.jsonld$/, ".json"), "{}");
    expect(checkArtifactJsonLd(IX, s).join("\n")).toContain("twin is missing or differs");
  });
  it("fails when the resource the page will draw is not on the site", () => {
    const s = site();
    rmSync(join(s, "ast-data"), { recursive: true });
    expect(checkArtifactJsonLd(IX, s).join("\n")).toContain("is not on the site");
  });
  it("fails when nothing was written, rather than passing over nothing", () => {
    const s = mkdtempSync(join(tmpdir(), "fhir-harness-thin-empty-"));
    sites.push(s);
    expect(checkArtifactJsonLd(IX, s).join("\n")).toContain("that is not a pass");
  });
});

describe("thinArtifactPage: identity and a pointer, nothing of the artefact's content", () => {
  const html = thinArtifactPage(IX, COMPOSITION, { label: "IPS", home: "../index.html", all: "../artifacts.html", prev: "../", next: "StructureDefinition-Patient-uv-ips.html", compiledData: "ast-data" });

  it("names itself by its file, and the node as its alternate", () => {
    expect(html).toContain('<link rel="canonical" href="StructureDefinition-Composition-uv-ips.html">');
    expect(html).toContain('<link rel="alternate" type="application/ld+json" href="StructureDefinition-Composition-uv-ips.jsonld">');
  });
  it("links the rail rather than inlining it", () => {
    expect(html).toContain('<meta name="folio-navbar" content="linked">');
    expect(html).not.toContain('class="fa-nav"');
  });
  it("its config names the node, the loaders and the reading order", () => {
    const cfg = thinPageConfigOf(html, THIN_PAGE_CONFIG_ID)!;
    expect(cfg.node).toBe("StructureDefinition-Composition-uv-ips.jsonld");
    expect(cfg.astLoader).toBe("../assets/ast-resource.js");
    expect(cfg.prev).toBe("../");
    expect(cfg.next).toBe("StructureDefinition-Patient-uv-ips.html");
    expect(cfg.published).toBe(`${IPS.published}/`);
  });
  it("a reader without JavaScript is sent to the node and the resource", () => {
    expect(html).toMatch(/<noscript>.*href="StructureDefinition-Composition-uv-ips\.jsonld".*href="\.\.\/ast-data\/resources\/StructureDefinition\/Composition-uv-ips--7ae5e8a1\.json"/s);
  });
  it("holds no description, version or canonical: those are the node's", () => {
    expect(html).not.toContain("A fixture profile.");
    expect(html).not.toContain(`${IPS.canonical}/StructureDefinition`);
  });
  it("is small", () => {
    expect(html.length).toBeLessThan(3000);
  });
});

describe("the shared renderer", () => {
  it("parses as a script", () => {
    const src = readFileSync(join(import.meta.dir, "templates", "ig-pages", "ig-artifact.js"), "utf8");
    expect(() => new Function(src)).not.toThrow();
    // It reads its own config block, the id the pages write.
    expect(src).toContain(`getElementById("${THIN_PAGE_CONFIG_ID}")`);
  });
});

describe("gen-ig-pages --thin, end to end", () => {
  const repo = scratchRepo({ thin: { index: compiledIndex("thin") }, fat: { index: compiledIndex("fat") } });
  afterAll(() => rmSync(repo, { recursive: true, force: true }));
  const run = (instance: string, ...args: string[]) => {
    const r = Bun.spawnSync(["bun", "run", SCRIPT, "--instance", join(repo, instance), "--label", "IPS", "--compiled-data", "ast-data", ...args], { cwd: ROOT });
    if (r.exitCode !== 0) throw new Error(`gen-ig-pages failed for ${instance}:\n${r.stderr.toString()}`);
  };
  run("thin", "--thin");
  run("fat");
  const docs = (i: string) => join(repo, i, "docs");

  it("writes each artefact page as a thin .html at the full page's address, with its node beside it", () => {
    const art = readdirSync(join(docs("thin"), "artifact")).sort();
    expect(art).toEqual([
      "StructureDefinition-Composition-uv-ips.html",
      "StructureDefinition-Composition-uv-ips.json",
      "StructureDefinition-Composition-uv-ips.jsonld",
      "StructureDefinition-Patient-uv-ips.html",
      "StructureDefinition-Patient-uv-ips.json",
      "StructureDefinition-Patient-uv-ips.jsonld",
    ]);
    for (const f of ["ig-artifact.js", "ig-artifact.css", "ast-resource.js", "ast-pages.json"]) expect(existsSync(join(docs("thin"), "assets", f))).toBe(true);
    const page = readFileSync(join(docs("thin"), "artifact", "StructureDefinition-Composition-uv-ips.html"), "utf8");
    expect(page.startsWith("<!doctype html>")).toBe(true);
    expect(page.length).toBeLessThan(3000);
    // The reading order survives: the first artefact's next is the second.
    expect(thinPageConfigOf(page, THIN_PAGE_CONFIG_ID)!.next).toBe("StructureDefinition-Patient-uv-ips.html");
  });

  it("its nodes pass the kind's QA once the resource is served", () => {
    const ix = FhirArtifactIndexSchema.parse(JSON.parse(readFileSync(join(repo, "thin", "fhir-artifact-index", "index.json"), "utf8")));
    const res = join(docs("thin"), "ast-data", RESOURCE.replace(/^[^/]+\//, ""));
    mkdirSync(dirname(res), { recursive: true });
    writeFileSync(res, "{}");
    expect(checkArtifactJsonLd(ix, docs("thin"))).toEqual([]);
  });

  it("without --thin nothing changes: full .md pages, no nodes, no renderer", () => {
    const art = readdirSync(join(docs("fat"), "artifact"));
    expect(art.every((f) => f.endsWith(".md"))).toBe(true);
    expect(existsSync(join(docs("fat"), "assets", "ig-artifact.js"))).toBe(false);
  });
});
