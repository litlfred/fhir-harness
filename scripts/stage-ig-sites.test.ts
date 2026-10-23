/**
 * Which IGs get their own site is DATA: an instance's menu.json records the
 * repository and commit its menu was read from (bean `bamf`).
 */

import { afterAll, beforeAll, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { writeDeclaration } from "../../cat-harness-tools/test/support/instance-fixture";
import { composedInstances, instanceStub } from "../../cat-harness-tools/scripts/compose-docs";
import { clearComposeStub, igsToBuild, servedPathsFor } from "./stage-ig-sites";

let repo: string;
const menu = (source?: object) => JSON.stringify({ $schema: "folio-ig-menu/v1", groups: [], ...(source ? { source } : {}) });

beforeAll(() => {
  repo = mkdtempSync(join(tmpdir(), "stage-ig-"));
  for (const [name, m] of [
    ["with-source", menu({ kind: "sushi-config", of: "https://example.org/ig.git", ref: "abc123" })],
    ["no-source", menu()],
  ] as const) {
    mkdirSync(join(repo, name, "fhir-artifact-index"), { recursive: true });
    writeFileSync(join(repo, name, "fhir-artifact-index", "menu.json"), m);
    writeDeclaration(join(repo, name), { name, directories: [] });
  }
  // An instance that declares its source in its instance declaration (bean `bamf`)
  mkdirSync(join(repo, "declared-source", "fhir-artifact-index"), { recursive: true });
  writeFileSync(join(repo, "declared-source", "fhir-artifact-index", "menu.json"), menu());
  writeDeclaration(join(repo, "declared-source"), {
    name: "declared-source",
    source: { kind: "git", repository: "https://example.org/declared-ig.git", ref: "def456" },
    directories: [],
  });

  mkdirSync(join(repo, "no-menu"), { recursive: true });
  writeDeclaration(join(repo, "no-menu"), { name: "no-menu", directories: [] });
});
afterAll(() => rmSync(repo, { recursive: true, force: true }));

test("an instance whose declaration records a git source is built from that declared source", () => {
  const { build } = igsToBuild(repo);
  const declared = build.find((b) => b.instance === "declared-source");
  expect(declared).toBeDefined();
  expect(declared?.repo).toBe("https://example.org/declared-ig.git");
  expect(declared?.ref).toBe("def456");
});

test("an instance whose menu records a sushi-config source is built, from that commit", () => {
  const { build } = igsToBuild(repo);
  const withSource = build.find((b) => b.instance === "with-source");
  expect(withSource).toBeDefined();
  expect(withSource?.repo).toBe("https://example.org/ig.git");
  expect(withSource?.ref).toBe("abc123");
});

test("a menu with no source is skipped AND reported; no menu at all is simply not an IG", () => {
  const { skipped } = igsToBuild(repo);
  expect(skipped).toEqual(["no-source: neither the instance declaration nor menu.json records a source repository and commit"]);
});

test("an igSite instance reserves each served directory's path, so its IG's input/images copy does not take that route", () => {
  const root = join(repo, "served-ig");
  mkdirSync(join(root, "docs"), { recursive: true });
  writeDeclaration(root, {
    name: "served-ig",
    directories: [
      { id: "served-ig-docs", path: "docs/", graphTypologies: ["docs"], igSite: true },
      { id: "served-ig-openapi", path: "openapi/", graphTypologies: ["openapi"], served: true },
      { id: "served-ig-notes", path: "notes/", graphTypologies: ["docs"] },
    ],
  });
  expect(servedPathsFor(root)).toEqual([{ prefix: "openapi/", by: "served directory served-ig-openapi" }]);
});

test("an IG site at /<instance>/ig/ reserves nothing: no served route can meet it", () => {
  const root = join(repo, "served-no-igsite");
  mkdirSync(root, { recursive: true });
  writeDeclaration(root, {
    name: "served-no-igsite",
    directories: [{ id: "served-no-igsite-openapi", path: "openapi/", graphTypologies: ["openapi"], served: true }],
  });
  expect(servedPathsFor(root)).toEqual([]);
});

// folio-assistant#2638: `compose-docs --staging` left `stubbed-ig` out and
// wrote its "not built into this preview" stub; the IG cone then built the IG,
// whose landing at `/stubbed-ig/index.html` was refused as a collision.
test("compose-docs' own stub gives way to the IG built at that URL; any other index.md stays a collision", () => {
  const root = join(repo, "stubbed-ig");
  mkdirSync(join(root, "site-docs"), { recursive: true });
  writeDeclaration(root, {
    name: "stubbed-ig",
    directories: [{ id: "stubbed-ig-site-docs", path: "site-docs/", graphTypologies: ["docs"], composed: true }],
  });
  const c = composedInstances(repo).find((x) => x.under === "stubbed-ig")!;
  expect(c).toBeDefined();
  const into = mkdtempSync(join(tmpdir(), "stage-ig-into-"));
  try {
    const at = join(into, "stubbed-ig", "index.md");
    mkdirSync(join(into, "stubbed-ig"), { recursive: true });

    // The stub compose-docs writes, byte for byte: cleared, and named.
    writeFileSync(at, instanceStub(c));
    expect(clearComposeStub(into, "stubbed-ig", repo)).toBe("stubbed-ig/index.md");
    expect(existsSync(at)).toBe(false);

    // Nothing there: nothing to clear.
    expect(clearComposeStub(into, "stubbed-ig", repo)).toBeUndefined();

    // An authored page — even one quoting the stub's words — is not the stub.
    const authored = `${instanceStub(c)}\nAn authored line.\n`;
    writeFileSync(at, authored);
    expect(clearComposeStub(into, "stubbed-ig", repo)).toBeUndefined();
    expect(readFileSync(at, "utf-8")).toBe(authored);

    // An IG that compose-docs does not compose has no stub of its own to clear.
    mkdirSync(join(into, "with-source"), { recursive: true });
    writeFileSync(join(into, "with-source", "index.md"), instanceStub({ ...c, under: "with-source", root: "with-source", instance: "with-source" }));
    expect(clearComposeStub(into, "with-source", repo)).toBeUndefined();
    expect(existsSync(join(into, "with-source", "index.md"))).toBe(true);
  } finally {
    rmSync(into, { recursive: true, force: true });
  }
});
