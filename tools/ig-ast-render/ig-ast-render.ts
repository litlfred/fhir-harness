import { toolFactory } from "../../../cat-harness/schemas/tool-folders.js";
import { defineTool } from "../../../cat-harness/schemas/tool.js";

export default toolFactory((t) =>
  defineTool({
    id: "ig-ast-render",
    title: "Render a computed IG AST delta as just-the-docs pages",
    description:
      "Write the pages for a delta already computed by `ig-ast-diff --json`: an index that lists, a page per changed resource that shows, every one opening with the provisional mark and with Liquid in values neutralised.",
    install: { none: true },
    invoke: { shell: "bun run fhir-harness/scripts/ig-ast.ts render <delta.json> --site <dir>" },
    io: {
      inputs: [
        { name: "delta", schema: t("FilesystemPath"), required: true, description: "`ig-ast-delta/v1`, from `ig-ast-diff --json`." },
        { name: "site", schema: t("FilesystemPath"), required: true },
      ],
      outputs: [{ name: "pages", schema: t("Count") }],
    },
    satisfies: ["ig-ast-delta"],
    selection: {
      when: "Re-rendering a stored delta without the two ASTs, e.g. into a staging site.",
      limits: "Shows what the delta records; it cannot add a differential the delta did not compute.",
      cost: "Milliseconds per page.",
    },
    requires: { runtime: ["bun"], network: false },
  }),
);
