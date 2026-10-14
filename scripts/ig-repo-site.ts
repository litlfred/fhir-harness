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
 * ## `publisher-pages`: what only the Publisher writes
 *
 * The IG's narrative pages link its artefacts (`StructureDefinition-x.html`,
 * `artifacts.html`, `package.tgz`) by the names the Publisher gives them, and
 * the Jekyll build renders none of them. When the Publisher's output is at
 * hand (`output/`, where the IG's own build writes it), every file of it the
 * built site does not already hold is copied in beside the site's pages, so
 * those links land; a page the site built is never replaced by the
 * Publisher's. Then the repeated element ids the composition produces are
 * repaired (`dedupeSiteIds`). With no Publisher output, the site keeps only
 * its own pages, and says so. Last, the site's `folio-build.json` is written
 * at its root ({@link igSiteStamp}), as every folio site carries one.
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

import { composeIgSite, dedupeSiteIds, describeStage, IG_THIN_CSS_FILE, stageIgSite, type SitePalette } from "./build-ig-site";
import { buildMenu } from "./ingest-ig-menu.ts";
import { siteBuild, type SiteBuild, STAMP_FILE } from "./site-build-stamp.ts";
import { githubEditBase, instanceNeeds, webpagePalette } from "./stage-ig-sites.ts";

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

export function compose(o: { docs: string; ig: string; baseurl: string; plantumlJar?: string; log?: (s: string) => void }): void {
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
    const r = stageIgSite(src, site, {
      baseurl: o.baseurl.replace(/\/$/, ""),
      menu,
      ...(theme.palette ? { palette: theme.palette } : {}),
      ...(o.plantumlJar ? { plantumlJar: o.plantumlJar } : {}),
      ...(editBase ? { editBase } : {}),
    });
    log(`${name}:\n${describeStage(r)}`);
    if (r.siteData.refused.length) throw new Error(`${name}: the IG's site data was refused (${r.siteData.refused.join(", ")})`);
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

export function publisherPages(o: { site: string; output: string; ig?: string; log?: (s: string) => void }): { copied: number; kept: number } {
  const log = o.log ?? ((s: string) => console.error(s));
  if (!existsSync(o.site) || !statSync(o.site).isDirectory()) throw new Error(`${o.site}: no built site`);
  let copied = 0;
  let kept = 0;
  if (existsSync(o.output) && statSync(o.output).isDirectory()) {
    const all = filesUnder(o.output);
    const missing = missingFromSite(all, new Set(filesUnder(o.site)));
    for (const p of missing) {
      mkdirSync(join(o.site, p, ".."), { recursive: true });
      cpSync(join(o.output, p), join(o.site, p));
    }
    copied = missing.length;
    listUpstream(missing.filter((p) => p.endsWith(".html")));
    kept = all.length - missing.length;
    log(`publisher pages: ${copied} file(s) of ${o.output} copied in; ${kept} the site already builds itself were kept as built`);
  } else {
    log(`publisher pages: no Publisher output at ${o.output} — the site carries the IG's own pages only, and links to artefact pages do not land`);
  }
  const renamed = dedupeSiteIds(o.site);
  if (renamed.size) log(`publisher pages: repeated element ids repaired on ${renamed.size} page(s)`);
  if (o.ig !== undefined) {
    const stamp = igSiteStamp(o.ig);
    writeFileSync(join(o.site, STAMP_FILE), `${JSON.stringify(stamp, null, 2)}\n`);
    log(`publisher pages: stamped ${STAMP_FILE} — ${stamp.instance}, platform ${stamp.platform.commit.slice(0, 9)}`);
  }
  return { copied, kept };
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
