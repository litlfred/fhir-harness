import { toolFactory } from "../../../cat-harness/schemas/tool-folders.js";
import { defineTool } from "../../../cat-harness/schemas/tool.js";

export default toolFactory((t) =>
  defineTool({
    id: "jsonld-vocabularies",
    title: "ValueSet expansions → JSON-LD",
    description: "JSON-LD vocabularies built from the ValueSet expansions in the published output.",
    install: { none: true },
    invoke: { shell: "python3 input/scripts/generate_jsonld_vocabularies.py" },
    io: {
      inputs: [{ name: "igOutput", schema: t("RepoPath"), required: true }],
      outputs: [{ name: "vocabularies", schema: t("RepoPath"), description: "`*.jsonld` at the published root." }],
    },
    satisfies: ["ig-build-pipeline"],
    selection: {
      when: "The terminology is to be reachable as linked data rather than only as FHIR.",
      limits:
        "IT DEPENDS ON EXPANSION, which depends on the terminology server the build was given. An IG built against a dead or restricted `tx` produces fewer vocabularies and FAILS NOTHING — the step warns and continues. A thin output is therefore not evidence of a thin ValueSet; check the expansion before concluding anything.",
      cost: "Seconds locally; the expansion it depends on is the expensive part and happens in the Publisher run.",
    },
    requires: { runtime: ["python3"], network: false },
  }),
);
