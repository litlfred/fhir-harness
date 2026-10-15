/**
 * The IG site's search box and its index (owner, 2026-10-15, layout "C": "add
 * a search box to the IG top bar", searching the IG's pages and artefacts),
 * and the language picker's block on the built pages (owner, same day: "what
 * happened to search/language select at top of display window?").
 *
 * @module fhir-harness/scripts/ig-search.test
 */
import { describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { runInNewContext } from "node:vm";

import { composeIgSite, IG_TOPBAR_CSS, igSearchAt, igTopBar } from "./build-ig-site";
import {
  artifactSearchEntries,
  IG_SEARCH_CSS,
  IG_SEARCH_FORMAT,
  IG_SEARCH_INDEX_FILE,
  IG_SEARCH_SCRIPT_FILE,
  IG_SEARCH_SCRIPT_SOURCE,
  igSearchBox,
  igSearchIndex,
  pageSearchEntries,
  plainText,
} from "./ig-search.ts";
import { THIN_PAGE_STYLE, thinArtifactView, thinIndexPage } from "./ig-thin-pages.ts";
import { stampTranslationMeta, writeSearch } from "./ig-repo-site.ts";
import type { FhirArtifact, FhirArtifactIndex } from "../schemas/fhir-artifact-index.js";

const tmp = (p: string) => mkdtempSync(join(tmpdir(), p));
const put = (root: string, rel: string, text: string) => {
  mkdirSync(dirname(join(root, rel)), { recursive: true });
  writeFileSync(join(root, rel), text);
};

const REF = { index: "../assets/ig-search.json", script: "../assets/ig-search.js" };

describe("the box", () => {
  const box = igSearchBox(REF, "ACME IG");

  test("carries #search-input, labelled, and names its index", () => {
    expect(box).toContain('id="search-input"');
    expect(box).toContain('<label class="ig-search-label" for="search-input">Search ACME IG</label>');
    expect(box).toContain('data-ig-search-index="../assets/ig-search.json"');
  });

  test("is not `.search`, which docs-ui would move out of the top bar into its band", () => {
    expect(box).not.toMatch(/class="search\b|id="search"/);
  });

  test("holds no <div>: a composed page lifts the top bar up to its first </div> at a line end", () => {
    expect(box).not.toContain("<div");
  });
});

describe("the top bar carries the box and its script only when the site serves the search", () => {
  const menu = { groups: [{ label: "Home", items: [{ label: "Summary", href: "index.html" }] }] };

  test("with search: the box and the deferred script, at the site's own paths, inside the bar", () => {
    const bar = igTopBar(menu, "/b/acme-ig", "ACME IG", igSearchAt("/b/acme-ig"));
    expect(bar).toContain('data-ig-search-index="/b/acme-ig/assets/ig-search.json"');
    expect(bar).toContain('<script src="/b/acme-ig/assets/ig-search.js" defer></script>');
    expect(bar.endsWith("</div>")).toBe(true);
    expect(bar.indexOf('id="search-input"')).toBeLessThan(bar.lastIndexOf("</div>"));
  });

  test("without: unchanged", () => {
    expect(igTopBar(menu, "/b/acme-ig", "ACME IG")).not.toContain("search");
  });

  test("a composed page lifts the whole bar, box and script included", () => {
    const bar = igTopBar(menu, "/b/acme-ig", "ACME IG", igSearchAt("/b/acme-ig"));
    const staged = tmp("ig-search-staged-");
    put(staged, "_config.yml", 'title: "ACME IG"\n');
    put(staged, "_layouts/default.html", `<html><body>\n${bar}\n<main>{{ content }}</main></body></html>\n`);
    put(staged, "index.md", "---\ntitle: Home\n---\nHello\n");
    const docs = tmp("ig-search-docs-");
    composeIgSite(staged, docs, "acme", { atRoot: true });
    const top = readFileSync(join(docs, "_includes/ig/acme/_top.html"), "utf-8");
    expect(top).toContain('id="search-input"');
    expect(top).toContain("assets/ig-search.js");
  });

  test("the bar's stylesheet styles the box", () => {
    expect(IG_TOPBAR_CSS).toContain(IG_SEARCH_CSS.trim());
  });
});

describe("the thin pages' header", () => {
  const a = { key: "StructureDefinition/acme-patient", resourceType: "StructureDefinition", id: "acme-patient", title: "ACME Patient", published: {}, materialization: { state: "referenced" } } as unknown as FhirArtifact;
  const ix = { count: 1, artifacts: [a] } as unknown as FhirArtifactIndex;
  const base = { label: "ACME IG", home: "../index.html", all: "../artifacts.html" };

  test("an artefact page carries the box in its header and loads the script, when the site serves the search", () => {
    const html = thinArtifactView(ix, a, "content", { ...base, search: REF });
    const header = /<header class="iga-top">[\s\S]*?<\/header>/.exec(html)![0];
    expect(header).toContain('id="search-input"');
    expect(html).toContain('<script src="../assets/ig-search.js" defer></script>');
  });

  test("and nothing when it does not", () => {
    expect(thinArtifactView(ix, a, "content", base)).not.toContain("search-input");
  });

  test("the artifacts and toc pages too", () => {
    const html = thinIndexPage({ view: "artifacts", heading: "Artifacts", label: "ACME IG", canonical: "artifacts.html", index: "artifact/index.jsonld", pagesHref: "artifact/", assets: "", home: "index.html", artifacts: "artifacts.html", toc: "toc.html", search: { index: "assets/ig-search.json", script: "assets/ig-search.js" } });
    expect(/<header class="iga-top">[\s\S]*?<\/header>/.exec(html)![0]).toContain('data-ig-search-index="assets/ig-search.json"');
    expect(html).toContain('<script src="assets/ig-search.js" defer></script>');
  });

  test("the thin pages' one stylesheet styles the box", () => {
    const css = readFileSync(join(import.meta.dir, "templates", "ig-pages", "ig-artifact.css"), "utf-8");
    expect(THIN_PAGE_STYLE).toBe("assets/ig-artifact.css");
    expect(css).toContain(IG_SEARCH_CSS.trim());
  });
});

describe("the index", () => {
  test("plain text: Liquid, HTML and markdown markup removed", () => {
    expect(plainText('---\ntitle: x\n---\n## Hello {{ site.title }}\n{% include x.md %}\n<p class="a">A [link](b.html) and **bold** &amp; more</p>')).toBe("Hello A link and bold & more");
  });

  test("the IG's own pages: front matter pages outside artifact/, _*/ and assets/, not search-excluded", () => {
    const s = tmp("ig-search-pages-");
    put(s, "index.md", "---\ntitle: \"ACME: home\"\n---\nWelcome to the guide.\n");
    put(s, "sub/page.html", "---\ntitle: Nested\n---\n<p>Nested text</p>\n");
    put(s, "hidden.md", "---\ntitle: Hidden\nsearch_exclude: true\n---\nno\n");
    put(s, "artifact/StructureDefinition-x.html", "---\ntitle: X\n---\nartefact\n");
    put(s, "_includes/inc.md", "---\ntitle: Inc\n---\ninc\n");
    put(s, "assets/x.html", "---\ntitle: Asset\n---\nasset\n");
    put(s, "plain.html", "<p>no front matter</p>");
    expect(pageSearchEntries(s)).toEqual([
      { t: "ACME: home", h: "index.html", k: "page", x: "Welcome to the guide." },
      { t: "Nested", h: "sub/page.html", k: "page", x: "Nested text" },
    ]);
  });

  test("every artefact, linked to its thin page, with its identifiers and a one-line description", () => {
    const e = artifactSearchEntries([
      { key: "ValueSet/acme-vs", resourceType: "ValueSet", id: "acme-vs", name: "AcmeVS", title: "ACME Codes", canonical: "http://acme.org/ValueSet/acme-vs", description: "The **codes**\nACME uses." },
      { key: "Patient/p1", resourceType: "Patient", id: "p1" },
    ]);
    expect(e).toEqual([
      { t: "ACME Codes", h: "artifact/ValueSet-acme-vs.html", k: "ValueSet", i: "acme-vs AcmeVS ValueSet/acme-vs http://acme.org/ValueSet/acme-vs", d: "The codes ACME uses." },
      { t: "p1", h: "artifact/Patient-p1.html", k: "Patient", i: "p1 Patient/p1" },
    ]);
  });

  test("the file: its format, hrefs relative to the docs root, pages first", () => {
    const ix = igSearchIndex([{ t: "Home", h: "index.html", k: "page" }], [{ t: "A", h: "artifact/X-a.html", k: "X" }]);
    expect(ix).toEqual({ format: IG_SEARCH_FORMAT, base: "../", entries: [{ t: "Home", h: "index.html", k: "page" }, { t: "A", h: "artifact/X-a.html", k: "X" }] });
  });
});

/** The client's scorer, run as a browser would load it, with no page to bind to. */
function client(): { search: (entries: unknown[], q: string) => { e: { t: string; href: string } }[]; prep: (e: unknown, base: URL) => unknown } {
  const window: Record<string, unknown> = {};
  const document = { readyState: "complete", querySelectorAll: () => [], addEventListener: () => {} };
  runInNewContext(readFileSync(IG_SEARCH_SCRIPT_SOURCE, "utf-8"), { window, document, URL, console });
  return window.__igSearch as ReturnType<typeof client>;
}

describe("the client searches the index", () => {
  const c = client();
  const base = new URL("https://o.github.io/acme/");
  const entries = [
    { t: "Home", h: "index.html", k: "page", x: "The ACME guide describes immunization records." },
    { t: "ACME Patient", h: "artifact/StructureDefinition-acme-patient.html", k: "StructureDefinition", i: "acme-patient AcmePatient", d: "A patient in ACME." },
    { t: "Immunization Codes", h: "artifact/ValueSet-immz.html", k: "ValueSet", i: "immz", d: "Codes for vaccines." },
  ].map((e) => c.prep(e, base));

  test("a title match outranks a page's text, and hrefs resolve against the docs root", () => {
    const hits = c.search(entries, "immunization");
    expect(hits.map((h) => h.e.t)).toEqual(["Immunization Codes", "Home"]);
    expect(hits[0]!.e.href).toBe("https://o.github.io/acme/artifact/ValueSet-immz.html");
  });

  test("an artefact is found by its id", () => {
    expect(c.search(entries, "acme-patient").map((h) => h.e.t)).toEqual(["ACME Patient"]);
  });

  test("every term must match", () => {
    expect(c.search(entries, "patient vaccines")).toEqual([]);
    expect(c.search(entries, "codes vaccines").map((h) => h.e.t)).toEqual(["Immunization Codes"]);
  });

  test("an empty query finds nothing", () => {
    expect(c.search(entries, "  ")).toEqual([]);
  });
});

describe("compose writes the search; publisher-pages writes the language picker's block", () => {
  test("writeSearch: the index and the client under the docs root, refusing a path the host holds", () => {
    const docs = tmp("ig-search-write-");
    const staged = tmp("ig-search-staged2-");
    put(staged, "index.md", "---\ntitle: Home\n---\nHello\n");
    const r = writeSearch(docs, staged, { artifacts: [{ key: "X/a", resourceType: "X", id: "a" } as FhirArtifact] });
    expect(r).toMatchObject({ pages: 1, artifacts: 1 });
    const ix = JSON.parse(readFileSync(join(docs, IG_SEARCH_INDEX_FILE), "utf-8"));
    expect(ix.format).toBe(IG_SEARCH_FORMAT);
    expect(ix.entries.map((e: { h: string }) => e.h)).toEqual(["index.html", "artifact/X-a.html"]);
    expect(readFileSync(join(docs, IG_SEARCH_SCRIPT_FILE), "utf-8")).toBe(readFileSync(IG_SEARCH_SCRIPT_SOURCE, "utf-8"));
    expect(() => writeSearch(docs, staged, { artifacts: [] })).toThrow(/already holds/);
  });

  test("stampTranslationMeta: every built page that lacks the block gets the platform's, once; a page with its own keeps it", () => {
    const site = tmp("ig-search-site-");
    const ig = tmp("ig-search-ig-");
    put(site, "index.html", "<html><head><title>a</title></head><body></body></html>");
    put(site, "artifact/X-a.html", "<html><head><title>b</title></head><body></body></html>");
    const own = '<html><head><script type="application/json" id="fa-translation-meta">{"lang":"fr"}</script></head><body></body></html>';
    put(site, "fr.html", own);
    put(site, "data.json", "{}");
    expect(stampTranslationMeta(site, ig)).toBe(2);
    const meta = /<script type="application\/json" id="fa-translation-meta">([^<]*)<\/script>/.exec(readFileSync(join(site, "artifact/X-a.html"), "utf-8"))![1]!;
    expect(JSON.parse(meta)).toMatchObject({ lang: "en", supportedLocales: ["ar", "zh", "en", "fr", "ru", "es"] });
    expect(readFileSync(join(site, "fr.html"), "utf-8")).toBe(own);
    expect(stampTranslationMeta(site, ig)).toBe(0);
    expect(existsSync(join(site, "data.json"))).toBe(true);
  });
});
