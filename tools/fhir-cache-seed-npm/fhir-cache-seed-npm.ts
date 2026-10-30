import { toolFactory } from "../../../cat-harness/schemas/tools/tool-folders.js";
import { defineTool } from "../../../cat-harness/schemas/tools/tool.js";

export default toolFactory((t) =>
  defineTool({
    id: "fhir-cache-seed-npm",
    title: "Seed the FHIR package cache from trusted sources (exact versions)",
    description:
      "Fill `~/.fhir/packages` (or `--cache`) for an environment that cannot reach packages.fhir.org, from trust anchors only: npm account `grahamegrieve` (owner-trusted), publishers' own published-site repositories (the seeder's list, each fetch verified against the tarball's own package.json), template repos found through FHIR/ig-registry's templates.json read live each run, and an owner `--mirror`. Exact versions only (a patch wildcard resolves as the Publisher resolves it, recorded); every tarball verified; nothing computed once and kept; provenance recorded; missing versions listed, never substituted.",
    install: { none: true },
    invoke: { shell: "bun run fhir-harness/scripts/fhir-cache-seed-npm.ts [--cache <dir>] [--sushi-config <file>] [--mirror <dir|git-url>] [--template-repo <name=owner/repo>] [--site-repo <prefix=owner/repo[@branch]>] [--missing-out <file>] [--dry-run] [name#version ...]" },
    io: {
      inputs: [
        { name: "sushi-config", schema: t("FilesystemPath"), required: false, description: "Seed what this IG pins: its `dependencies:` and the core package for its `fhirVersion`." },
        { name: "cache", schema: t("FilesystemPath"), required: false, description: "Default `~/.fhir/packages`, which SUSHI and the IG Publisher read." },
        { name: "dry-run", schema: t("Flag"), required: false, description: "Resolve and report; download nothing." },
        { name: "mirror", schema: t("FilesystemPath"), required: false, description: "A directory or git repository of `<name>#<version>.tgz` filled by `fhir-package-mirror`." },
        { name: "missing-out", schema: t("FilesystemPath"), required: false, description: "Write the missing list, one `name#version` per line: the input `fhir-package-mirror` takes." },
      ],
      outputs: [
        { name: "installed", schema: t("Count") },
        { name: "missing", schema: t("Count"), description: "Exit 1 when any is missing. Each is listed with why: not on npm, a different version only, an untrusted maintainer, or not an exact version." },
      ],
    },
    satisfies: ["ig-publisher-fork"],
    selection: {
      when: "packages.fhir.org is unreachable and registry.npmjs.org is not.",
      limits:
        "Measured 2026-10-01 over the two IGs bean a9tx measures: 20 packages install; pinned HL7 versions need `--mirror`. A template FHIR/ig-registry does not list is named with `--template-repo`. A partly seeded cache does not make a faithful build of an IG whose pins it misses.",
      cost: "One download per package; the core packages are tens of megabytes.",
    },
    requires: { runtime: ["bun", "npm", "git"], network: true },
    remedies: [
      { host: "registry.npmjs.org", none: "npm is a trust anchor this Tool reads. The other route is an owner mirror (`--mirror`), filled by `fhir-package-mirror` on a machine that reaches packages.fhir.org." },
      { host: "github.com", none: "Publishers' site and template repositories are read from GitHub; with it refused, only npm and `--mirror` remain." },
    ],
  }),
);
