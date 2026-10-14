/**
 * An IG repository's own site with no instance declaration: the closure's top,
 * the Publisher fill-in, and what is never staged as the IG's source.
 * Driven by synthetic trees, so it names no real IG.
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { builtPage, IG_SITE_SCRIPTS, listedInstances, UPSTREAM_PAGES_ENV, missingFromSite, notSource, publisherPages, topMounts } from "./ig-repo-site.ts";

let dir: string;
beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), "ig-repo-site-"));
});
afterAll(() => rmSync(dir, { recursive: true, force: true }));

describe("topMounts", () => {
  test("the listed instances nothing else listed needs", () => {
    const needs: Record<string, string[]> = { base: ["fhir", "core"], fhir: ["core"], core: ["tools"], tools: [] };
    expect(topMounts(["base", "fhir", "core", "tools"], (n) => needs[n] ?? [])).toEqual(["base"]);
  });
  test("two independent tops are both returned", () => {
    expect(topMounts(["a", "b"], () => [])).toEqual(["a", "b"]);
  });
});

describe("listedInstances", () => {
  test("the names index.config.json lists, in order; none without one", () => {
    const r = join(dir, "listed");
    mkdirSync(r, { recursive: true });
    expect(listedInstances(r)).toEqual([]);
    writeFileSync(join(r, "index.config.json"), JSON.stringify({ instances: [{ name: "b" }, { name: "a" }, {}] }));
    expect(listedInstances(r)).toEqual(["b", "a"]);
  });
});

describe("notSource", () => {
  test("mounts the lock names and the Publisher's products are not the IG's source", () => {
    const r = join(dir, "src");
    mkdirSync(r, { recursive: true });
    writeFileSync(join(r, "index.lock.json"), JSON.stringify({ instances: [{ path: "base" }, { path: "layer/sub" }, { path: "." }] }));
    const s = notSource(r);
    for (const p of ["base", "layer", ".git", "output", "temp", "input-cache"]) expect(s.has(p)).toBe(true);
    expect(s.has("input")).toBe(false);
    expect(s.has(".")).toBe(false);
  });
});

describe("publisher pages", () => {
  test("missingFromSite keeps every path the site holds", () => {
    expect(missingFromSite(["index.html", "a.html", "x/b.json"], new Set(["index.html"]))).toEqual(["a.html", "x/b.json"]);
  });
  test("copies what the site lacks and never replaces a page the site built", () => {
    const site = join(dir, "site");
    const out = join(dir, "output");
    mkdirSync(site, { recursive: true });
    mkdirSync(join(out, "sub"), { recursive: true });
    writeFileSync(join(site, "index.html"), "<p>site</p>");
    writeFileSync(join(out, "index.html"), "<p>publisher</p>");
    writeFileSync(join(out, "StructureDefinition-x.html"), "<p>artefact</p>");
    writeFileSync(join(out, "sub", "package.tgz"), "tgz");
    const r = publisherPages({ site, output: out, log: () => {} });
    expect(r).toEqual({ copied: 2, kept: 1 });
    expect(readFileSync(join(site, "index.html"), "utf-8")).toBe("<p>site</p>");
    expect(readFileSync(join(site, "StructureDefinition-x.html"), "utf-8")).toBe("<p>artefact</p>");
    expect(readFileSync(join(site, "sub", "package.tgz"), "utf-8")).toBe("tgz");
  });
  test("the copied pages are listed for the site build as the content's own", () => {
    const site = join(dir, "site3");
    const out = join(dir, "output3");
    mkdirSync(site, { recursive: true });
    mkdirSync(out, { recursive: true });
    writeFileSync(join(out, "a.html"), "a");
    writeFileSync(join(out, "a.json"), "{}");
    const list = join(dir, "upstream.txt");
    writeFileSync(list, "");
    process.env[UPSTREAM_PAGES_ENV] = list;
    try {
      publisherPages({ site, output: out, log: () => {} });
    } finally {
      delete process.env[UPSTREAM_PAGES_ENV];
    }
    expect(readFileSync(list, "utf-8")).toBe("a.html\n");
  });
  test("no Publisher output: nothing copied, and no failure", () => {
    const site = join(dir, "site2");
    mkdirSync(site, { recursive: true });
    const said: string[] = [];
    expect(publisherPages({ site, output: join(dir, "absent"), log: (s) => said.push(s) })).toEqual({ copied: 0, kept: 0 });
    expect(said.join("\n")).toContain("no Publisher output");
  });
});

test("builtPage: a source page by Jekyll's default permalink; never a file Jekyll does not publish", () => {
  expect(builtPage("index.md")).toBe("index.html");
  expect(builtPage("sub/x.markdown")).toBe("sub/x.html");
  expect(builtPage("y.html")).toBe("y.html");
  expect(builtPage("_includes/ig/x/a.md")).toBeUndefined();
  expect(builtPage("assets/a.png")).toBeUndefined();
});

test("the checkout scripts the platform asks for are the ones package.json declares", () => {
  const pkg = JSON.parse(readFileSync(join(import.meta.dir, "..", "package.json"), "utf-8")) as { checkoutScripts: Record<string, string> };
  expect(pkg.checkoutScripts[IG_SITE_SCRIPTS.compose]).toBe("bun run fhir-harness/scripts/ig-repo-site.ts compose");
  expect(pkg.checkoutScripts[IG_SITE_SCRIPTS.publisherPages]).toBe("bun run fhir-harness/scripts/ig-repo-site.ts publisher-pages");
});
