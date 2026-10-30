import { toolFactory } from "@litlfred/cat-harness-tools/schemas/tools/tool-folders.js";
import { defineTool } from "@litlfred/cat-harness-tools/schemas/tools/tool.js";

export default toolFactory((t) =>
  defineTool({
    id: "ig-pages",
    title: "Generate an IG instance's reader-facing pages from its artefact index",
    description:
      "Write `<instance>/docs/` — an index page, one page per artefact, a page per over-large category and per menu group — from `fhir-artifact-index/index.json` (and `menu.json` when ingested), styled by the template chrome an owning instance ingested. Moved down to this layer because nothing in it was one IG's own (#1767); with `--summary` it writes an instance's landing page, opening with that instance's harness section. For an instance whose docs declare `igSite` (bean `mftp`) it writes no index, menu or category pages — the IG site's own replace them — and only a front-matter `artifacts.md` naming the Tool that drew it. Where an instance declares a visualiser `renderedBy: ig-pages`, it also writes that visualiser's route page, `<base>/<instance>/<id>/`, which opens the artefact index; with `--site <dir>` it writes only those route pages, under that site. For an IG whose SOURCE is at hand, `build-ig-site` renders the IG's own pages instead; this is for an IG known only by what it published.",
    install: { none: true },
    invoke: { shell: "bun run fhir-harness/scripts/gen-ig-pages.ts" },
    // What this Tool CAN draw. An instance declares that it DOES, in its
    // own `visualisers` (`renderedBy: ig-pages`, owner 2026-10-09), and
    // `check:visualiser-routes` checks the covered kind is listed here.
    renders: ["fhir-artifact-index"],
    io: {
      inputs: [
        { name: "instance", schema: t("RepoPath"), required: true, arg: { flag: "--instance" }, description: "The instance directory: holds `fhir-artifact-index/` and receives `docs/`." },
        { name: "site", schema: t("RepoPath"), required: false, arg: { flag: "--site" }, description: "A site being built: write ONLY the route pages of the visualisers declared `renderedBy: ig-pages` (`<locale>/<harness>/<id>/` and, per instance, `…/<instance>/`) under it, and nothing else: not `docs/`, not the instance. Each opens the IG's artefact index where the site carries it, and is that index otherwise. A repository's own site build passes it (`visualiser-writers.ts` in cat-harness-tools), since the instance is a pinned mount." },
        { name: "label", schema: t("Text"), required: false, description: "The IG's display name. The index carries only the package id, which stands in when this is absent." },
        { name: "chrome-owner", schema: t("Text"), required: false, description: "The instance whose `chrome.json` styles the pages. Absent, the pages are unstyled and the build says so. The banner's identity is always the index's; a chrome ingested from another IG lends its tokens, never its status." },
        { name: "summary", schema: t("Flag"), required: false, description: "Open the index page with the instance's own declaration (`harness_details.html` with `instance=`), making it the instance's landing page." },
        { name: "full-pages", schema: t("Flag"), required: false, description: "The opt-out. Without it (the default since 2026-10-12, owner: \"make thin default\") each artefact page is a THIN shell at the same address: identity and a pointer, the artefact's JSON-LD node beside it, the index node (`artifact/index.jsonld`) the IG site's list pages draw, and one shared renderer, `assets/ig-artifact.js`. With it, the full pages as before, and no JSON-LD. `--thin`, the old opt-in, is accepted and changes nothing." },
        { name: "jsonld-base", schema: t("Url"), required: false, description: "Thin pages only: the docs root's published URL, so each node's IRIs are absolute. Absent, they are relative to the node's own file." },
        { name: "compiled-data", schema: t("RepoPath"), required: false, description: "Where a compiled index's resource files are served, as a path from the docs root. In an IG site the docs root IS the site root, so it is `ast-data`, not `../ast-data`." },
        { name: "check", schema: t("Flag"), required: false, description: "Write nothing; exit 1 when any page is stale or orphaned." },
      ],
      outputs: [
        { name: "pages", schema: t("Count"), description: "Pages written; the menu and chrome are reported as present or COULD NOT DETERMINE, never silently absent." },
      ],
    },
    satisfies: ["ig-build-pipeline"],
    selection: {
      when: "An ingested IG needs a URL on the docs site and its source repository is not at hand.",
      limits:
        "Narrative pages are not held — the harvest keeps artefacts — so menu entries link upstream. Bodies are still partly HTML inside markdown (`jut3`).",
      cost: "Seconds; one file per artefact.",
    },
    requires: { runtime: ["bun"], network: false },
  }),
);
