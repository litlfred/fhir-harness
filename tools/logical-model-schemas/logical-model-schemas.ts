import { toolFactory } from "../../../cat-harness/schemas/tool-folders.js";
import { defineTool } from "../../../cat-harness/schemas/tool.js";

// ── An IG's JSON surface ─────────────────────────────────────────────
//
// Moved down from the layer above (#1767, stage B′). Each turns ANY IG's
// published output into JSON Schema or JSON-LD, so — would an IG with no
// overlay need it? — they are this layer's, as the Library strippers
// above already are, and they satisfy `ig-build-pipeline` for the same
// reason. A skill of the layer above cannot be satisfied from here
// without an upward edge. The Python lives in the IG's own `input/scripts/`.
export default toolFactory((t) =>
  defineTool({
    id: "logical-model-schemas",
    title: "Logical models → JSON Schema",
    description: "A JSON Schema per logical model, from the published FHIR resources.",
    install: { none: true },
    invoke: { shell: "python3 input/scripts/generate_logical_model_schemas.py" },
    io: {
      inputs: [{ name: "igOutput", schema: t("RepoPath"), required: true, description: "The Publisher's `output/`." }],
      outputs: [{ name: "logicalModelSchemas", schema: t("RepoPath"), description: "`schemas/<stem>.schema.json`, one per logical model." }],
    },
    satisfies: ["ig-build-pipeline"],
    selection: {
      when: "An IG is to expose its logical models as an addressable JSON Schema surface.",
      limits: "It describes what the Publisher emitted. A model the Publisher did not publish is not reported as missing.",
      cost: "Seconds, inside the publisher container.",
    },
    requires: { runtime: ["python3"], network: false },
  }),
);
