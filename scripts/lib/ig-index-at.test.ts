/**
 * The artefact index is read through the layer-output overlay (bean
 * `cat-tools-sm8r`, item 4, plan step 2): a mounted IG layer's index is read
 * from `build/layers/<instance>/` when a writer put it there, else from the
 * mount; a layer the checkout does not mount is read in place.
 */
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { indexReadPath } from "./ig-index-at.ts";

let root: string;
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "ig-index-at-"));
  mkdirSync(join(root, ".git"));
  writeFileSync(join(root, "index.lock.json"), JSON.stringify({ instances: [{ instance: "some-ig", path: "some-ig", sha: "a".repeat(40) }] }));
  mkdirSync(join(root, "some-ig", "fhir-artifact-index"), { recursive: true });
  writeFileSync(join(root, "some-ig", "fhir-artifact-index", "index.json"), "{}");
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

describe("indexReadPath", () => {
  test("a mounted layer with nothing computed is read from the mount", () => {
    expect(indexReadPath(join(root, "some-ig"), "index.json")).toBe(join(root, "some-ig", "fhir-artifact-index", "index.json"));
  });
  test("a mounted layer's computed index wins over the pinned bytes", () => {
    const built = join(root, "build", "layers", "some-ig", "fhir-artifact-index");
    mkdirSync(built, { recursive: true });
    writeFileSync(join(built, "index.json"), "{}");
    expect(indexReadPath(join(root, "some-ig"), "index.json")).toBe(join(built, "index.json"));
  });
  test("a layer the checkout does not mount is read in place", () => {
    mkdirSync(join(root, "own-ig"));
    expect(indexReadPath(join(root, "own-ig"), "menu.json")).toBe(join(root, "own-ig", "fhir-artifact-index", "menu.json"));
  });
  test("with no path parts it names the index directory itself", () => {
    expect(indexReadPath(join(root, "some-ig"))).toBe(join(root, "some-ig", "fhir-artifact-index"));
  });
});
