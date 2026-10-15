import { toolFactory } from "../../../cat-harness/schemas/tool-folders.js";
import { defineTool } from "../../../cat-harness/schemas/tool.js";

export default toolFactory((t) =>
  defineTool({
    id: "valueset-schemas",
    title: "ValueSets → JSON Schema",
    description:
      "A JSON Schema per ValueSet, plus the enumeration-response schemas published at the IG root.",
    install: { none: true },
    invoke: { shell: "python3 input/scripts/generate_valueset_schemas.py" },
    io: {
      inputs: [{ name: "igOutput", schema: t("RepoPath"), required: true }],
      // Named for what it is (#1168, B9a): as `schemas` it matched
      // `logical-model-schemas` port for port, and the two would derive as
      // alternatives when they write different schema families.
      outputs: [{ name: "valueSetSchemas", schema: t("RepoPath"), description: "One schema per ValueSet, plus the enumeration-response schemas at the IG root." }],
    },
    satisfies: ["ig-build-pipeline"],
    selection: {
      when: "An IG is to expose its terminology as JSON Schema.",
      limits:
        "The root `ValueSets.schema.json` it writes is a SCHEMA describing an enumeration response, carrying an `example` that holds the list. It is not an index instance, and reading it as one is the trap `qsf5` recorded — no FHIR IG publishes an artefact-index instance.",
      cost: "Seconds. Output size scales with the IG — measured at 19 against 198 across two published IGs — so re-derive rather than assume.",
    },
    requires: { runtime: ["python3"], network: false },
  }),
);
