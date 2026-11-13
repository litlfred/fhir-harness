/**
 * Where an IG layer's artefact index is read and written (bean `sm8r`,
 * item 4, step 2): through cat-harness-tools' layer-output resolver, so a
 * mounted IG's computed index lives under `build/layers/<instance>/` and a
 * reader sees it there over the pinned bytes.
 */
import { afterAll, describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { INDEX_DIR, indexReadPath, indexWritePath, layerFileReadPath, layerOf } from "./ig-index-output.ts";

const dirs: string[] = [];
afterAll(() => {
  for (const d of dirs) rmSync(d, { recursive: true, force: true });
});

/** A checkout with a mounted IG at `upper-ig/` (declared as `upper-ig`) and a local layer at `own/`. */
function checkout(): string {
  const root = mkdtempSync(join(tmpdir(), "ig-index-output-"));
  dirs.push(root);
  writeFileSync(join(root, "index.lock.json"), JSON.stringify({ instances: [{ instance: "upper-ig", path: "upper-ig", sha: "a".repeat(40) }] }));
  for (const name of ["upper-ig", "own"]) {
    mkdirSync(join(root, name, INDEX_DIR), { recursive: true });
    writeFileSync(join(root, name, `${name}.json`), JSON.stringify({ name }));
  }
  return root;
}

describe("layerOf", () => {
  test("names the layer by its declaration and its path from the checkout", () => {
    const root = checkout();
    expect(layerOf(join(root, "upper-ig"), undefined, root)).toEqual({ root, layer: { instance: "upper-ig", path: "upper-ig" } });
  });

  test("a name the caller holds wins over the declaration's", () => {
    const root = checkout();
    expect(layerOf(join(root, "upper-ig"), "other", root).layer.instance).toBe("other");
  });
});

describe("indexWritePath", () => {
  test("a mounted IG's index is written under build/layers/<instance>/, not in the mount", () => {
    const root = checkout();
    expect(indexWritePath(join(root, "upper-ig"), "index.json", { checkout: root })).toBe(join(root, "build", "layers", "upper-ig", INDEX_DIR, "index.json"));
  });

  test("a local layer's index is written inside it, as before", () => {
    const root = checkout();
    expect(indexWritePath(join(root, "own"), "menu.json", { checkout: root })).toBe(join(root, "own", INDEX_DIR, "menu.json"));
  });
});

describe("indexReadPath", () => {
  test("reads the mount's copy while nothing was computed", () => {
    const root = checkout();
    expect(indexReadPath(join(root, "upper-ig"), "index.json", { checkout: root })).toBe(join(root, "upper-ig", INDEX_DIR, "index.json"));
  });

  test("reads the computed copy over the mount's once a writer put it there", () => {
    const root = checkout();
    const computed = join(root, "build", "layers", "upper-ig", INDEX_DIR, "index.json");
    mkdirSync(join(computed, ".."), { recursive: true });
    writeFileSync(computed, "{}");
    expect(indexReadPath(join(root, "upper-ig"), "index.json", { checkout: root })).toBe(computed);
  });

  test("finds the checkout itself when none is given", () => {
    const root = checkout();
    spawnSync("git", ["init", "-q", root]);
    const computed = join(root, "build", "layers", "upper-ig", INDEX_DIR, "menu.json");
    mkdirSync(join(computed, ".."), { recursive: true });
    writeFileSync(computed, "{}");
    expect(indexReadPath(join(root, "upper-ig"), "menu.json")).toBe(computed);
  });
});

describe("layerFileReadPath", () => {
  test("a localPath under fhir-artifact-index/ is read through the overlay", () => {
    const root = checkout();
    const computed = join(root, "build", "layers", "upper-ig", INDEX_DIR, "package.tgz");
    mkdirSync(join(computed, ".."), { recursive: true });
    writeFileSync(computed, "");
    expect(layerFileReadPath(join(root, "upper-ig"), `${INDEX_DIR}/package.tgz`, { checkout: root })).toBe(computed);
  });

  test("any other localPath is the layer's own file", () => {
    const root = checkout();
    expect(layerFileReadPath(join(root, "upper-ig"), "output-ast/resources/x.json", { checkout: root })).toBe(join(root, "upper-ig", "output-ast/resources/x.json"));
  });
});

describe("a reader of a mounted IG's index (p2-refusals, bean sm8r's finding)", () => {
  test("finds an index that exists only in the output root, not in the mount", () => {
    const root = checkout();
    spawnSync("git", ["init", "-q", root]);
    writeFileSync(join(root, "index.lock.json"), JSON.stringify({ instances: ["a-ig", "b-ig"].map((instance) => ({ instance, path: instance, sha: "a".repeat(40) })) }));
    for (const [name, pkg] of [["a-ig", "a.ig"], ["b-ig", "b.ig"]] as const) {
      mkdirSync(join(root, name), { recursive: true });
      writeFileSync(join(root, name, `${name}.json`), JSON.stringify({ name }));
      const at = join(root, "build", "layers", name, INDEX_DIR);
      mkdirSync(at, { recursive: true });
      writeFileSync(join(at, "index.json"), JSON.stringify({ id: name, packageId: pkg, artifacts: [{ key: `ValueSet/${name}`, resourceType: "ValueSet", id: name, published: { xml: { url: `https://p/ValueSet-${name}.xml` } } }] }));
    }
    const out = join(root, "combined.json");
    const r = spawnSync("bun", ["run", join(import.meta.dir, "p2-refusals.ts"), "--combine", join(root, "a-ig"), join(root, "b-ig"), "--out", out], { encoding: "utf-8" });
    expect(r.stderr).not.toContain("does not exist");
    expect(r.status).toBe(0);
    expect(r.stdout).toContain("across 2 IGs");
  });
});
