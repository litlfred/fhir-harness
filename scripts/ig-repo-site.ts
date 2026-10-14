#!/usr/bin/env bun
/**
 * An IG repository's OWN site, from its checkout alone: the two steps the
 * platform's site build runs for a repository that holds an implementation
 * guide and no instance declaration of its own.
 *
 * @module fhir-harness/scripts/ig-repo-site
 * @covers none — a build step: it composes an IG into a site and judges no declared graph
 *
 * ```sh
 * bun run fhir-harness/scripts/ig-repo-site.ts compose <site source> [--ig <checkout>] [--baseurl <base>] [--plantuml-jar <jar>]
 * bun run fhir-harness/scripts/ig-repo-site.ts publisher-pages <built site> [--ig <checkout>] [--output <dir>]
 * ```
 *
 * The checkout scripts `ig-site:compose` and `ig-site:publisher-pages`
 * (`package.json` `checkoutScripts`) are these two, and that is how the
 * platform finds them: it asks the mounted layers' script table for those
 * names and never names this layer.
 *
 * ## Why there is no instance here
 *
 * Owner, 2026-10-14: an IG repository "doesn't need its own harness. It can
 * just define index.config.json and reference [its base harness] as a
 * dependency." So nothing here reads a declaration of the IG. What the earlier
 * route (`stage-ig-sites --only <instance> --source .`) read from one, it now
 * reads from the IG itself:
 *
 * - the **menu** from `sushi-config.yaml` `menu:`, at build time
 *   (`buildMenu`, the same reader `ingest-ig-menu` commits with). Never
 *   committed: a committed copy is one more file to drift from the config it
 *   was read from;
 * - the **palette** from the webpage theme of the layer the repository mounts
 *   at the top of its `index.config.json` closure ({@link topMounts}): the
 *   instances it lists that no other listed instance `needs`. That is the
 *   `needs` the repository would have declared;
 * - the **edit links** from the checkout's own `origin`.
 *
 * ## `compose`: the IG's pages, at the site root
 *
 * The IG's `input/` and `sushi-config.yaml` are staged as one just-the-docs
 * source (`stageIgSite`) and composed at the ROOT of the host source the
 * platform's chrome step wrote (`composeIgSite --at-root`): the IG IS the site.
 * A path both write is refused, never overwritten.
 *
 * The IG's ARTEFACT pages are thin pages built from the Publisher's
 * structured output ({@link artefactPages}: the artefact index reconstructed
 * from `output/`, then `gen-ig-pages.ts --ig-site`), so `artifacts.html`,
 * `toc.html` and `artifact/<Type>-<id>.html` are the site's own pages over
 * JSON-LD nodes, and the narrative's links to `<Type>-<id>.html` are pointed
 * at them (`relinkArtifacts`). `ig-render-jekyll` §"Thin pages, the default".
 *
 * Each artefact's TAB VIEWS are thin pages too (owner, 2026-10-14, answering
 * whether the Publisher's per-artefact tabs are rendered: "3. Render them
 * too"): `artifact/<Type>-<id>-definitions.html`, `-mappings.html`, the JSON
 * view (`.json.html`, a profile's `.profile.json.html`) and `-examples.html`
 * where an artefact claims the profile, at the Publisher's file names beside
 * the artefact's page, drawn from the Publisher's `<Type>-<id>.json` the site
 * carries as data. The narrative's links to those names are pointed at them
 * as its links to the artefact pages are. The Publisher's `comparison-v*`
 * directories are not rendered and not published.
 *
 * ## `publisher-pages`: the Publisher's data, never its HTML
 *
 * The site's pages and the thin artefact pages link the Publisher's DATA by
 * the names the Publisher gives it (`<Type>-<id>.json`, `package.tgz`, the
 * IG API sidecars, images). Every such file of `output/` the built site does
 * not already hold is copied in. The Publisher's finished HTML is NEVER
 * copied (owner, 2026-10-14: "I DO NOT WANT THE IG PUBLISHER HTML";
 * `ig-render-jekyll`: rendered "rather than copying the Publisher's finished
 * HTML into place"), nor its XML and Turtle (§"1. JSON only"); the count not
 * taken is reported. A Publisher page with no rendering here is a dead link
 * the IG's pages make, reported by the site build, not papered over with the
 * Publisher's copy. Then the repeated element ids the composition produces
 * are repaired (`dedupeSiteIds`), and the site's `folio-build.json` is
 * written at its root ({@link igSiteStamp}), as every folio site carries one.
 *
 * ## Whose dead links
 *
 * Both steps list the built pages they put in the site in the file the site
 * build names in `FOLIO_SITE_UPSTREAM_PAGES`. Those pages carry the IG's OWN
 * links: a dead one is the IG's to fix (the Publisher's output alone holds
 * thousands, measured on one IG), so the site build reports it and does not
 * refuse the publish over it, while a dead link in the chrome still refuses.
 */
import { spawnSync } from "node:child_process";
import { appendFileSync, cpSync, writeFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join, relative, resolve, sep } from "node:path";

import { parse as parseYaml } from "yaml";

import { conceptOf, profilesOf } from "./ast-to-artifact-index.ts";
import { composeIgSite, dedupeSiteIds, describeStage, IG_THIN_CSS_FILE, stageIgSite, type SitePalette } from "./build-ig-site";
import { buildMenu } from "./ingest-ig-menu.ts";
import { siteBuild, type SiteBuild, STAMP_FILE } from "./site-build-stamp.ts";
import { artifactsFor, copyDocsInto, footerFor, githubEditBase, instanceNeeds, webpagePalette } from "./stage-ig-sites.ts";

/**
 * The file, named by the site build in this variable, in which a step lists
 * the built pages whose links are the IG's own: their dead links are the IG's
 * to fix, and the site build reports them rather than refusing the publish.
 * Unset (the script run by hand), nothing is listed.
 */
export const UPSTREAM_PAGES_ENV = "FOLIO_SITE_UPSTREAM_PAGES";

function listUpstream(pages: readonly string[]): void {
  const f = process.env[UPSTREAM_PAGES_ENV];
  if (f && pages.length) appendFileSync(f, `${pages.join("\n")}\n`);
}

/** The page a Jekyll source file builds to, by Jekyll's default permalink; undefined for a file that is not a page. */
export function builtPage(sourcePath: string): string | undefined {
  if (/(^|\/)_/.test(sourcePath)) return undefined;
  const m = /^(.*)\.(md|markdown|html)$/.exec(sourcePath);
  return m ? `${m[1]}.html` : undefined;
}

/** The thin pages' stylesheet, beside the generator that writes it for an instance's artefact pages. */
const THIN_CSS_SOURCE = join(import.meta.dir, "templates", "ig-pages", "ig-artifact.css");

/** The checkout scripts this module provides, by the names the platform asks for. */
export const IG_SITE_SCRIPTS = { compose: "ig-site:compose", publisherPages: "ig-site:publisher-pages" } as const;

/**
 * The instances a repository mounts that nothing else it mounts needs: the
 * top of its `index.config.json` closure. Pure over the listed names and each
 * one's `needs`.
 */
export function topMounts(listed: readonly string[], needs: (name: string) => readonly string[]): string[] {
  const needed = new Set(listed.flatMap((n) => needs(n)));
  return listed.filter((n) => !needed.has(n));
}

/** The instance names `index.config.json` lists, in its order; empty without one. */
export function listedInstances(root: string): string[] {
  const f = join(root, "index.config.json");
  if (!existsSync(f)) return [];
  const c = JSON.parse(readFileSync(f, "utf-8")) as { instances?: { name?: unknown }[] };
  return (c.instances ?? []).map((i) => i.name).filter((n): n is string => typeof n === "string");
}

/**
 * The palette the IG's site wears: the one webpage theme the top mounts
 * declare, each inheriting along its own `needs`. Two tops with a theme each
 * is refused, as two themes in one instance are: nothing says which.
 */
export function topMountPalette(root: string): { palette?: SitePalette; note: string } {
  const tops = topMounts(listedInstances(root), (n) => instanceNeeds(root, n));
  if (tops.length === 0) return { note: "index.config.json lists no instance: no webpage theme" };
  const found = tops.map((t) => ({ t, ...webpagePalette(root, t) }));
  const hits = found.filter((f) => f.palette !== undefined);
  if (hits.length > 1) throw new Error(`the mounted layers ${hits.map((h) => h.t).join(" and ")} each give a webpage theme — nothing says which dresses this IG's site`);
  return hits[0] ? { palette: hits[0].palette!, note: hits[0].note } : { note: found.map((f) => f.note).join("; ") };
}

/** The name the composition files the IG's includes and data under: the repository's own. */
export function siteName(ig: string): string {
  const r = spawnSync("git", ["-C", ig, "config", "--get", "remote.origin.url"], { encoding: "utf-8" });
  const m = r.status === 0 ? /([^/:]+?)(?:\.git)?\/?$/.exec(r.stdout.trim()) : null;
  return m?.[1] ?? basename(resolve(ig));
}

/** The IG's title, from `sushi-config.yaml`; undefined when it states none. */
export function igTitle(ig: string): string | undefined {
  const f = join(ig, "sushi-config.yaml");
  if (!existsSync(f)) return undefined;
  const y = (parseYaml(readFileSync(f, "utf-8")) ?? {}) as { title?: unknown; name?: unknown };
  const t = typeof y.title === "string" ? y.title : typeof y.name === "string" ? y.name : undefined;
  return t?.trim() || undefined;
}

/** `https://github.com/<o>/<r>` from the checkout's origin, or undefined. */
function githubRepo(ig: string): string | undefined {
  const r = spawnSync("git", ["-C", ig, "config", "--get", "remote.origin.url"], { encoding: "utf-8" });
  const m = r.status === 0 ? /github\.com[/:]([^/]+)\/([^/]+?)(?:\.git)?\/?$/.exec(r.stdout.trim()) : null;
  return m ? `https://github.com/${m[1]}/${m[2]}` : undefined;
}

/**
 * Top-level paths of the checkout that are not the IG's source: the mounts
 * `index.lock.json` lays down, git's own directory, and the Publisher's build
 * products (its `.gitignore` names them too). Copying them would stage the
 * platform as if it were the IG.
 */
export function notSource(root: string): Set<string> {
  const out = new Set([".git", "node_modules", "output", "temp", "template", "input-cache", "fsh-generated"]);
  const lock = join(root, "index.lock.json");
  if (existsSync(lock)) {
    for (const i of (JSON.parse(readFileSync(lock, "utf-8")) as { instances?: { path?: unknown }[] }).instances ?? []) {
      if (typeof i.path === "string" && i.path !== "" && i.path !== ".") out.add(i.path.split("/")[0]!);
    }
  }
  return out;
}

/**
 * The representations of an artefact this site TAKES from the Publisher
 * (`ig-render-jekyll` §"1. JSON only"): its JSON, and its page's address,
 * which the thin page keeps (`artifact/<Type>-<id>.html` names it as where
 * the narrative's other links go). XML and Turtle are not taken; an instance
 * that needs RDF projects the JSON-LD.
 */
const TAKEN_FORMATS = new Set(["json", "html"]);
/** Publisher output files never copied into the site: its finished pages, and the serialisations the render path refuses. */
export const NOT_TAKEN = /\.(html?|xml|ttl)$/i;
/**
 * The Publisher's version comparisons (`comparison-v<version>/`): its own
 * pages and the fonts, stylesheets and images they wear. Not rendered here,
 * so none of it is copied (owner, 2026-10-14: "2a").
 */
export const NOT_TAKEN_DIR = /^comparison-v[^/]*\//;

/** Whether `ig-site:publisher-pages` copies this Publisher output file (a path relative to `output/`). */
export function takenFromOutput(path: string): boolean {
  return !NOT_TAKEN.test(path) && !NOT_TAKEN_DIR.test(path);
}

/**
 * Drop the representations the site does not take from an ingested index,
 * and say how many: a refusal recorded, not a silent drop.
 */
export function takeJsonOnly(indexFile: string): Record<string, number> {
  const ix = JSON.parse(readFileSync(indexFile, "utf-8")) as { artifacts: { published: Record<string, unknown> }[] };
  const refused: Record<string, number> = {};
  for (const a of ix.artifacts) {
    for (const f of Object.keys(a.published)) {
      if (TAKEN_FORMATS.has(f)) continue;
      refused[f] = (refused[f] ?? 0) + 1;
      delete a.published[f];
    }
  }
  writeFileSync(indexFile, `${JSON.stringify(ix, null, 2)}\n`);
  return refused;
}

/**
 * What each artefact's own JSON states about itself — its `meta.profile` and
 * its `code` concept — copied into the index from the Publisher's
 * `<Type>-<id>.json` in `output/`, as `ast-to-artifact-index` copies them
 * from the AST. Nothing is looked up. The index node carries them
 * (`statedFacts`), so the artifacts page can show an instance's profile and
 * code, and a profile's examples view (owner, 2026-10-14: "3. Render them
 * too") can list what claims it. Returns how many artefacts state either.
 */
export function stateFromOutput(indexFile: string, output: string): number {
  const ix = JSON.parse(readFileSync(indexFile, "utf-8")) as { artifacts: { resourceType: string; id: string; canonical?: string; profiles?: string[]; code?: unknown }[] };
  let stated = 0;
  for (const a of ix.artifacts) {
    const f = join(output, `${a.resourceType}-${a.id}.json`);
    if (!existsSync(f)) continue;
    let r: Parameters<typeof profilesOf>[0];
    try {
      r = JSON.parse(readFileSync(f, "utf-8")) as Parameters<typeof profilesOf>[0];
    } catch {
      continue;
    }
    const profiles = a.profiles ?? profilesOf(r);
    const code = a.code ?? conceptOf(r);
    if (profiles) a.profiles = profiles;
    if (code) a.code = code;
    if (profiles || code) stated += 1;
  }
  writeFileSync(indexFile, `${JSON.stringify(ix, null, 2)}\n`);
  return stated;
}

/**
 * The IG's artefact pages, THIN (`ig-render-jekyll` §"Thin pages, the
 * default"), from the Publisher's STRUCTURED output — never its finished HTML
 * (owner, 2026-10-14: "I DO NOT WANT THE IG PUBLISHER HTML"). The artefact
 * index is reconstructed from `output/` (`ingest-ig-artifacts.ts`: the
 * package's `.index.json`, `canonicals.json`, the manifest, and the category
 * the Publisher's artifact list states, read as data), and `gen-ig-pages.ts`
 * writes one thin page and one JSON-LD node per artefact plus the index node
 * the site's thin `artifacts.html` and `toc.html` draw. Undefined, and said,
 * when there is no Publisher output to read.
 */
export function artefactPages(o: { ig: string; output: string; work: string; name: string; label: string; baseurl: string; log: (s: string) => void }): string | undefined {
  if (!existsSync(join(o.output, "package.manifest.json")) && !existsSync(join(o.output, "package.tgz"))) {
    o.log(`${o.name}: no Publisher output at ${o.output} — no artefact pages, and artifacts.html stays a menu item this build does not hold`);
    return undefined;
  }
  const inst = join(o.work, "artefacts", o.name);
  mkdirSync(inst, { recursive: true });
  const bun = (script: string, args: string[]): void => {
    const r = spawnSync("bun", ["run", join(import.meta.dir, script), ...args], { cwd: o.ig, encoding: "utf-8" });
    if (r.status !== 0) throw new Error(`${script} failed (exit ${r.status}):\n${(r.stderr || r.stdout).trim().split("\n").slice(-15).join("\n")}`);
    const last = (r.stderr || "").trim().split("\n").slice(0, 3).join("\n  ");
    if (last) o.log(`  ${last}`);
  };
  // The site's own address: the JSON each node names is served beside the site's pages.
  bun("ingest-ig-artifacts.ts", ["--source", o.output, "--out", inst, "--id", o.name, "--base", o.baseurl, "--kind", "output"]);
  const refused = takeJsonOnly(join(inst, "fhir-artifact-index", "index.json"));
  const said = Object.entries(refused).map(([f, n]) => `${n} ${f}`).join(", ");
  if (said) o.log(`${o.name}: representations not taken (JSON only; RDF is projected from the JSON-LD): ${said}`);
  const stated = stateFromOutput(join(inst, "fhir-artifact-index", "index.json"), o.output);
  o.log(`${o.name}: ${stated} artefact(s) state a profile or a code in their own JSON`);
  // `--publisher-data .`: the Publisher's `<Type>-<id>.json` is served at the
  // site root (`publisher-pages` copies it as data), so each thin artefact
  // page and its tab views draw the resource from there.
  bun("gen-ig-pages.ts", ["--instance", inst, "--label", o.label, "--ig-site", "--publisher-data", "."]);
  return inst;
}

export function compose(o: { docs: string; ig: string; baseurl: string; output?: string; plantumlJar?: string; log?: (s: string) => void }): void {
  const log = o.log ?? ((s: string) => console.error(s));
  const ig = resolve(o.ig);
  if (!existsSync(join(ig, "sushi-config.yaml"))) throw new Error(`${ig} holds no sushi-config.yaml: not an IG checkout`);
  if (!existsSync(o.docs)) throw new Error(`${o.docs}: no host site source to compose into`);
  const name = siteName(ig);
  const work = mkdtempSync(join(tmpdir(), "ig-repo-site-"));
  try {
    const src = join(work, "src");
    const skip = notSource(ig);
    mkdirSync(src, { recursive: true });
    for (const e of readdirSync(ig)) if (!skip.has(e)) cpSync(join(ig, e), join(src, e), { recursive: true });
    const menu = buildMenu(ig, new Date().toISOString().slice(0, 10));
    log(`${name}: menu read from sushi-config.yaml at build time — ${menu.groups.length} group(s)`);
    const theme = topMountPalette(ig);
    log(theme.note);
    const gh = githubRepo(ig);
    const editBase = gh ? githubEditBase(gh) : undefined;
    const site = join(work, "site");
    const baseurl = o.baseurl.replace(/\/$/, "");
    const label = igTitle(ig) ?? name;
    const inst = artefactPages({ ig, output: resolve(o.output ?? join(ig, "output")), work, name, label, baseurl, log });
    const r = stageIgSite(src, site, {
      baseurl,
      menu,
      ...(inst ? { artifacts: artifactsFor(inst, "artifact/"), footer: footerFor(inst, "") } : {}),
      ...(theme.palette ? { palette: theme.palette } : {}),
      ...(o.plantumlJar ? { plantumlJar: o.plantumlJar } : {}),
      ...(editBase ? { editBase } : {}),
    });
    log(`${name}:\n${describeStage(r)}`);
    if (r.siteData.refused.length) throw new Error(`${name}: the IG's site data was refused (${r.siteData.refused.join(", ")})`);
    if (inst) {
      const d = copyDocsInto(join(inst, "docs"), site);
      log(`${name}: ${d.copied} artefact page and node file(s) built into the site${d.merged.length ? `; front matter laid onto ${d.merged.join(", ")}` : ""}`);
      if (d.collisions.length) throw new Error(`${name}: ${d.collisions.length} artefact file(s) the IG's own pages already write — refusing two answers for one URL:\n  ${d.collisions.slice(0, 20).join("\n  ")}`);
    }
    const before = new Set(filesUnder(resolve(o.docs)));
    const c = composeIgSite(site, resolve(o.docs), name, { atRoot: true });
    listUpstream(filesUnder(resolve(o.docs)).filter((f) => !before.has(f)).map(builtPage).filter((p): p is string => p !== undefined));
    log(`${name}: composed at the site root — ${c.pages} page(s), ${c.files - c.pages} other file(s), ${c.includes} include(s)`);
    // The thin layout links the shared thin-page stylesheet, which the artefact
    // page generator writes when an instance has one; here nothing else does.
    const thinCss = join(resolve(o.docs), IG_THIN_CSS_FILE);
    if (!existsSync(thinCss)) {
      mkdirSync(join(thinCss, ".."), { recursive: true });
      cpSync(THIN_CSS_SOURCE, thinCss);
    }
    if (c.collisions.length) throw new Error(`${name}: ${c.collisions.length} path(s) the host source already holds — refusing two answers for one URL:\n  ${c.collisions.slice(0, 20).join("\n  ")}`);
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}

/** Every file under `dir`, relative to it, `/`-separated. */
function filesUnder(dir: string): string[] {
  const out: string[] = [];
  const walk = (d: string): void => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const p = join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.isFile()) out.push(relative(dir, p).split(sep).join("/"));
    }
  };
  walk(dir);
  return out;
}

/**
 * The Publisher output files a built site lacks. Pure over the two listings:
 * a path the site holds is the site's, whatever the Publisher wrote there.
 */
export function missingFromSite(publisher: readonly string[], site: ReadonlySet<string>): string[] {
  return publisher.filter((p) => !site.has(p));
}

/**
 * The platform commit a site was built with: the `cat-harness-tools` mount
 * `index.lock.json` pins (the toolset that draws the chrome), else the first
 * mount it pins. A checkout that only mounts layers has no platform checkout
 * of its own to ask `git` about.
 */
export function platformCommit(root: string): string | undefined {
  const lock = join(root, "index.lock.json");
  if (!existsSync(lock)) return undefined;
  const mounts = ((JSON.parse(readFileSync(lock, "utf-8")) as { mounts?: { harness?: unknown; ref?: unknown }[] }).mounts ?? []).filter((m) => typeof m.ref === "string" && m.ref !== "");
  return (mounts.find((m) => m.harness === "cat-harness-tools") ?? mounts[0])?.ref as string | undefined;
}

/**
 * The site's `folio-build.json` (`site-build-stamp.ts`): what built it, read
 * from the runner's environment and, where that is silent (an agent's own
 * run), from the checkout. Every folio site carries one at its root, and the
 * publisher's root guard recognises a folio site by it, so a bare IG deploy
 * never overwrites this one.
 */
export function igSiteStamp(ig: string, env: Record<string, string | undefined> = process.env, now = new Date()): SiteBuild {
  const git = (...a: string[]): string | undefined => {
    const r = spawnSync("git", ["-C", ig, ...a], { encoding: "utf-8" });
    return r.status === 0 ? r.stdout.trim() || undefined : undefined;
  };
  const platform = platformCommit(ig) ?? git("rev-parse", "HEAD");
  if (!platform) throw new Error(`${ig}: no index.lock.json pin and no git commit to name the platform this site was built with`);
  const repo = /github\.com[/:]([^/]+\/[^/]+?)(?:\.git)?\/?$/.exec(git("config", "--get", "remote.origin.url") ?? "")?.[1];
  return siteBuild(siteName(ig), platform, {
    GITHUB_REPOSITORY: env.GITHUB_REPOSITORY ?? repo,
    GITHUB_REF_NAME: env.GITHUB_REF_NAME ?? git("rev-parse", "--abbrev-ref", "HEAD"),
    GITHUB_SHA: env.GITHUB_SHA ?? git("rev-parse", "HEAD"),
  }, now);
}

/**
 * The IG Publisher's page chrome: its stylesheets (`fhir.css`,
 * `bootstrap-fhir.css`) and its "Generated <date>" footer. A page carrying
 * any of them is the Publisher's finished HTML, which this site never
 * publishes (owner, 2026-10-14).
 */
export const PUBLISHER_CHROME: readonly RegExp[] = [
  /<link\b[^>]*href="(?:[^"]*\/)?fhir\.css"/i,
  /bootstrap-fhir\.css/i,
  /Generated <span title="/,
];

/** The built pages that carry the Publisher's chrome, relative to the site. */
export function publisherChromePages(site: string): string[] {
  return filesUnder(site).filter((p) => /\.html?$/i.test(p) && PUBLISHER_CHROME.some((re) => re.test(readFileSync(join(site, p), "utf-8"))));
}

export function publisherPages(o: { site: string; output: string; ig?: string; log?: (s: string) => void }): { copied: number; kept: number; refused: number } {
  const log = o.log ?? ((s: string) => console.error(s));
  if (!existsSync(o.site) || !statSync(o.site).isDirectory()) throw new Error(`${o.site}: no built site`);
  let copied = 0;
  let kept = 0;
  let refused = 0;
  if (existsSync(o.output) && statSync(o.output).isDirectory()) {
    // NEVER the Publisher's finished HTML (`ig-render-jekyll`: the IG is
    // rendered "populated from the Publisher's structured output, rather than
    // copying the Publisher's finished HTML into place"; owner, 2026-10-14:
    // "I DO NOT WANT THE IG PUBLISHER HTML"), and not the XML and Turtle the
    // render path refuses (§"1. JSON only"), and nothing under the
    // Publisher's `comparison-v*/`, fonts and stylesheets included (owner,
    // 2026-10-14: "2a"). The artefact pages are the thin
    // pages `compose` built; what is copied is the data and the files the
    // site's pages link: the JSON, the package, the images.
    const all = filesUnder(o.output);
    const taken = all.filter(takenFromOutput);
    refused = all.length - taken.length;
    const missing = missingFromSite(taken, new Set(filesUnder(o.site)));
    for (const p of missing) {
      mkdirSync(join(o.site, p, ".."), { recursive: true });
      cpSync(join(o.output, p), join(o.site, p));
    }
    copied = missing.length;
    kept = taken.length - missing.length;
    log(`publisher pages: ${copied} file(s) of ${o.output} copied in; ${kept} the site already holds were kept; ${refused} not taken (the Publisher's HTML, XML and Turtle, and everything under comparison-v*/)`);
  } else {
    log(`publisher pages: no Publisher output at ${o.output} — the site carries the IG's own pages only, and links to artefact pages do not land`);
  }
  // The guard: whatever put it there, a page wearing the Publisher's chrome is not published.
  const chrome = publisherChromePages(o.site);
  if (chrome.length) throw new Error(`${chrome.length} page(s) of the built site carry the IG Publisher's chrome (fhir.css, bootstrap-fhir.css or its "Generated" footer) — the Publisher's HTML is not published:\n  ${chrome.slice(0, 20).join("\n  ")}`);
  const renamed = dedupeSiteIds(o.site);
  if (renamed.size) log(`publisher pages: repeated element ids repaired on ${renamed.size} page(s)`);
  if (o.ig !== undefined) {
    const stamp = igSiteStamp(o.ig);
    writeFileSync(join(o.site, STAMP_FILE), `${JSON.stringify(stamp, null, 2)}\n`);
    log(`publisher pages: stamped ${STAMP_FILE} — ${stamp.instance}, platform ${stamp.platform.commit.slice(0, 9)}`);
  }
  return { copied, kept, refused };
}

if (import.meta.main) {
  const [cmd, target, ...rest] = process.argv.slice(2);
  const opt = (k: string): string | undefined => {
    const i = rest.indexOf(`--${k}`);
    return i >= 0 ? rest[i + 1] : undefined;
  };
  const ig = resolve(opt("ig") ?? ".");
  try {
    if (cmd === "compose" && target) {
      const baseurl = opt("baseurl") ?? process.env.FOLIO_SITE_BASEURL;
      if (baseurl === undefined) throw new Error("compose needs --baseurl, or FOLIO_SITE_BASEURL from the site build");
      compose({ docs: resolve(target), ig, baseurl, ...(opt("plantuml-jar") ? { plantumlJar: opt("plantuml-jar")! } : {}) });
    } else if (cmd === "publisher-pages" && target) {
      publisherPages({ site: resolve(target), output: resolve(opt("output") ?? join(ig, "output")), ig });
    } else {
      console.error("usage: ig-repo-site.ts compose <site source> [--ig <checkout>] [--baseurl <base>] [--plantuml-jar <jar>]\n       ig-repo-site.ts publisher-pages <built site> [--ig <checkout>] [--output <dir>]");
      process.exit(2);
    }
  } catch (e) {
    console.error(`✗ ig-repo-site ${cmd}: ${(e as Error).message}`);
    process.exit(1);
  }
}
