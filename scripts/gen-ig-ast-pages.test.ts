/**
 * `gen-ig-ast-pages.ts`: the `ig-ast` viewer's pages, written into a site.
 *
 * A scratch checkout of three instances: `harness` declares the visualiser
 * (`renderedBy: ig-ast-pages`, `subgraphs: "instance"`), `held` declares an
 * `ig-ast` directory with an AST on disk, and `remote` declares one on a
 * branch family that is not restored — the normal case, which the page must
 * call unknown rather than zero. The IG is shaped like HL7's IPS
 * (`hl7.fhir.uv.ips`); the resources, edges and plan are made up for the test.
 *
 * Calibrated: making `astsIn` return `[]` for a missing directory fails the
 * "unknown, not zero" test; dropping `render_with_liquid: false` from `page`
 * fails the Liquid test.
 *
 * @module fhir-harness/scripts/gen-ig-ast-pages.test
 */
import { afterAll, describe, expect, it } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { astsIn, directoryVerdict } from "./gen-ig-ast-pages.ts";

const ROOT = resolve(import.meta.dir, "..", "..");
const SCRIPT = join(import.meta.dir, "gen-ig-ast-pages.ts");

const write = (p: string, v: unknown): void => {
  mkdirSync(join(p, ".."), { recursive: true });
  writeFileSync(p, typeof v === "string" ? v : JSON.stringify(v, null, 2));
};

function scratchCheckout(): string {
  const root = mkdtempSync(join(tmpdir(), "fhir-harness-ig-ast-"));
  write(join(root, "harness", "harness.json"), {
    name: "harness",
    version: "0.0.0",
    description: "Scratch harness declaring the ig-ast viewer.",
    directories: [],
    visualisers: [{ id: "ig-ast", renderedBy: "ig-ast-pages", coversKinds: ["ig-ast"], subgraphs: "instance", title: "IG ASTs" }],
  });
  write(join(root, "held", "held.json"), {
    name: "held",
    version: "0.0.0",
    repository: "example/held",
    description: "Scratch instance holding an AST.",
    directories: [{ id: "held-ast", path: "fhir-ast/", graphTypologies: ["ig-ast"] }],
  });
  const ast = join(root, "held", "fhir-ast");
  write(join(ast, "manifest.json"), {
    $schema: "ig-ast/v1",
    authority: "cache",
    provisional: ["indices"],
    generatedAt: "2026-01-01T00:00:00Z",
    ig: { version: "2.0.0" },
    inputs: { toolchain: "ig-publisher 0.0.0", sourceRevision: "abc1234" },
    resources: [
      { key: "ImplementationGuide/ips", canonical: "http://hl7.org/fhir/uv/ips/ImplementationGuide/ips", version: "2.0.0", resourceType: "ImplementationGuide", id: "ips", file: "resources/ig.json", source: null },
      { key: "http://hl7.org/fhir/uv/ips/StructureDefinition/Composition-uv-ips|2.0.0", canonical: "http://hl7.org/fhir/uv/ips/StructureDefinition/Composition-uv-ips", version: "2.0.0", resourceType: "StructureDefinition", id: "Composition-uv-ips", name: "Composition {{ page.title }}", file: "resources/sd.json", source: null },
      { key: "ValueSet/vs", canonical: null, version: null, resourceType: "ValueSet", id: "vs", file: "resources/vs.json", source: null },
    ],
  });
  write(join(ast, "resources", "ig.json"), { resourceType: "ImplementationGuide", id: "ips", packageId: "hl7.fhir.uv.ips" });
  write(join(ast, "dependencies.json"), {
    $schema: "ig-ast-dependencies/v1",
    dependencies: [
      { source: "ValueSet/vs", kind: "meta.profile", target: "http://example.org/p", targetVersion: null, resolved: null, origin: "ast-export" },
      { source: "ImplementationGuide/ips", kind: "uses", target: "ValueSet/vs", targetVersion: null, resolved: "ValueSet/vs", origin: "publisher" },
    ],
  });
  write(join(ast, "plan.json"), { $schema: "ig-ast-plan/v1", decision: "incremental", rebuild: ["ValueSet/vs"] });
  write(join(root, "remote", "remote.json"), {
    name: "remote",
    version: "0.0.0",
    description: "Scratch instance whose AST is on a branch family, not restored.",
    directories: [
      {
        id: "remote-ast",
        path: "fhir-ast/",
        graphTypologies: ["ig-ast"],
        storage: { keyedBy: "family", branchPrefix: "cat/fhir-harness/fhir-ast/", keyFrom: "the IG's package id", repository: "example/remote", tool: "ig-cache" },
      },
    ],
  });
  return root;
}

describe("gen-ig-ast-pages --site", () => {
  const checkout = scratchCheckout();
  const site = mkdtempSync(join(tmpdir(), "fhir-harness-ig-ast-site-"));
  afterAll(() => [checkout, site].forEach((d) => rmSync(d, { recursive: true, force: true })));
  const run = (...args: string[]) => Bun.spawnSync(["bun", "run", SCRIPT, "--root", checkout, "--site", site, ...args], { cwd: ROOT });
  const first = run();
  const files = (): string[] => (readdirSync(site, { recursive: true }) as string[]).filter((f) => statSync(join(site, f)).isFile()).sort();
  const hub = join("en", "harness", "ig-ast", "index.html");
  const held = join("en", "harness", "ig-ast", "held", "index.html");
  const remote = join("en", "harness", "ig-ast", "remote", "index.html");
  const read = (f: string): string => readFileSync(join(site, f), "utf8");

  it("the Tool declares the kind it renders and the site flag a site build passes", async () => {
    const { tools } = await import("../tools/index.ts");
    const t = tools().find((x) => x.id === "ig-ast-pages")!;
    expect(t.renders).toContain("ig-ast");
    const a = t.io?.inputs?.find((i) => i.name === "site")?.arg;
    expect(a !== undefined && "flag" in a ? a.flag : undefined).toBe("--site");
    expect(t.io?.inputs?.filter((i) => i.required) ?? []).toEqual([]);
  });

  it("writes the hub and one page per declaring instance at the declared route, and nothing else", () => {
    expect(first.exitCode).toBe(0);
    expect(files()).toEqual([hub, held, remote].sort());
    for (const f of files()) expect(read(f)).toContain("rendered-by: ig-ast-pages");
  });

  it("an AST on disk: package id from its ImplementationGuide, counts, edges and plan", () => {
    const html = read(held);
    expect(html).toContain("hl7.fhir.uv.ips");
    expect(html).toContain("<strong>3</strong> resource(s) across 3 type(s)");
    expect(html).toContain("<strong>2</strong> dependency edge(s), 1 resolved inside the IG");
    expect(html).toContain("<code>incremental</code>");
    expect(html).toContain("1 resource(s) to rebuild");
    expect(html).toContain("cache, never an authority");
  });

  it("a declared directory not in the build is unknown, never zero, and names its family", () => {
    const html = read(remote);
    expect(html).toContain("<strong>unknown</strong>, not none");
    expect(html).not.toMatch(/\b0 AST/);
    expect(html).toContain("cat/fhir-harness/fhir-ast/");
    expect(html).toContain("https://github.com/example/remote/branches/all?query=");
    expect(read(hub)).toContain("unknown — not in this build");
    expect(read(hub)).toContain("1 AST(s), 3 resource(s)");
  });

  it("authored text never reaches Liquid", () => {
    for (const f of files()) expect(read(f)).toMatch(/^---\n[\s\S]*?render_with_liquid: false[\s\S]*?\n---\n/);
  });

  it("--check passes on what it wrote and fails on a changed or orphaned page", () => {
    expect(run("--check").exitCode).toBe(0);
    writeFileSync(join(site, held), "changed");
    expect(run("--check").exitCode).toBe(1);
    run();
    write(join(site, "en", "harness", "ig-ast", "gone", "index.html"), "x");
    expect(run("--check").exitCode).toBe(1);
    run();
    expect(files()).toEqual([hub, held, remote].sort());
  });
});

describe("astsIn", () => {
  it("is null for a directory not on disk, and [] for one holding no manifest", () => {
    const d = mkdtempSync(join(tmpdir(), "fhir-harness-ig-ast-empty-"));
    try {
      expect(astsIn(join(d, "absent"))).toBeNull();
      expect(astsIn(d)).toEqual([]);
      expect(directoryVerdict({ id: "x", path: "x/", absPath: d, asts: [] })).toContain("holds no AST");
    } finally {
      rmSync(d, { recursive: true, force: true });
    }
  });

  it("reads one AST per member directory, keyed by the directory name when the AST names no package", () => {
    const d = mkdtempSync(join(tmpdir(), "fhir-harness-ig-ast-family-"));
    try {
      write(join(d, "example.pkg", "manifest.json"), { $schema: "ig-ast/v1", authority: "cache", provisional: [], resources: [] });
      write(join(d, "example.pkg", "dependencies.json"), { $schema: "ig-ast-dependencies/v1", dependencies: [] });
      write(join(d, "broken.pkg", "manifest.json"), { $schema: "ig-ast/v1", authority: "cache", provisional: [], resources: [] });
      const asts = astsIn(d)!;
      expect(asts.map((a) => [a.packageId, a.packageIdFrom, a.error === undefined])).toEqual([
        ["broken.pkg", "family-key", false],
        ["example.pkg", "family-key", true],
      ]);
    } finally {
      rmSync(d, { recursive: true, force: true });
    }
  });
});

describe("fhir-harness declares the viewer it draws", () => {
  const decl = JSON.parse(readFileSync(join(import.meta.dir, "..", "fhir-harness.json"), "utf8")) as {
    visualisers?: { id: string; renderedBy: string; coversKinds?: string[]; subgraphs?: string }[];
    builtAtPublish?: { path: string; writer: string[] }[];
  };
  it("a visualiser rendered by ig-ast-pages, covering ig-ast per instance, built at publish and ignored", () => {
    const v = decl.visualisers?.find((x) => x.renderedBy === "ig-ast-pages");
    expect(v).toMatchObject({ id: "ig-ast", coversKinds: ["ig-ast"], subgraphs: "instance" });
    const b = decl.builtAtPublish?.find((x) => x.path === `docs/en/fhir-harness/${v!.id}/`);
    expect(b?.writer).toEqual(["ig-ast:pages"]);
    const pkg = JSON.parse(readFileSync(join(import.meta.dir, "..", "package.json"), "utf8")) as { checkoutScripts: Record<string, string> };
    expect(pkg.checkoutScripts["ig-ast:pages"]).toContain("gen-ig-ast-pages.ts");
    expect(readFileSync(join(import.meta.dir, "..", ".gitignore"), "utf8").split("\n")).toContain(`/${b!.path}`);
  });
});
