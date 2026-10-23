#!/usr/bin/env bun
/**
 * Build each IG instance's `fhir-artifact-index/` at publish, from the IG's
 * cached AST and its own source, so no IG instance commits one (issue #124).
 *
 * @module fhir-harness/scripts/build-ig-indexes
 * @covers fhir-artifact-index
 *
 * ```sh
 * bun run fhir-harness/scripts/build-ig-indexes.ts [--root <checkout>] [--only <instance>] [--work <dir>] [--plan]
 * ```
 *
 * ## Which instances
 *
 * An IG instance declares nothing of this layer's (AGENTS.md). It is found
 * the way the `ig-ast` viewer finds one (`gen-ig-ast-pages.ts`): it needs
 * this layer, directly or through a layer above it, it declares a
 * `repository`, and that repository carries an AST branch family
 * ({@link AST_FAMILY_PREFIXES}). An instance missing any of the three is
 * skipped, and the run says which and why.
 *
 * ## What it writes, per instance, at the paths every reader already uses
 *
 * - `index.json`: `ast-to-artifact-index.ts` over the AST `ig-cache.sh
 *   restore` lays down from the branch family. The AST is a cache, and the
 *   index says so (`authority: "cache"` in its manifest's inputs).
 * - `menu.json`: `buildMenu` over the IG source's `sushi-config.yaml`, at the
 *   commit cloned. `stage-ig-sites.ts` clones the IG from the `source.of` and
 *   `source.ref` this records.
 * - `releases.json`: `ingest-ig-releases.ts`, from the repository's GitHub
 *   releases. A failed read is reported and the file is not written: no
 *   release list is not the same as an empty one.
 *
 * A committed `index.json` still on disk is read for its grouping
 * (`--keep-published-grouping`) before it is replaced, so the Publisher's
 * editorial categories survive the first build. Once the committed copy is
 * deleted, the grouping is the Publisher's default by resource type, and
 * `ast-to-artifact-index.ts` names every artefact where that differs.
 *
 * `--plan` prints what would be built and touches nothing.
 *
 * Exit: 0 every IG found was built · 1 one or more failed (each named) · 2 usage.
 *
 * Nothing here may know about WHO (fhir-harness/AGENTS.md).
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";

import { checkoutRootFor, instanceRootsIn } from "../../cat-harness/schemas/cat-harness.js";
import { AST_FAMILY_PREFIXES, LAYER, lsRemote, needing, type BranchLister, type InstanceFacts } from "./gen-ig-ast-pages.ts";
import { buildMenu } from "./ingest-ig-menu.ts";

const HERE = import.meta.dir;

/** One IG instance this run builds the index of. */
export interface IgTarget {
  name: string;
  root: string;
  repository: string;
  /** The family branches found on the repository. */
  branches: string[];
}

/** An instance that is not built, and why. */
export interface Skipped {
  name: string;
  why: string;
}

function declarationOf(root: string): Record<string, unknown> | undefined {
  const p = join(root, `${basename(root)}.json`);
  try {
    return existsSync(p) ? (JSON.parse(readFileSync(p, "utf-8")) as Record<string, unknown>) : undefined;
  } catch {
    return undefined;
  }
}

/** The checkout's instances, as the inheritance needs them, with their roots. */
export function instancesIn(checkout: string): (InstanceFacts & { root: string })[] {
  const out: (InstanceFacts & { root: string })[] = [];
  for (const root of instanceRootsIn(checkout)) {
    const d = declarationOf(root);
    const name = typeof d?.["name"] === "string" ? (d["name"] as string) : basename(root);
    const repository = typeof d?.["repository"] === "string" ? (d["repository"] as string) : undefined;
    const needs = Array.isArray(d?.["needs"]) ? (d!["needs"] as unknown[]).filter((x): x is string => typeof x === "string") : [];
    out.push({ name, root, needs, ...(repository ? { repository } : {}) });
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

/** The IG instances to build, and every instance that needs this layer but is skipped. */
export function igTargets(instances: readonly (InstanceFacts & { root: string })[], list: BranchLister, only?: string): { targets: IgTarget[]; skipped: Skipped[] } {
  const targets: IgTarget[] = [];
  const skipped: Skipped[] = [];
  const need = needing(instances, LAYER);
  for (const i of instances) {
    if (!need.has(i.name)) continue;
    if (only !== undefined && i.name !== only) continue;
    if (i.repository === undefined || !/^[\w.-]+\/[\w.-]+$/.test(i.repository)) {
      skipped.push({ name: i.name, why: "declares no repository (owner/repo)" });
      continue;
    }
    const found = list(i.repository);
    if ("error" in found) {
      skipped.push({ name: i.name, why: `could not determine: ${found.error}` });
      continue;
    }
    const branches = found.branches.filter((b) => AST_FAMILY_PREFIXES.some((p) => b.startsWith(p)));
    if (branches.length === 0) {
      skipped.push({ name: i.name, why: `${i.repository} carries no AST branch family (${AST_FAMILY_PREFIXES.join(", ")}): not an IG, or its AST was never seeded` });
      continue;
    }
    targets.push({ name: i.name, root: i.root, repository: i.repository, branches });
  }
  return { targets, skipped };
}

function run(cmd: string, args: string[], cwd?: string): { ok: boolean; out: string } {
  const r = spawnSync(cmd, args, { cwd, encoding: "utf-8", timeout: 600_000 });
  return { ok: r.status === 0, out: `${r.stdout ?? ""}${r.stderr ?? ""}`.trim() };
}

/** Build one IG's index, menu and releases. Returns the problems; empty means built. */
export function buildOne(t: IgTarget, work: string, log: (s: string) => void): string[] {
  const problems: string[] = [];
  const clone = join(work, t.name);
  rmSync(clone, { recursive: true, force: true });
  const c = run("git", ["clone", "--quiet", "--depth", "1", `https://github.com/${t.repository}`, clone]);
  if (!c.ok) return [`clone of ${t.repository} failed: ${c.out}`];

  const restore = run("bash", [join(HERE, "ig-cache.sh"), "restore", "--ig-root", clone]);
  if (!restore.ok) return [`no AST restored from ${t.repository}: ${restore.out.split("\n").slice(-3).join(" ")}`];
  const ast = join(clone, "output-ast");

  const dir = join(t.root, "fhir-artifact-index");
  mkdirSync(dir, { recursive: true });
  const indexPath = join(dir, "index.json");
  const grouping = existsSync(indexPath) ? ["--compare", indexPath, "--keep-published-grouping"] : [];
  const built = join(work, `${t.name}.index.json`);
  const ix = run("bun", ["run", join(HERE, "ast-to-artifact-index.ts"), "--ast", ast, "--instance-id", t.name, "--out", built, ...grouping]);
  if (!ix.ok) problems.push(`index: ${ix.out}`);
  else {
    writeFileSync(indexPath, readFileSync(built));
    log(`  index: ${ix.out.split("\n")[0]}`);
  }

  try {
    const menu = buildMenu(clone, new Date().toISOString().slice(0, 10));
    writeFileSync(join(dir, "menu.json"), `${JSON.stringify(menu, null, 2)}\n`);
    log(`  menu: ${menu.groups.length} group(s) from ${t.repository}@${menu.source.ref.slice(0, 7)}`);
  } catch (e) {
    problems.push(`menu: ${(e as Error).message}`);
  }

  const rel = run("bun", ["run", join(HERE, "ingest-ig-releases.ts"), "--instance", t.root, "--repo", t.repository]);
  if (!rel.ok) log(`  releases: not written, could not read ${t.repository}'s releases: ${rel.out.split("\n").find((l) => l.startsWith("error:")) ?? rel.out.split("\n").slice(-1)[0]}`);
  else log("  releases: written");
  return problems;
}

function main(): number {
  const argv = process.argv.slice(2);
  const val = (f: string): string | undefined => {
    const i = argv.indexOf(f);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  const root = checkoutRootFor(resolve(val("--root") ?? process.cwd()));
  const only = val("--only");
  const plan = argv.includes("--plan");
  const { targets, skipped } = igTargets(instancesIn(root), lsRemote, only);
  for (const s of skipped) console.error(`skipped: ${s.name} — ${s.why}`);
  if (only !== undefined && targets.length === 0 && !skipped.some((s) => s.name === only)) {
    console.error(`--only ${only}: no instance of that name needs ${LAYER} in ${root}`);
    return 2;
  }
  if (plan) {
    for (const t of targets) console.log(`${t.name}\t${t.repository}\t${t.branches.join(",")}`);
    return 0;
  }
  const work = val("--work") ?? mkdtempSync(join(tmpdir(), "ig-index-"));
  let failed = 0;
  for (const t of targets) {
    console.log(`${t.name} (${t.repository})`);
    const problems = buildOne(t, work, (s) => console.log(s));
    for (const p of problems) console.error(`✗ ${t.name}: ${p}`);
    if (problems.length) failed++;
  }
  console.log(`${targets.length - failed} of ${targets.length} IG index(es) built${skipped.length ? `, ${skipped.length} skipped` : ""}`);
  return failed ? 1 : 0;
}

if (import.meta.main) process.exit(main());
