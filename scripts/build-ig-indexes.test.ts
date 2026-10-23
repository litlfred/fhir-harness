/**
 * `build-ig-indexes.ts`: which instances get an artefact index built at
 * publish. The build itself clones and restores over the network, so it is
 * measured by running it, not here; what is decided before any clone is.
 *
 * Instances are made up for the test: `ig` needs fhir-harness directly,
 * `overlay-ig` through `overlay`, `bare` has no repository, `lone` needs
 * nothing, and `seedless` has no AST branch family.
 *
 * @module fhir-harness/scripts/build-ig-indexes.test
 */
import { afterAll, describe, expect, it } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { carryFromCommitted, igTargets, publishedBase } from "./build-ig-indexes.ts";
import type { BranchLister } from "./gen-ig-ast-pages.ts";

const instances = [
  { name: "fhir-harness", root: "/c/fhir-harness", repository: "example/fhir-harness", needs: ["core"] },
  { name: "overlay", root: "/c/overlay", repository: "example/overlay", needs: ["fhir-harness"] },
  { name: "ig", root: "/c/ig", repository: "example/ig", needs: ["fhir-harness"] },
  { name: "overlay-ig", root: "/c/overlay-ig", repository: "example/overlay-ig", needs: ["overlay"] },
  { name: "bare", root: "/c/bare", needs: ["fhir-harness"] },
  { name: "seedless", root: "/c/seedless", repository: "example/seedless", needs: ["fhir-harness"] },
  { name: "broken", root: "/c/broken", repository: "example/broken", needs: ["fhir-harness"] },
  { name: "lone", root: "/c/lone", repository: "example/lone", needs: [] },
];

const list: BranchLister = (repo) => {
  if (repo === "example/broken") return { error: "git ls-remote failed" };
  if (repo === "example/seedless" || repo === "example/overlay") return { branches: [] };
  return { branches: [`cat/fhir-harness/fhir-ast/${repo.split("/")[1]}.pkg`, "main"] };
};

describe("igTargets", () => {
  it("builds every instance that needs the layer, has a repository and an AST family; says why each other one is skipped", () => {
    const { targets, skipped } = igTargets(instances, list);
    expect(targets.map((t) => [t.name, t.branches])).toEqual([
      ["ig", ["cat/fhir-harness/fhir-ast/ig.pkg"]],
      ["overlay-ig", ["cat/fhir-harness/fhir-ast/overlay-ig.pkg"]],
    ]);
    const why = Object.fromEntries(skipped.map((s) => [s.name, s.why]));
    expect(Object.keys(why).sort()).toEqual(["bare", "broken", "overlay", "seedless"]);
    expect(why["bare"]).toContain("no repository");
    expect(why["broken"]).toContain("could not determine");
    expect(why["seedless"]).toContain("no AST branch family");
    expect(why["lone"]).toBeUndefined();
  });

  it("--only narrows to one instance", () => {
    expect(igTargets(instances, list, "overlay-ig").targets.map((t) => t.name)).toEqual(["overlay-ig"]);
  });
});

describe("carryFromCommitted", () => {
  const dir = mkdtempSync(join(tmpdir(), "ig-index-carry-"));
  mkdirSync(join(dir, "fhir-artifact-index"), { recursive: true });
  writeFileSync(join(dir, "fhir-artifact-index", "package.tgz"), "x");
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  it("keeps what the AST does not supply, only when its files are on disk, and never overwrites the build", () => {
    const built: Record<string, unknown> = { packageId: "ex.ig", fhirVersion: "5.0.0" };
    const committed = {
      fhirVersion: "4.0.1",
      package: { url: "https://example.org/package.tgz", localPath: "fhir-artifact-index/package.tgz" },
      igApiHub: { url: "https://example.org/hub.html", localPath: "fhir-artifact-index/gone/hub.json" },
    };
    expect(carryFromCommitted(built, committed, dir)).toEqual(["package"]);
    expect(built["fhirVersion"]).toBe("5.0.0");
    expect(built["igApiHub"]).toBeUndefined();
    expect(carryFromCommitted({}, undefined, dir)).toEqual([]);
  });
});

describe("publishedBase", () => {
  it("prefers the committed copy's published site, then the declaration's iriBase, else none", () => {
    expect(publishedBase({ source: { kind: "gh-pages", of: "https://example.org/ig/" } }, { iriBase: "https://other.example/" }).base).toBe("https://example.org/ig");
    expect(publishedBase({ source: { kind: "sushi-config", of: "https://github.com/x/y" } }, { iriBase: "https://other.example/ig/" }).base).toBe("https://other.example/ig");
    expect(publishedBase(undefined, undefined).base).toBeUndefined();
  });
});
