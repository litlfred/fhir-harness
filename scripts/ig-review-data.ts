#!/usr/bin/env bun
/**
 * An IG preview's review data: what changed in the IG between the default
 * branch and the branch being previewed, in the form the review page reads.
 *
 * @module fhir-harness/scripts/ig-review-data
 * @covers none — a build step: it writes a preview's review data and judges nothing
 *
 * ## Why (folio-assistant#215 walk, 2026-10-24)
 *
 * A review committee compares a change before and after on STAGING. A folio's
 * preview carries a ChangeSet, `staging.json`, the banner and a review page;
 * an IG's preview carried none of them, so the committee had nothing that said
 * what changed (smart-immunizations-uganda#12, break 6). This writes them for
 * an IG, in the folio's file formats, so the platform's one review page
 * (`gen-review-page.ts`) serves both.
 *
 * ## What a "block" is in an IG
 *
 * | source | one block per | label | links to |
 * |---|---|---|---|
 * | `input/pagecontent/<page>.md` | heading section (the text before the first heading is `<page>/_top`) | `<page>/<heading id>` | `<page>.html#<heading id>` |
 * | every other file under `input/`, and `sushi-config.yaml` | file | its path | no page: the review page shows the text diff |
 *
 * Heading ids are kramdown's, as Jekyll writes them (`kramdownId`), so a link
 * lands on the section. A source file is compared as text; a binary one (a
 * workbook) is listed as edited with no text. The comparison is by content
 * only: a section whose text is unchanged is unchanged wherever it moved, and
 * no `moved` or `renamed` aspect is reported. That is stated in the summary
 * rather than guessed at.
 *
 * Nothing here is WHO-specific: any IG's pages and sources are read the same way.
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, posix } from "node:path";

import { reviewPageHtml } from "../../cat-harness-tools/scripts/gen-review-page.ts";
import { run as injectStagingBanner, type StagingFacts } from "../../cat-harness-tools/scripts/staging-banner.ts";

export const CHANGESET_SCHEMA = "folio-changeset/v1";
export const CHANGESET_TEXT_SCHEMA = "folio-changeset-text/v1";
/** Where an IG's narrative pages are, relative to the IG root. */
export const PAGES_DIR = "input/pagecontent";

export interface IgBlockAt {
  file: string;
  kind: string;
  section: string;
  index: number;
  /** The page the block is on, relative to the site root; "" when it is on none. */
  page: string;
  /** The element id on that page, when it is not the label. */
  anchor?: string;
}
export type IgChange =
  | { change: "added"; label: string; head: IgBlockAt }
  | { change: "removed"; label: string; base: IgBlockAt }
  | { change: "changed"; label: string; aspects: ["prose"] | ["manifest"]; base: IgBlockAt; head: IgBlockAt };

interface Side { at: IgBlockAt; text?: string; hash: string }

/** kramdown's auto id: lowercase, keep letters, digits, spaces and dashes, spaces to dashes, no leading non-letter. */
export function kramdownId(heading: string): string {
  const id = heading
    .replace(/\{:[^}]*\}\s*$/, "")
    .toLowerCase()
    .replace(/[^a-z0-9 -]/g, "")
    .replace(/^[^a-z]+/, "")
    .trim()
    .replace(/ /g, "-");
  return id || "section";
}

/** A Markdown page cut at its headings (levels 1 to 6), outside fenced code. */
export function splitPage(md: string): { id: string; text: string }[] {
  const out: { id: string; text: string }[] = [];
  const seen = new Map<string, number>();
  let cur = { id: "_top", lines: [] as string[] };
  let fence: string | undefined;
  const flush = () => {
    const text = cur.lines.join("\n").trim();
    if (text || cur.id !== "_top") out.push({ id: cur.id, text });
  };
  for (const line of md.split("\n")) {
    const f = /^\s*(```+|~~~+)/.exec(line);
    if (f) fence = fence === undefined ? f[1]![0] : line.trim().startsWith(fence) ? undefined : fence;
    const h = fence === undefined ? /^#{1,6}\s+(.+?)\s*#*\s*$/.exec(line) : null;
    if (h) {
      flush();
      const base = kramdownId(h[1]!);
      const n = seen.get(base) ?? 0;
      seen.set(base, n + 1);
      cur = { id: n ? `${base}-${n}` : base, lines: [line] };
    } else cur.lines.push(line);
  }
  flush();
  return out;
}

const sha = (b: Buffer | string): string => new Bun.CryptoHasher("sha256").update(b).digest("hex");
const isBinary = (b: Buffer): boolean => b.subarray(0, 8000).includes(0);
const extKind = (p: string): string => posix.extname(p).slice(1).toLowerCase() || "file";

/** The blocks of one side, from a reader of the paths it holds. */
export function blocksOf(paths: string[], read: (p: string) => Buffer): Map<string, Side> {
  const out = new Map<string, Side>();
  // The narrative first, as a reader meets it, then the sources behind it.
  const page = (p: string) => (p.startsWith(`${PAGES_DIR}/`) ? 0 : 1);
  const sorted = [...paths].sort((a, b) => page(a) - page(b) || (a < b ? -1 : a > b ? 1 : 0));
  const perDir = new Map<string, number>();
  for (const p of sorted) {
    const buf = read(p);
    if (p.startsWith(`${PAGES_DIR}/`) && p.endsWith(".md") && !p.slice(PAGES_DIR.length + 1).includes("/") && !isBinary(buf)) {
      const page = posix.basename(p, ".md");
      splitPage(buf.toString("utf-8")).forEach((s, index) => {
        out.set(`${page}/${s.id}`, {
          at: { file: p, kind: "page-section", section: `pages::${page}`, index, page: `${page}.html`, ...(s.id === "_top" ? {} : { anchor: s.id }) },
          text: s.text,
          hash: sha(s.text),
        });
      });
      continue;
    }
    const dir = posix.dirname(p);
    const index = perDir.get(dir) ?? 0;
    perDir.set(dir, index + 1);
    const binary = isBinary(buf);
    out.set(p, { at: { file: p, kind: extKind(p), section: `sources::${dir}`, index, page: "" }, ...(binary ? {} : { text: buf.toString("utf-8") }), hash: sha(buf) });
  }
  return out;
}

export interface IgChangeSetResult {
  changeset: { $schema: string; folio: string; base: { ref: string; commit: string | null }; head: { ref: string; commit: string | null }; summary: Record<string, number>; changes: IgChange[] };
  text: { $schema: string; blocks: Record<string, { base?: { prose: string; html: string }; head?: { prose: string; html: string } }> };
}

/** Compare two sides' blocks: head reading order first, then what was removed. */
export function compareBlocks(
  base: Map<string, Side>,
  head: Map<string, Side>,
  refs: { base: { ref: string; commit: string | null }; head: { ref: string; commit: string | null } },
  html: (s: Side) => string,
): IgChangeSetResult {
  const changes: IgChange[] = [];
  const blocks: IgChangeSetResult["text"]["blocks"] = {};
  let unchanged = 0;
  const side = (s: Side) => (s.text === undefined ? undefined : { prose: s.text, html: html(s) });
  for (const [label, h] of head) {
    const b = base.get(label);
    if (!b) {
      changes.push({ change: "added", label, head: h.at });
      const t = side(h);
      blocks[label] = t ? { head: t } : {};
    } else if (b.hash === h.hash) unchanged += 1;
    else {
      changes.push({ change: "changed", label, aspects: h.text === undefined || b.text === undefined ? ["manifest"] : ["prose"], base: b.at, head: h.at });
      const bt = side(b);
      const ht = side(h);
      blocks[label] = { ...(bt ? { base: bt } : {}), ...(ht ? { head: ht } : {}) };
    }
  }
  for (const [label, b] of base) {
    if (head.has(label)) continue;
    changes.push({ change: "removed", label, base: b.at });
    const t = side(b);
    blocks[label] = t ? { base: t } : {};
  }
  const count = (k: IgChange["change"]) => changes.filter((c) => c.change === k).length;
  const aspect = (a: string) => changes.filter((c) => c.change === "changed" && (c.aspects as string[]).includes(a)).length;
  return {
    changeset: {
      $schema: CHANGESET_SCHEMA,
      folio: PAGES_DIR,
      base: refs.base,
      head: refs.head,
      summary: { added: count("added"), removed: count("removed"), changed: count("changed"), unchanged, renamed: 0, prose: aspect("prose"), manifest: aspect("manifest"), moved: 0 },
      changes,
    },
    text: { $schema: CHANGESET_TEXT_SCHEMA, blocks },
  };
}

const escapeHtml = (s: string): string => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/**
 * Markdown to HTML with the platform's renderer (remark, as the folio
 * ChangeSet renders its prose), resolved from the content core this layer
 * needs; escaped text when it cannot be loaded, which the review page still
 * diffs word by word.
 */
export async function proseRenderer(root: string): Promise<(md: string) => string> {
  try {
    const from = join(root, "folio-assistant-core");
    const { remark } = (await import(Bun.resolveSync("remark", from))) as { remark: unknown };
    const html = ((await import(Bun.resolveSync("remark-html", from))) as { default: unknown }).default;
    // Tables and the rest of GitHub's Markdown, as kramdown's GFM input renders the page.
    let gfm: unknown;
    try {
      gfm = ((await import(Bun.resolveSync("remark-gfm", from))) as { default: unknown }).default;
    } catch {
      gfm = undefined;
    }
    type Proc = { use: (p: unknown, o?: unknown) => Proc; processSync: (s: string) => unknown };
    return (md: string) => {
      let p = (remark as unknown as () => Proc)();
      if (gfm) p = p.use(gfm);
      return String(p.use(html, { sanitize: false }).processSync(md));
    };
  } catch {
    return (md: string) => `<pre>${escapeHtml(md)}</pre>`;
  }
}

function git(ig: string, args: string[], encoding: "utf-8" | "buffer" = "utf-8"): { ok: boolean; out: string; buf: Buffer } {
  const r = spawnSync("git", ["-C", ig, ...args], { encoding: encoding === "buffer" ? "buffer" : "utf-8", maxBuffer: 256 * 1024 * 1024 });
  const buf = Buffer.isBuffer(r.stdout) ? r.stdout : Buffer.from(String(r.stdout ?? ""));
  return { ok: r.status === 0, out: buf.toString("utf-8"), buf };
}

const inScope = (p: string): boolean => p === "sushi-config.yaml" || p.startsWith("input/");

/** The IG's ChangeSet from `base` (a ref) to the working tree, read with git; the base is read as data, never run. */
export function igChangeSet(o: { ig: string; base: string; render: (md: string) => string }): IgChangeSetResult {
  const baseCommit = git(o.ig, ["rev-parse", "--verify", `${o.base}^{commit}`]);
  if (!baseCommit.ok) throw new Error(`${o.base} is not a commit in ${o.ig}: fetch it first`);
  const basePaths = git(o.ig, ["ls-tree", "-r", "--name-only", o.base, "--", "input", "sushi-config.yaml"]).out.split("\n").filter((p) => p && inScope(p));
  const headPaths = git(o.ig, ["ls-files", "-co", "--exclude-standard", "--", "input", "sushi-config.yaml"]).out.split("\n").filter((p) => p && inScope(p) && existsSync(join(o.ig, p)));
  const base = blocksOf(basePaths, (p) => git(o.ig, ["show", `${o.base}:${p}`], "buffer").buf);
  const head = blocksOf(headPaths, (p) => readFileSync(join(o.ig, p)));
  const headCommit = git(o.ig, ["rev-parse", "HEAD"]);
  return compareBlocks(
    base,
    head,
    { base: { ref: o.base, commit: baseCommit.out.trim() }, head: { ref: "worktree", commit: headCommit.ok ? headCommit.out.trim() : null } },
    // A kramdown attribute line (`{:.grid}`) is Jekyll's, not text: remark would print it.
    (s) => (s.at.kind === "page-section" ? o.render((s.text ?? "").replace(/^\{:[^}\n]*\}\s*$/gm, "")) : `<pre>${escapeHtml(s.text ?? "")}</pre>`),
  );
}

/** Write `changeset.json` and `changeset-text.json` at the site root. */
export function writeReviewData(site: string, r: IgChangeSetResult): void {
  mkdirSync(site, { recursive: true });
  writeFileSync(join(site, "changeset.json"), `${JSON.stringify(r.changeset)}\n`);
  writeFileSync(join(site, "changeset-text.json"), `${JSON.stringify(r.text)}\n`);
}

/** The open pull request a preview's branch belongs to. */
export interface OpenPr {
  number: string;
  url: string;
}

/**
 * The open PR for `branch`, or `null` when there is none or it cannot be
 * found (bean zvl0). A `pull_request` run names its PR in the event payload,
 * so that is read first and needs no network. A run started by hand
 * (`workflow_dispatch`) carries no PR, so the REST API is asked for the
 * branch's open PRs (`pulls?head=owner:branch`). A token is used when the
 * environment has one; without it the call is anonymous, which a public
 * repository allows. Any failure reads as "no PR found", never as a guess.
 */
export async function openPrFor(
  ownerRepo: string,
  branch: string,
  o: { env?: Record<string, string | undefined>; fetch?: typeof fetch } = {},
): Promise<OpenPr | null> {
  const env = o.env ?? process.env;
  const eventPath = env.GITHUB_EVENT_PATH;
  if (eventPath && existsSync(eventPath)) {
    try {
      const pr = (JSON.parse(readFileSync(eventPath, "utf-8")) as { pull_request?: { number?: number; html_url?: string } }).pull_request;
      if (pr?.number) return { number: String(pr.number), url: pr.html_url ?? `https://github.com/${ownerRepo}/pull/${pr.number}` };
    } catch {
      // An unreadable payload is not a PR; fall through to the lookup.
    }
  }
  const [owner] = ownerRepo.split("/");
  const token = env.GITHUB_TOKEN || env.GH_TOKEN;
  const api = `https://api.github.com/repos/${ownerRepo}/pulls?state=open&head=${encodeURIComponent(`${owner}:${branch}`)}`;
  try {
    const res = await (o.fetch ?? fetch)(api, {
      headers: { accept: "application/vnd.github+json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
    });
    if (!res.ok) return null;
    const list = (await res.json()) as { number?: number; html_url?: string }[];
    const pr = Array.isArray(list) ? list[0] : undefined;
    return pr?.number ? { number: String(pr.number), url: pr.html_url ?? `https://github.com/${ownerRepo}/pull/${pr.number}` } : null;
  } catch {
    return null;
  }
}

/**
 * Everything a preview's review needs, written into the finished site before
 * it is published: the ChangeSet and its text, the review page at
 * `review/index.html`, and the staging banner with its `staging.json` (the
 * preview's stamp file, owner's option A on bean lx2s). Each is the file the
 * folio route writes, so the platform's review page and banner read them
 * unchanged.
 */
export function igPreviewData(
  site: string,
  f: { ig: string; render: (md: string) => string; branch: string; sha: string; base: string; ownerRepo: string; runUrl: string; pr?: OpenPr | null },
  log: (s: string) => void,
): void {
  const fetched = git(f.ig, ["fetch", "-q", "origin", f.base]).ok;
  const base = fetched ? "FETCH_HEAD" : `origin/${f.base}`;
  try {
    const r = igChangeSet({ ig: f.ig, base, render: f.render });
    r.changeset.base.ref = f.base;
    writeReviewData(site, r);
    const s = r.changeset.summary;
    log(`· review data: ${f.base} → ${f.branch}: ${s.added} added, ${s.removed} removed, ${s.changed} changed, ${s.unchanged} unchanged (changeset.json, changeset-text.json)`);
  } catch (e) {
    log(`· no ChangeSet on this preview: ${(e as Error).message}`);
  }
  mkdirSync(join(site, "review"), { recursive: true });
  writeFileSync(join(site, "review", "index.html"), reviewPageHtml("../"));
  const [owner, name] = f.ownerRepo.split("/");
  const gh = `https://github.com/${f.ownerRepo}`;
  // The published root's pages, so the banner can say which pages are new; unknown when gh-pages cannot be read.
  let newPages: string[] = [];
  let mainPagesKnown = false;
  if (git(f.ig, ["fetch", "-q", "--depth", "1", "origin", "gh-pages"]).ok) {
    const listed = new Set(git(f.ig, ["ls-tree", "-r", "--name-only", "FETCH_HEAD"]).out.split("\n").filter((p) => p.endsWith(".html") && !p.startsWith("STAGING/")));
    if (listed.size) {
      mainPagesKnown = true;
      const here: string[] = [];
      const walk = (d: string, rel: string) => {
        for (const e of readdirSync(d, { withFileTypes: true })) {
          const r = rel ? `${rel}/${e.name}` : e.name;
          if (e.isDirectory()) walk(join(d, e.name), r);
          else if (e.name.endsWith(".html")) here.push(r);
        }
      };
      walk(site, "");
      newPages = here.filter((p) => !listed.has(p)).sort();
    }
  }
  const facts: StagingFacts = {
    branch: f.branch,
    sha: f.sha.slice(0, 7),
    built: new Date().toISOString().replace(/\.\d+Z$/, "Z"),
    // `"n/a"` is the banner's "no open PR found"; its link still searches the branch's PRs.
    pr: f.pr?.number ?? "n/a",
    prUrl: f.pr?.url ?? `${gh}/pulls?q=head%3A${encodeURIComponent(f.branch)}`,
    branchUrl: `${gh}/tree/${f.branch}`,
    issue: null,
    issueUrl: null,
    runUrl: f.runUrl,
    mainSite: `https://${owner}.github.io/${name}/`,
    beforeRef: f.base,
    mainPagesKnown,
    newPages,
  };
  const b = injectStagingBanner(site, facts);
  log(`· staging banner on ${b.injected} page(s)${b.skipped ? ` (${b.skipped} already carried it)` : ""}, staging.json written; the review page at review/`);
  if (b.noBody.length) throw new Error(`${b.noBody.length} page(s) have no <body>, so they would carry no staging banner: ${b.noBody.slice(0, 10).join(", ")}`);
}

if (import.meta.main) {
  const argv = process.argv.slice(2);
  const opt = (k: string) => {
    const i = argv.indexOf(`--${k}`);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  const ig = opt("ig") ?? ".";
  const site = opt("site");
  const base = opt("base") ?? "origin/main";
  if (!site) {
    console.error("usage: ig-review-data.ts --site <built site> [--ig <checkout>] [--base origin/main] [--root <platform root>]");
    process.exit(2);
  }
  const r = igChangeSet({ ig, base, render: await proseRenderer(opt("root") ?? ig) });
  writeReviewData(site, r);
  const s = r.changeset.summary;
  console.log(`ig-review-data: ${base} → worktree: ${s.added} added, ${s.removed} removed, ${s.changed} changed, ${s.unchanged} unchanged`);
}
