---
input: schemas/skills/fhir-questionnaire-wireframe/input.schema.json
output: schemas/skills/fhir-questionnaire-wireframe/output.schema.json
---

# fhir-questionnaire-wireframe

> Skill id: `fhir-questionnaire-wireframe` · Package: `fhir-ig-authoring` ·
> Process: [`questionnaire-wireframe-review.bpmn`](../../../processes/content/questionnaire-wireframe-review.bpmn)
> (`Process_QuestionnaireWireframeReview`).

Show a built FHIR `Questionnaire` the way a person will meet it — a
mid-fidelity wireframe at web and mobile width, and a live form — have it
reviewed as a design, check that it says what the wireframe it was derived
from says, and take change requests on either side back through authoring.

> **Sourcing.** What a Questionnaire means is the FHIR specification's and the
> Structured Data Capture IG's answer, not this file's. The live form is drawn
> by NLM's LHC-Forms; what it supports is NLM's to say. This skill states how
> the two are wired **in this harness**.

## Owner decisions (2026-10-14)

- The renderer is **NLM LHC-Forms**, **vendored** into the site: never a CDN
  at runtime. Its BSD-style notice travels with the vendored files.
- The field ↔ item check, `check-wireframe-questionnaire`, lives **here**
  ([`scripts/check-wireframe-questionnaire.ts`](../../../scripts/check-wireframe-questionnaire.ts),
  Tool `check-wireframe-questionnaire`). It knows nothing about any one IG; a
  layer above uses it by name.
- **Either side may be edited.** A change request says whether the
  Questionnaire or the wireframe was changed, and the agent brings the other
  back in line. Neither is silently regenerated from the other.

## Inputs and outputs

`fhir-harness/schemas/skills/fhir-questionnaire-wireframe/`:

- **in** — `questionnaire` (required: one built JSON path; several are
  several runs), `mode`,
  `wireframe`, `renderer`, `assetDir`, `suggest`, `issueForm`, `channels`,
  `branch`
- **out** — the output shape of `wireframe-design-review` (`use`, `topic`,
  `assetDir`, `candidates[]` each with its source HTML, web and mobile
  screenshots and their staging links, `chosen`, `changedAssets`,
  `stagingLinks`), plus `renderer`, `fidelity[]` (the checker's findings per
  layout), `sdcChecks[]` (step 4b) and `changeRequests[]` (issue URL, which side was edited, status).

`stagingLinks` is an inline copy of cat-harness
`schemas/staging-comparison.schema.json`, as every contract carrying it keeps
one; `changedAssets` is the staging preview graph's changed-assets record,
with three kinds of its own: `questionnaire-wireframe`,
`questionnaire-rendering`, `questionnaire-screenshot`.

## Roles

| role | does |
|---|---|
| `fhir-modeller` | authors: renders, runs the checks, applies change requests |
| `business-analyst` | reviews the form against the workflow it serves |
| `clinical-sme` | reviews what the form asks and in what order |
| `build-pipeline` | the mechanical steps: rendering, screenshots, the fidelity check |

## Steps

1. **Read the built Questionnaire JSON**, never FSH:
   `fsh-generated/resources/Questionnaire-<id>.json`, or the IG's published
   `Questionnaire-<id>.json`. FSH is what the author wrote; the JSON is what
   every renderer and reader receives, so it is what is judged.
2. **Render.**
   - A **mid-fidelity wireframe**: one field per answerable item, in item
     order, each carrying `data-element="<id>"` (the item's `definition`, or
     its `code`) and sitting in a `data-layout="web"` or `data-layout="mobile"`
     subtree. Monochrome, the item's own text, no placeholder text — the rules
     of `wireframe-design-review` step 2.
   - A **form view**: the same JSON in `<lhc-forms>`, from the vendored
     LHC-Forms build, on the IG site's Questionnaire form page (`build-ig-site`).
3. **Screenshots at web and mobile width** with the cat-harness Tool
   `wireframe-check` (1280×800 and 390×844; renders, no-overflow,
   no-placeholder). A candidate missing either viewport does not enter review.
4. **Fidelity, when an L2 wireframe exists** — the form was designed first and
   the Questionnaire derived from it:

   ```sh
   bun run fhir-harness/scripts/check-wireframe-questionnaire.ts <wireframe.html> <Questionnaire.json>
   ```

   Each layout is judged on its own: a field with no item, an item with no
   field, an item naming no data element, a data element twice, the first
   place the order differs. Exit 0 faithful, 1 a finding, 2 cannot tell —
   and 2 is never a pass. The findings go in `fidelity[]`, per layout. This is
   fidelity, not design: a faithful form can still be a poor one.
   **4b. SDC build checks**, with CSIRO's libraries (Apache-2.0; owner,
   2026-10-14: checks, not UI), Tool `sdc-checks`:

   ```sh
   bun run fhir-harness/scripts/sdc-checks.ts --ast output-ast --fixtures input/tests/questionnaires [--out <dir>]
   ```

   | check | library | passes when |
   |---|---|---|
   | `assemble` | `@aehrc/sdc-assemble` 2.0.3 | an `assemble-root`'s sub-forms all resolve in this IG; `--out` writes the assembled Questionnaire, so assembly is a build step too |
   | `template-extract` | `@aehrc/sdc-template-extract` 1.0.16 | extraction from the fixture's `response.json` yields every resource in `extract-expected.json` |
   | `populate` | `@aehrc/sdc-populate` 4.7.2 | FHIRPath pre-population from `populate-context.json` gives the answers in `populate-expected.json` |
   | `behaviour` | `@aehrc/questionnaire-test-toolkit` 0.1.0 | the IG's `behaviour.test.tsx` passes. **Warn-only**: the toolkit is early, and needs its React and Smart Forms peers installed with the IG's tests |

   The fixtures are the IG's, one directory per Questionnaire id. Nothing is
   fetched from a server. `not-applicable`, `no-fixture` and
   `could-not-determine` are said, and never read as a pass. The results go
   in `sdcChecks[]`, one entry per Questionnaire.
5. **Review** by `wireframe-design-review`, as-is use for a form that exists,
   design use for one being designed: blind, per criterion, at both
   viewports, adjudicated where reviewers disagree. That skill is the method;
   this one does not restate it.
6. **Stage** by `feature-staging`, and ask for review with `staging-review`:
   one deep link per rendered Questionnaire and wireframe, before and after.
   Where the request goes — the conversation, an issue, the pull request — is
   a judgement, and more than one may be right: `staging-review`'s deep-link
   rule, point 5.
7. **Change requests come in** in one of two ways, and both end as an issue:
   - **✍ suggest**, in its Questionnaire mode, on the form page: the reviewer
     edits the Questionnaire or the wireframe and the editor opens an issue;
   - the **`questionnaire-change` issue form**, filled by hand.

   Each goes to `content-feedback` for triage (to `public-comment` when a
   review round is open), then to `l3-fhir-authoring`, which edits the side
   the request did not touch so the two agree again, then back to step 1.
   `changeRequests[]` records each issue, which side was edited, and where it
   stands.

## The change-request payload

What the ✍ editor writes, and what the issue form asks for when it is filled
by hand:

| field id | holds |
|---|---|
| `questionnaire` | the Questionnaire's canonical URL or `Questionnaire/<id>` |
| `edited` | `questionnaire` or `wireframe`: the side the reviewer changed |
| `patch` | an RFC 6902 JSON Patch over the **built** Questionnaire, its paths annotated with the item's `linkId` |
| `items` | a readable before/after table of the items that changed |
| `source` | the FSH file and line the item comes from, when known |
| `rationale` | why |

The issue form is
[`templates/ig-repo-site/ISSUE_TEMPLATE/questionnaire-change.yml`](../../../templates/ig-repo-site/ISSUE_TEMPLATE/questionnaire-change.yml),
which an IG repository copies to `.github/ISSUE_TEMPLATE/`, as it copies the
workflows beside it. A pre-filled link longer than about 7000 characters is
too long for GitHub; the editor then copies the body to the clipboard and
opens a stub issue, as the ✍ runtime already does.

## The form view and the ✍ Questionnaire mode

`build-ig-site` writes one page per Questionnaire in the IG's AST,
`Questionnaire-<id>-form.html`, through
[`scripts/questionnaire-form.ts`](../../../scripts/questionnaire-form.ts):

- the form, drawn by the vendored LHC-Forms build
  (`scripts/assets/vendor/lhc-forms/<version>/`, its NLM `LICENSE.md` beside
  it, `vendored.json` recording the npm tarball and a SHA-256 per file) from
  a rendered copy of the built JSON, `questionnaires/Questionnaire-<id>.json`.
  The source Questionnaire is never changed. Nothing is loaded from another
  origin;
- ✎ (the FSH source the AST names), 📣 (feedback) and ✍ (suggest a change),
  through the platform's edit-links recipe and a `#fa-edit-cfg` block whose
  `suggest` is `{ mode: "questionnaire", module, checker }`;
- a plain **open in CSIRO Smart Forms** link-out, as a rendering cross-check
  (owner, 2026-10-14). Nothing of it is embedded.

The ✍ Questionnaire mode is
[`scripts/questionnaire-mode.js`](../../../scripts/questionnaire-mode.js), a
plain ES module with no build step. **Its interface is provisional until the
cat-harness-tools mode registry merges**:

| export | does |
|---|---|
| `open(host, ctx)` → `{ get, edited, dispose }` | a panel: which side was edited (the Questionnaire or its L2 wireframe), the editor's status, and a raw-JSON fallback. With `ctx.builder`, the self-hosted NLM Form Builder is opened in a window and its `updateQuestionnaire` / `closed` result kept (its API.md hand-back). `get()` is the edited Questionnaire as JSON text |
| `checker(before, after, ctx)` | findings `{ severity, message }`, from `checkSuggestion` below |
| `issue(before, after, ctx)` | `{ title, body, template: "questionnaire-change.yml", fields }`: the JSON Patch with each operation's `linkId`, the item table, the source, the side edited |

Until the suggest runtime carries the registry, the form page opens the mode
itself (`templates/ig-pages/questionnaire-form.js`).

### The self-hosted Form Builder, and no cross-site call

Owner, 2026-10-14: the editor is the **NLM Form Builder (formbuilder-lhcforms
12.9.0), self-hosted**, and *"cache + ucum. this is gh-pages so no XSS"*: the
site makes no cross-site call at all.

- The builder is vendored unmodified (`scripts/assets/vendor/formbuilder-lhcforms/`).
  The site serves a rewritten copy of its `index.html`, also as
  `window-open.html` (its hand-back route): jQuery from this site
  (`vendor/jquery/3.6.0`), the Google font rules removed, and a guard that
  registers the service worker and reloads before anything else loads.
- The service worker (`scripts/terminology-sw.js`, scoped to the builder;
  the mapping is the pure `scripts/terminology-map.js`) answers every request
  to another origin from this site:

  | request | answer |
  |---|---|
  | clinicaltables `/api/loinc_items/v3/search` | the IG's terminology index, in the CTSS shape. LOINC comes **only** from the IG's cache; a code it does not hold shows *"not in this IG's terminology cache; add it via the FSH source"* |
  | clinicaltables `/api/ucum/v3/search` | the full UCUM list (vendored `@lhncbc/ucum-lhc` definitions) |
  | lhcforms-static `/lforms-versions/…` | the vendored LHC-Forms |
  | lforms-fhir.nlm.nih.gov (import and export), anything else | a local error saying it is disabled on this site |

- The **terminology index** is written at build time by
  [`scripts/terminology-index.ts`](../../../scripts/terminology-index.ts)
  (Tool `terminology-index`) from the IG's own restored cache:
  `output-ast/expansions.json` and `input-cache/txcache/`
  (`ig-build-pipeline`, §"The AST cache lifecycle").
- The **form view** needs no terminology server either: each item's
  `answerValueSet` that the expansions hold becomes `answerOption` in the
  rendered copy. The source Questionnaire is unchanged; a value set the cache
  does not hold is reported.
- A code the cache lacks is added through the FSH source. A ✍ change request
  can carry it as free text.

## The suggest checker

`checkSuggestion(before, after, { wireframe })` in
`check-wireframe-questionnaire.ts` is the checker a suggest editor runs on the
reviewer's edit, in the editor-checker shape `{ errors, warnings }`:

- **errors** are syntax only — not JSON, not a Questionnaire;
- **warnings never block**, and only what the edit **introduces** is
  reported, computed against the editor's own round-trip of the original: a
  duplicate `linkId`, an `enableWhen` naming no item, and the fidelity
  findings of step 4 when a wireframe is given.

It is ready to be declared as an editor-checker profile (`contentType:
questionnaire`) once that graph typology is reachable from this layer; today
it is not, and this layer does not reach up for it.

## What this skill does not do

- It does not build the IG: `l3-fhir-authoring` and `ig-publication` do.
- It does not regenerate one side from the other on its own. Which side is
  the source of a change is the change request's to say.
- A clean fidelity check is not a design review, and a clean design review is
  not conformance: `fhir-validation` still decides that.
