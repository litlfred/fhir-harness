import { toolFactory } from "../../../cat-harness/schemas/tools/tool-folders.js";
import { defineTool } from "../../../cat-harness/schemas/tools/tool.js";

export default toolFactory((t) =>
  defineTool({
    id: "build-ig-site",
    title: "Stage one IG as its own just-the-docs Jekyll site",
    description:
      "Turn an IG source repository into ONE Jekyll source for just-the-docs, as the IG Publisher builds one IG per site: `input/pagecontent` pages with title, parent and order from `sushi-config.yaml` `pages:`, the files the Publisher's include tags resolve against, images, `_data/fhir.json` from `ig-site-data`, and a `_config.yml`. The pages render unchanged, including their references to the IG's site data (bean `bamf`, owner's choice of one site per IG). With the IG's menu, the layout is the one every IG site wears (bean `mftp`): the IG's own top bar, the IG's TOC declared as the folio-assistant navbar's section (added by `rail-standalone-pages`), no sidebar of its own, an edit link per page, and per heading a source-line link and a pre-filled feedback issue.",
    install: { none: true },
    invoke: { shell: "bun run fhir-harness/scripts/build-ig-site.ts" },
    io: {
      inputs: [
        { name: "ig-src", schema: t("RepoPath"), required: true, description: "The IG source repository: `sushi-config.yaml` and `input/`." },
        { name: "out", schema: t("RepoPath"), required: true, description: "The Jekyll source directory to write." },
        { name: "baseurl", schema: t("RepoPath"), required: false, description: "Where the built site is served." },
        { name: "plantuml-jar", schema: t("RepoPath"), required: false, description: "Render `input/images-source/*.plantuml` as the Publisher does; without it a visible `not rendered` marker stands in." },
      ],
      outputs: [
        { name: "pages", schema: t("Count"), description: "Pages staged." },
        { name: "not-rendered", schema: t("Count"), description: "Included files the source does not hold and nothing rendered, each replaced by a VISIBLE marker and listed, never an empty include." },
      ],
    },
    satisfies: ["ig-build-pipeline"],
    selection: {
      when: "Rendering an IG's own pages through just-the-docs (`ig-publisher-reduction` P0).",
      limits:
        "Fragments only the Publisher's own generation writes (dependency tables, artefact summaries) are not produced here and show as markers. A page `sushi-config.yaml` does not list keeps its file name as title and is reported.",
      cost: "Seconds; copies files. Rendering diagrams adds a Java process per diagram.",
    },
    requires: { runtime: ["bun"], network: false },
  }),
);
