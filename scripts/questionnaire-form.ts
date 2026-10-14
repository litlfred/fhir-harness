/**
 * questionnaire-form.ts — one form-view page per Questionnaire on an IG site.
 *
 * Skill `fhir-questionnaire-wireframe`, step 2: the built Questionnaire JSON,
 * drawn by the vendored NLM LHC-Forms web component (owner, 2026-10-14:
 * LHC-Forms, vendored into the site, never a CDN at runtime). Each page
 * carries ✎ (the FSH source), 📣 (feedback) and ✍ (suggest a change, in the
 * Questionnaire mode, `questionnaire-mode.js`), a plain link-out to CSIRO
 * Smart Forms as a rendering cross-check (nothing embedded), and the
 * Publisher's own page.
 *
 * Reads the IG's AST, which `build-ig-site` already copies into `_data/`;
 * writes, beside the site's pages:
 *
 *   Questionnaire-<id>-form.html            the page
 *   questionnaires/Questionnaire-<id>.json   the copy LHC-Forms renders
 *   assets/lhc-forms/<version>/              the vendored LHC-Forms build
 *   assets/js/questionnaire-form.js          the page's loader
 *   assets/js/questionnaire-mode.js          the ✍ Questionnaire mode
 *   assets/js/check-wireframe-questionnaire.js  its checker, types stripped
 *   assets/js/edit-links.js                  the ✎ / 📣 link recipe
 *
 * The source Questionnaire is never changed; the rendered copy is the one a
 * later step may adapt for rendering.
 *
 * @module fhir-harness/scripts/questionnaire-form
 */
import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { EDIT_LINKS_RUNTIME } from "../../cat-harness-tools/src/core/edit-links.js";
import { readAst } from "./ig-ast.ts";

/** The vendored LHC-Forms version this layer serves. */
export const LHC_FORMS_VERSION = "44.1.0";
const HERE = import.meta.dir;
export const LHC_FORMS_DIR = join(HERE, "assets", "vendor", "lhc-forms", LHC_FORMS_VERSION);
const PAGE_SCRIPT = join(HERE, "templates", "ig-pages", "questionnaire-form.js");
const MODE_MODULE = join(HERE, "questionnaire-mode.js");
const CHECKER = join(HERE, "check-wireframe-questionnaire.ts");

/** CSIRO's Smart Forms playground: a cross-check reached by a plain link, never embedded. */
export const SMART_FORMS_URL = "https://smartforms.csiro.au/playground";

/** The LHC-Forms name for a FHIR version (`4.0.1` → `R4`). */
export function lformsFhirVersion(fhirVersion: string | undefined): "STU3" | "R4" | "R4B" | "R5" {
  const v = String(fhirVersion ?? "");
  if (v.startsWith("3.")) return "STU3";
  if (v.startsWith("4.3")) return "R4B";
  if (v.startsWith("5.")) return "R5";
  return "R4";
}

export interface FormPageOptions {
  /** `https://github.com/<o>/<r>/edit/<branch>`: where ✎, 📣 and ✍ point. */
  editBase?: string;
  /** The IG's FHIR version (`sushi-config.yaml` `fhirVersion`). */
  fhirVersion?: string;
  /** The IG's short name, for a change request's title. */
  slug?: string;
  /** The self-hosted NLM Form Builder's site-relative URL, when the site serves it. */
  builder?: string;
}

export interface FormPage {
  id: string;
  page: string;
  json: string;
  source?: string;
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const yamlStr = (s: string) => JSON.stringify(s);
/** JSON safe inside a `<script>` element. */
const scriptJson = (v: unknown) => JSON.stringify(v).replace(/</g, "\\u003c");

function repoOf(editBase: string | undefined): { repo?: string; branch?: string } {
  const m = editBase?.replace(/\/$/, "").match(/^https:\/\/github\.com\/([^/]+\/[^/]+)\/edit\/(.+)$/);
  return m ? { repo: m[1], branch: m[2] } : {};
}

/** One form page's HTML, front matter included. */
export function formPageHtml(q: { id: string; title?: string; name?: string; url?: string }, o: FormPageOptions & { source?: string; json: string }): string {
  const title = q.title ?? q.name ?? q.id;
  const { repo, branch } = repoOf(o.editBase);
  const cfg = {
    ...(repo ? { repo, branch } : {}),
    suggest: {
      mode: "questionnaire",
      module: "assets/js/questionnaire-mode.js",
      checker: "assets/js/questionnaire-mode.js",
      ...(o.builder ? { builder: o.builder } : {}),
      ...(o.source ? { source: o.source } : {}),
      ...(o.slug ? { slug: o.slug } : {}),
    },
  };
  const src = o.source ? ` data-src="${esc(o.source)}"` : "";
  return [
    "---",
    `title: ${yamlStr(`${title} — form`)}`,
    "nav_exclude: true",
    "search_exclude: true",
    "---",
    `<div id="fa-qform" class="fa-qform" data-json="${esc(o.json)}" data-lhc="assets/lhc-forms/${LHC_FORMS_VERSION}/" data-fhir="${lformsFhirVersion(o.fhirVersion)}"${src}>`,
    `<h1>${esc(title)}: the form</h1>`,
    `<p class="fa-qform-about">How <a href="Questionnaire-${esc(q.id)}.html">Questionnaire/${esc(q.id)}</a> looks to the person filling it in, drawn from its built JSON by NLM LHC-Forms ${LHC_FORMS_VERSION}, served from this site.</p>`,
    '<p class="fa-qform-links">',
    ...(o.source && repo
      ? [
          '<a data-fa-link="edit" tabindex="0" title="Edit this Questionnaire\'s source on GitHub">✎ edit the source</a>',
          '<a data-fa-link="feedback" tabindex="0" title="Give feedback on this form (opens a GitHub issue)">📣 feedback</a>',
        ]
      : []),
    ...(repo ? ['<a class="fa-qform-suggest" href="#fa-qform-editor" title="Suggest a change to this form or its wireframe (opens a GitHub issue)">✍ suggest a change</a>'] : []),
    `<a href="${esc(o.json)}" download>the JSON</a>`,
    `<a href="${SMART_FORMS_URL}" rel="noopener" target="_blank" title="CSIRO Smart Forms: load the JSON there to cross-check the rendering">open in CSIRO Smart Forms</a>`,
    "</p>",
    '<p class="fa-qform-state" role="status"></p>',
    '<div class="fa-qform-view"></div>',
    '<div id="fa-qform-editor" class="fa-qform-editor"></div>',
    "</div>",
    `<script type="application/json" id="fa-edit-cfg">${scriptJson(cfg)}</script>`,
    '<script src="assets/js/edit-links.js"></script>',
    '<script src="assets/js/questionnaire-form.js" defer></script>',
    "",
  ].join("\n");
}

/** The checker as a browser module: its types stripped, nothing else changed. */
export function checkerModule(): string {
  const t = new Bun.Transpiler({ loader: "ts", target: "browser" });
  return `// GENERATED from fhir-harness/scripts/check-wireframe-questionnaire.ts; do not edit.\n${t.transformSync(readFileSync(CHECKER, "utf-8"))}`;
}

/**
 * Every Questionnaire in the AST gets a form page. No AST, or no
 * Questionnaire in it: nothing written and an empty list back.
 */
export function questionnaireFormPages(astDir: string, out: string, o: FormPageOptions = {}): FormPage[] {
  if (!existsSync(join(astDir, "manifest.json"))) return [];
  const manifest = readAst(astDir).manifest;
  const qs = manifest.resources.filter((r) => r.resourceType === "Questionnaire" && existsSync(join(astDir, r.file)));
  if (!qs.length) return [];
  const pages: FormPage[] = [];
  mkdirSync(join(out, "questionnaires"), { recursive: true });
  for (const r of qs) {
    const q = JSON.parse(readFileSync(join(astDir, r.file), "utf-8"));
    const json = `questionnaires/Questionnaire-${r.id}.json`;
    writeFileSync(join(out, json), JSON.stringify(q, null, 2) + "\n");
    const page = `Questionnaire-${r.id}-form.html`;
    const source = r.source ?? undefined;
    writeFileSync(join(out, page), formPageHtml(q, { ...o, json, source }));
    pages.push({ id: r.id, page, json, ...(source ? { source } : {}) });
  }
  const js = join(out, "assets", "js");
  mkdirSync(js, { recursive: true });
  cpSync(LHC_FORMS_DIR, join(out, "assets", "lhc-forms", LHC_FORMS_VERSION), { recursive: true });
  writeFileSync(join(js, "questionnaire-form.js"), readFileSync(PAGE_SCRIPT, "utf-8"));
  writeFileSync(join(js, "questionnaire-mode.js"), readFileSync(MODE_MODULE, "utf-8"));
  writeFileSync(join(js, "check-wireframe-questionnaire.js"), checkerModule());
  writeFileSync(join(js, "edit-links.js"), `${EDIT_LINKS_RUNTIME}\n`);
  return pages;
}
