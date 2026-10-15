import { toolFactory } from "../../../cat-harness/schemas/tool-folders.js";
import { defineTool } from "../../../cat-harness/schemas/tool.js";

export default toolFactory((t) =>
  defineTool({
    id: "ig-ast-measure-real-igs",
    title: "Measure the AST export on real IGs",
    description:
      "Build smart-trust and smart-immunizations through `ig-ast-export` and print the W1/W2 measurements: counts, whether FSH sources sit where the plan expects, and logic-layer edge coverage per resource type against 458 of 458. `--byte-identical` adds a stock build and an `output/` diff.",
    install: { cli: "git clone -b claude/ast-export https://github.com/litlfred/fhir-ig-publisher" },
    invoke: { shell: "fhir-ig-publisher/ast-export/scripts/run-real-igs.sh [work-dir] [--byte-identical]" },
    io: {
      inputs: [{ name: "work-dir", schema: t("FilesystemPath"), required: false }],
      outputs: [{ name: "logic-covered", schema: t("Count"), description: "Logic resources carrying at least one edge to another logic resource in the IG." }],
    },
    satisfies: ["ig-publisher-fork"],
    selection: {
      when: "Taking bean a9tx's measurements, on a machine that reaches the package registry.",
      limits: "Two named WHO IGs are the subjects because the 61 % gap was measured on one of them; the script itself knows nothing about WHO beyond their repository names.",
      cost: "Two full IG builds, three with `--byte-identical`.",
    },
    requires: { runtime: ["java", "maven", "sushi", "jekyll", "python3", "git"], network: true },
    remedies: [{ host: "packages.fhir.org", tool: "fhir-cache-seed-npm" }],
  }),
);
