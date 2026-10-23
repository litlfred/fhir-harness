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
 * ## The IG API sidecars a layer above leaves
 *
 * When a mounted layer provides the checkout script `ig-site:sidecars` (the
 * step an IG repository's own site runs, `ig-repo-site.ts` §"What a layer
 * above leaves for this one"), it is run here too, over the same clone and a
 * work directory of its own. What it leaves in `<work>/ig-api/sidecars/` is
 * copied to `<instance>/fhir-artifact-index/sidecars/` and bound to the
 * artefacts (`ast-to-artifact-index.ts --sidecars`), so the pages keep their
 * IG API links once no committed copy carries them. This layer runs the step
 * by its name and never knows what it writes. No such script, nothing is bound,
 * and the run says so. A step that fails fails that IG.
 *
 * ## The package, from the AST
 *
 * The JSON view pages read each resource out of `package.tgz`, at
 * `package/<Type>-<id>.json`, as the Publisher packages it. {@link packFromAst}
 * writes that file from the AST's resources, with a `package/package.json`
 * read from the IG's `sushi-config.yaml`, to `fhir-artifact-index/package.tgz`.
 * It is the AST's package, not the published one, and holds what the AST holds.
 *
 * ## What the AST does not carry yet, kept from a committed copy
 *
 * An index ingested from the published site also holds the JSON-LD contexts
 * and the IG API hub. The AST does not hold them yet. While a committed copy is on
 * disk, those fields are kept from it ({@link CARRIED}), provided the files they
 * point at are there, so the pages lose nothing on the first build. An IG
 * instance can drop its committed copy only once the build supplies them
 * (issue #124, step 3).
 *
 * ## Where the IG is published
 *
 * The published links (`published.json`, `.html`, ...) need the address the
 * IG is published at, which a canonical URL is not ({@link publishedBase}). It is
 * the committed copy's `source.of` when that names a published site (the rule
 * `ig-ast-site.sh` follows), else the instance declaration's `iriBase`, else
 * none, and the run says which.
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
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { parse as parseYaml } from "yaml";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";

import { checkoutRootFor, instanceRootsIn } from "../../cat-harness/schemas/cat-harness.js";
import { scriptTable } from "../../cat-harness/schemas/script-table.ts";
import { IG_API_WORK } from "./ig-repo-site.ts";
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

/** Index fields the AST does not supply yet, kept from a committed copy when one is on disk. */
export const CARRIED = ["fhirVersion", "contexts", "igApiHub"] as const;

/** A representation's instance-relative file, when the field carries one. */
function localPaths(v: unknown): string[] {
  if (Array.isArray(v)) return v.flatMap(localPaths);
  if (v === null || typeof v !== "object") return [];
  const o = v as Record<string, unknown>;
  return [...(typeof o["localPath"] === "string" ? [o["localPath"] as string] : []), ...Object.values(o).flatMap((x) => (typeof x === "object" ? localPaths(x) : []))];
}

/**
 * Keep the {@link CARRIED} fields the built index lacks from the committed one,
 * when every file they point at exists under `instanceRoot`. Returns the
 * fields kept. Pure but for the existence check.
 */
export function carryFromCommitted(built: Record<string, unknown>, committed: Record<string, unknown> | undefined, instanceRoot: string): string[] {
  if (committed === undefined) return [];
  const kept: string[] = [];
  for (const k of CARRIED) {
    if (built[k] !== undefined || committed[k] === undefined) continue;
    if (!localPaths(committed[k]).every((p) => existsSync(join(instanceRoot, p)))) continue;
    built[k] = committed[k];
    kept.push(k);
  }
  return kept;
}

/** Where the IG is published: the committed copy's site, else the declaration's `iriBase`, else none. */
export function publishedBase(committed: Record<string, unknown> | undefined, declaration: Record<string, unknown> | undefined): { base?: string; from: string } {
  const src = committed?.["source"] as { kind?: unknown; of?: unknown } | undefined;
  if ((src?.kind === "gh-pages" || src?.kind === "url") && typeof src.of === "string" && src.of.length > 0) return { base: src.of.replace(/\/+$/, ""), from: "the committed copy's source" };
  const iri = declaration?.["iriBase"];
  if (typeof iri === "string" && /^https?:\/\//.test(iri)) return { base: iri.replace(/\/+$/, ""), from: "the declaration's iriBase" };
  return { from: "nowhere: no published links" };
}

/**
 * Write `out` as a Publisher-shaped `package.tgz` from the AST in `ast`: each
 * resource at `package/<Type>-<id>.json`, and `package/package.json` from the
 * IG's `sushi-config.yaml`. Returns the number of resources packed.
 */
export function packFromAst(ast: string, igSource: string, out: string, stage: string): number {
  const manifest = JSON.parse(readFileSync(join(ast, "manifest.json"), "utf-8")) as { resources: { resourceType: string; id: string; file: string }[] };
  rmSync(stage, { recursive: true, force: true });
  const pkg = join(stage, "package");
  mkdirSync(pkg, { recursive: true });
  let n = 0;
  for (const r of manifest.resources) {
    const from = join(ast, r.file);
    if (!existsSync(from) || !/^[A-Za-z]+$/.test(r.resourceType) || !/^[A-Za-z0-9.-]+$/.test(r.id)) continue;
    cpSync(from, join(pkg, `${r.resourceType}-${r.id}.json`));
    n++;
  }
  const cfg = parseYaml(readFileSync(join(igSource, "sushi-config.yaml"), "utf-8")) as Record<string, unknown>;
  const fhirVersion = cfg["fhirVersion"];
  writeFileSync(
    join(pkg, "package.json"),
    `${JSON.stringify(
      {
        name: String(cfg["packageId"] ?? cfg["id"] ?? ""),
        version: String(cfg["version"] ?? ""),
        ...(cfg["canonical"] ? { canonical: String(cfg["canonical"]) } : {}),
        ...(fhirVersion ? { fhirVersions: Array.isArray(fhirVersion) ? fhirVersion.map(String) : [String(fhirVersion)] } : {}),
        description: "Built from the IG's cached AST by fhir-harness build-ig-indexes.ts, not by the IG Publisher.",
      },
      null,
      2,
    )}\n`,
  );
  mkdirSync(join(out, ".."), { recursive: true });
  const t = spawnSync("tar", ["-czf", out, "-C", stage, "package"], { encoding: "utf-8" });
  if (t.status !== 0) throw new Error(`tar failed: ${t.stderr}`);
  return n;
}

/** The step name a layer above provides for the IG API sidecars. */
export const SIDECARS_STEP = "ig-site:sidecars";

/**
 * Run the layer-provided sidecars step over `clone`, and copy what it left into
 * `dir/sidecars`. Returns the copied directory, `undefined` when no layer
 * provides the step or it left nothing, or an error.
 */
export function sidecarsFor(checkout: string, clone: string, work: string, dir: string, log: (s: string) => void): { at?: string } | { error: string } {
  const entry = scriptTable(checkout).get(SIDECARS_STEP);
  if (entry === undefined) {
    log(`  sidecars: no mounted layer provides ${SIDECARS_STEP}; none bound`);
    return {};
  }
  rmSync(work, { recursive: true, force: true });
  mkdirSync(work, { recursive: true });
  const r = spawnSync("sh", ["-c", `${entry.command} --ig '${clone}' --work '${work}'`], {
    cwd: checkout,
    encoding: "utf-8",
    timeout: 900_000,
    env: { ...process.env, SITE_WORK: work, PATH: `${join(checkout, "node_modules", ".bin")}:${process.env.PATH ?? ""}` },
  });
  if (r.status !== 0) return { error: `${SIDECARS_STEP} failed: ${`${r.stdout ?? ""}${r.stderr ?? ""}`.trim().split("\n").slice(-3).join(" ")}` };
  const from = join(work, IG_API_WORK, "sidecars");
  const target = join(dir, "sidecars");
  rmSync(target, { recursive: true, force: true });
  if (!existsSync(from) || readdirSync(from).length === 0) {
    log(`  sidecars: ${SIDECARS_STEP} (${entry.manifest}) left none`);
    return {};
  }
  cpSync(from, target, { recursive: true });
  log(`  sidecars: ${readdirSync(target).length} file(s) from ${SIDECARS_STEP} (${entry.manifest})`);
  return { at: target };
}

/** Build one IG's index, menu and releases. Returns the problems; empty means built. */
export function buildOne(t: IgTarget, work: string, log: (s: string) => void, checkout = resolve(t.root, "..")): string[] {
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
  const sc = sidecarsFor(checkout, clone, join(work, `${t.name}.site-work`), dir, log);
  if ("error" in sc) return [`sidecars: ${sc.error}`];
  const sidecars = sc.at ? ["--sidecars", sc.at, "--sidecars-local", "fhir-artifact-index/sidecars"] : [];
  const committedIx = existsSync(indexPath) ? (JSON.parse(readFileSync(indexPath, "utf-8")) as Record<string, unknown>) : undefined;
  const pub = publishedBase(committedIx, declarationOf(t.root));
  log(`  published at: ${pub.base ?? "unknown"} (from ${pub.from})`);
  const built = join(work, `${t.name}.index.json`);
  const ix = run("bun", ["run", join(HERE, "ast-to-artifact-index.ts"), "--ast", ast, "--instance-id", t.name, "--out", built, ...grouping, ...sidecars, ...(pub.base ? ["--published-base", pub.base] : [])]);
  if (!ix.ok) problems.push(`index: ${ix.out}`);
  else {
    const committed = committedIx;
    const next = JSON.parse(readFileSync(built, "utf-8")) as Record<string, unknown>;
    try {
      const tgz = join(dir, "package.tgz");
      const packed = packFromAst(ast, clone, tgz, join(work, `${t.name}.package`));
      next["package"] = { url: pub.base ? `${pub.base}/package.tgz` : "fhir-artifact-index/package.tgz", localPath: "fhir-artifact-index/package.tgz", bytes: statSync(tgz).size };
      log(`  package: ${packed} resource(s) packed from the AST`);
    } catch (e) {
      problems.push(`package: ${(e as Error).message}`);
    }
    const kept = carryFromCommitted(next, committed, t.root);
    writeFileSync(indexPath, `${JSON.stringify(next, null, 2)}\n`);
    log(`  index: ${ix.out.split("\n")[0]}${kept.length ? `; kept from the committed copy: ${kept.join(", ")}` : ""}`);
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
    const problems = buildOne(t, work, (s) => console.log(s), root);
    for (const p of problems) console.error(`✗ ${t.name}: ${p}`);
    if (problems.length) failed++;
  }
  console.log(`${targets.length - failed} of ${targets.length} IG index(es) built${skipped.length ? `, ${skipped.length} skipped` : ""}`);
  return failed ? 1 : 0;
}

if (import.meta.main) process.exit(main());
