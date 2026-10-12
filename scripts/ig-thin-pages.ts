/**
 * The THIN artefact page: one IG artefact's rendering, a few KB of identity
 * and a pointer, drawn in the browser from the artefact's JSON-LD node.
 *
 * @module fhir-harness/scripts/ig-thin-pages
 * @covers ig-pages, ig-artifact-jsonld
 *
 * ## Why
 *
 * The owner, 2026-10-11, option A: *"i still want fhir IG output like how
 * litlfred/smart-trust or litlfred/smart-immuz is done. tiny html w/ dynamic
 * load from json(ld) KG"*. A full artefact page (`gen-ig-pages.ts` without
 * `--thin`) is a just-the-docs page of about 170-230 KB, of which 5-8 KB is
 * the artefact; the rest is the theme's chrome, written into every page
 * (`folio-assistant-gp2f`, #1885). This page carries none of it: the rail is
 * LINKED (`NAVBAR_LINKED`, which the build's rail pass honours), and the
 * content is the node's.
 *
 * ## The helper is reused, not copied
 *
 * {@link thinPageHtml} is cat-harness-tools' (`scripts/thin-page.ts`), the one
 * the OpenAPI operation pages and the library entries follow. fhir-harness may
 * import it: this layer `needs` folio-assistant-core, which sits above
 * cat-harness-tools, so the import runs down the layer order
 * (`check:import-direction`), as `gen-ig-pages.ts`' imports of
 * `route-authority.ts` and `viewer-declarations.ts` already do.
 *
 * ## The address stays the Publisher's
 *
 * `artifact/<Type>-<id>.html`, the file the full page was: the IG's artifacts
 * page, its narrative's links (`ast-pages.json`) and the footer's reading
 * order all name it. So the page passes its file name as `canonical` rather
 * than the helper's `./`.
 *
 * Nothing here may know about WHO (fhir-harness/AGENTS.md).
 */
import { escHtml, thinPageHtml } from "../../cat-harness-tools/scripts/thin-page.ts";
import type { FhirArtifact, FhirArtifactIndex } from "../schemas/fhir-artifact-index.js";
import { ARTIFACT_DIR, artifactPageName, localResourceHref } from "./ig-artifact-jsonld.ts";

/** The config block's id — how a run, or a check, recognises a thin artefact page. */
export const THIN_PAGE_CONFIG_ID = "ig-artifact-page";
/** The shared renderer and its stylesheet, under the docs root. */
export const THIN_PAGE_SCRIPT = "assets/ig-artifact.js";
export const THIN_PAGE_STYLE = "assets/ig-artifact.css";

export interface ThinArtifactOptions {
  /** The IG's display name. */
  label: string;
  /** The IG's home, relative to an artefact page. */
  home: string;
  /** The artefact index page, relative to an artefact page. */
  all: string;
  /** The table of contents, relative to an artefact page, when the site has one. */
  toc?: string;
  /** The reading order's neighbours, relative to the page. */
  prev?: string;
  next?: string;
  /** `gen-ig-pages --compiled-data`. */
  compiledData?: string;
}

/** The thin page for one artefact, as `artifact/<Type>-<id>.html`. Deterministic. */
export function thinArtifactPage(ix: FhirArtifactIndex, a: FhirArtifact, o: ThinArtifactOptions): string {
  const stem = artifactPageName(a);
  const name = a.title ?? a.name ?? a.id;
  const node = `${stem}.jsonld`;
  const local = localResourceHref(a, o.compiledData);
  const html = a.published.html?.url;
  const config: Record<string, unknown> = {
    node,
    home: o.home,
    ...(o.toc ? { toc: o.toc } : {}),
    footer: "../assets/ig-footer.json",
    ...(o.prev ? { prev: o.prev } : {}),
    ...(o.next ? { next: o.next } : {}),
    // The AST loader and the list of this site's own pages, which it uses to
    // keep a narrative link that names one of them.
    ...(local ? { astLoader: "../assets/ast-resource.js", pages: "../assets/ast-pages.json" } : {}),
    // Where the narrative's other relative links go: the published IG, read
    // off this artefact's own published page. None: they lose their href.
    ...(html ? { published: html.slice(0, html.lastIndexOf("/") + 1) } : {}),
  };
  const noscript =
    `<p>This page draws ${escHtml(a.key)} from <a href="${escHtml(node)}">its JSON-LD node</a>` +
    (local ? ` and <a href="${escHtml(local)}">the resource's JSON</a>` : "") +
    `; it needs JavaScript to draw them. <a href="${escHtml(o.all)}">All ${ix.count} artefacts</a>.</p>`;
  return thinPageHtml({
    title: `${name} — ${o.label}`,
    jsonld: node,
    canonical: `${stem}.html`,
    script: `../${THIN_PAGE_SCRIPT}`,
    stylesheet: `../${THIN_PAGE_STYLE}`,
    configId: THIN_PAGE_CONFIG_ID,
    config,
    // Identity only — what a link preview, a search engine and a reader
    // without JavaScript need. Everything else is the node's.
    body:
      `<header class="iga-top"><a class="iga-home" href="${escHtml(o.home)}">${escHtml(o.label)}</a>` +
      `<a href="${escHtml(o.all)}">all ${ix.count} artefacts</a></header>\n` +
      `<main class="iga"><h1>${escHtml(name)}</h1><p class="iga-key"><code>${escHtml(a.key)}</code></p>` +
      `<div class="iga-body" aria-live="polite"><p class="iga-state">Loading the artefact…</p></div></main>\n` +
      `<footer id="ig-footer"></footer>`,
    noscript,
  });
}

/** The page's path under the docs root. */
export const thinArtifactPath = (a: FhirArtifact): string => `${ARTIFACT_DIR}/${artifactPageName(a)}.html`;

/** The config block's id of a thin IG-level list page (`artifacts`, `toc`). */
export const THIN_INDEX_CONFIG_ID = "ig-index-page";

/**
 * A thin IG-level page that LISTS the artefacts, drawn from the one index
 * node (`artifact/index.jsonld`, `ig-artifact-jsonld.ts`) rather than written
 * into the page: the IG's `artifacts.html` (`view: "artifacts"`, every
 * category OPEN — the owner could not find artefacts behind collapsed ones,
 * 2026-10-12) and its `toc.html` (`view: "toc"`: the IG's own pages, which
 * are the page's structure and stay in its HTML as `outline`, then every
 * artefact under its category). Written by `build-ig-site.ts`, which owns
 * both pages, at the addresses the full pages had. Every href is relative
 * to the page.
 */
export interface ThinIndexOptions {
  view: "artifacts" | "toc";
  /** The page's own heading, plain text. */
  heading: string;
  /** The IG's display name. */
  label: string;
  /** The page's file name, for `rel="canonical"`. */
  canonical: string;
  /** The index node. */
  index: string;
  /** The directory of the artefact pages, ending in `/`. */
  pagesHref: string;
  /** The docs root holding `assets/`, `""` or ending in `/`. */
  assets: string;
  /** The IG's home, its artifacts page and its table of contents. */
  home: string;
  artifacts: string;
  toc: string;
  /** The reading order's neighbours. */
  prev?: string;
  next?: string;
  /** HTML the caller built and escaped: the IG's own pages, for the toc. */
  outline?: string;
}

/** The thin `artifacts` or `toc` page. Deterministic. */
export function thinIndexPage(o: ThinIndexOptions): string {
  const config: Record<string, unknown> = {
    view: o.view,
    index: o.index,
    // What a description's relative links are relative to: the IG's docs root.
    root: o.assets,
    pages: o.pagesHref,
    home: o.home,
    artifacts: o.artifacts,
    toc: o.toc,
    footer: `${o.assets}assets/ig-footer.json`,
    ...(o.prev ? { prev: o.prev } : {}),
    ...(o.next ? { next: o.next } : {}),
  };
  const lead = o.view === "artifacts" ? "This page lists the FHIR artifacts defined as part of this implementation guide." : "";
  return thinPageHtml({
    title: `${o.heading} — ${o.label}`,
    jsonld: o.index,
    canonical: o.canonical,
    script: `${o.assets}${THIN_PAGE_SCRIPT}`,
    stylesheet: `${o.assets}${THIN_PAGE_STYLE}`,
    configId: THIN_INDEX_CONFIG_ID,
    config,
    body:
      `<header class="iga-top"><a class="iga-home" href="${escHtml(o.home)}">${escHtml(o.label)}</a>` +
      `<a href="${escHtml(o.artifacts)}">Artifacts</a><a href="${escHtml(o.toc)}">Table of Contents</a></header>\n` +
      `<main class="iga igi"><h1>${escHtml(o.heading)}</h1>${lead ? `<p>${lead}</p>` : ""}${o.outline ?? ""}` +
      `<div class="iga-body" aria-live="polite"><p class="iga-state">Loading the artefact index…</p></div></main>\n` +
      `<footer id="ig-footer"></footer>`,
    noscript:
      `<p>The artefacts on this page are drawn from <a href="${escHtml(o.index)}">the IG's artefact index</a>; ` +
      `it needs JavaScript to draw them. Each artefact's page is <code>${escHtml(o.pagesHref)}&lt;Type&gt;-&lt;id&gt;.html</code>.</p>`,
  });
}
