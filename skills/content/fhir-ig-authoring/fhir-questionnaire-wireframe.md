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
  layout) and `changeRequests[]` (issue URL, which side was edited, status).

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
