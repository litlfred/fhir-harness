/**
 * The ✍ Questionnaire mode's pure half: the checker, the change request and
 * the Form Builder hand-back. A synthetic Questionnaire: this layer names no
 * real IG.
 */
import { describe, expect, test } from "bun:test";

// @ts-expect-error -- a plain ES module, deliberately untyped (no build step).
import { annotatedPatch, builderStep, builderUrl, checker, issue, issueUrl, itemTable, jsonPatch, TEMPLATE, URL_CAP } from "./questionnaire-mode.js";

const q = (...item: object[]) => ({ resourceType: "Questionnaire", id: "intake", url: "http://example.org/ig/Questionnaire/intake", item });
const name = { linkId: "1", type: "string", text: "Name", definition: "http://example.org/ig/StructureDefinition/Client#name" };
const dob = { linkId: "2", type: "date", text: "Date of birth", code: [{ code: "DE2" }] };
const text = (o: object) => JSON.stringify(o, null, 2);

describe("checker: findings in the registry's shape", () => {
  test("errors are syntax only", () => {
    expect(checker(text(q(name)), "{nope")).toEqual([{ severity: "error", message: expect.stringMatching(/^not JSON/) }]);
    expect(checker(text(q(name)), '{"resourceType":"Patient"}')[0].severity).toBe("error");
  });
  test("warnings report only what the edit introduces", () => {
    const before = text(q(name, { ...dob, enableWhen: [{ question: "9" }] }));
    const after = text(q(name, { ...dob, linkId: "1", enableWhen: [{ question: "9" }] }));
    expect(checker(before, after)).toEqual([
      { severity: "warning", message: 'linkId "1" is used by more than one item' },
      { severity: "warning", message: 'item "1" has enableWhen on "9", which is no item\'s linkId' },
    ]);
    expect(checker(before, before)).toEqual([]);
  });
  test("a wireframe adds fidelity warnings", () => {
    const f = checker(text(q(name, dob)), text(q(dob, name)), { wireframe: '<input data-element="name"><input data-element="DE2">' });
    expect(f).toHaveLength(1);
    expect(f[0].message).toContain("order differs");
  });
});

describe("the JSON Patch", () => {
  test("a changed item text is one replace, annotated with its linkId", () => {
    const p = annotatedPatch(q(name, dob), q(name, { ...dob, text: "Birth date" }));
    expect(p).toEqual([{ op: "replace", path: "/item/1/text", value: "Birth date", linkId: "2" }]);
  });
  test("added and removed items, and keys", () => {
    expect(jsonPatch(q(name), q(name, dob))).toEqual([{ op: "add", path: "/item/1", value: dob }]);
    expect(jsonPatch(q(name, dob), q(name))).toEqual([{ op: "remove", path: "/item/1" }]);
    expect(jsonPatch({ a: 1, "b/c": 2 }, { a: 1 })).toEqual([{ op: "remove", path: "/b~1c" }]);
  });
});

describe("issue: the change request", () => {
  test("title, template, prefilled fields and a body a person can read", () => {
    const r = issue(text(q(name, dob)), text(q(name, { ...dob, required: true })), { edited: "wireframe", source: "input/fsh/intake.fsh#L12", slug: "example.ig" });
    expect(r.title).toBe("Suggested edit [example.ig]: Questionnaire/intake");
    expect(r.template).toBe(TEMPLATE);
    expect(r.fields.questionnaire).toBe("http://example.org/ig/Questionnaire/intake");
    expect(r.fields.edited).toBe("wireframe");
    expect(r.fields.source).toBe("input/fsh/intake.fsh#L12");
    expect(JSON.parse(r.fields.patch)).toEqual([{ op: "add", path: "/item/1/required", value: true, linkId: "2" }]);
    expect(r.fields.items).toContain("| `2` | date · Date of birth | date · Date of birth · required |");
    expect(r.body).toContain("the L2 wireframe — bring the Questionnaire in line with it");
    expect(r.body).toContain("```json");
  });
  test("the side defaults to the Questionnaire", () => {
    expect(issue(text(q(name)), text(q({ ...name, text: "Full name" }))).fields.edited).toBe("questionnaire");
  });
  test("an unchanged item list says so", () => {
    expect(itemTable(q(name), { ...q(name), title: "New" })).toStartWith("No item changed");
  });
  test("a link longer than the cap falls back to the clipboard", () => {
    const small = issueUrl("o/r", issue(text(q(name)), text(q({ ...name, text: "Full name" }))));
    expect(small.clipboard).toBeUndefined();
    expect(small.url).toStartWith("https://github.com/o/r/issues/new?template=questionnaire-change.yml");
    const big = issueUrl("o/r", issue(text(q(name)), text(q({ ...name, text: "x".repeat(URL_CAP) }))));
    expect(big.url.length).toBeLessThan(URL_CAP);
    expect(big.clipboard).toContain("JSON Patch");
  });
});

describe("the Form Builder hand-back (formbuilder-lhcforms API.md)", () => {
  const Q = q(name);
  test("initialized is answered with the Questionnaire", () => {
    expect(builderStep({ status: "opening" }, { type: "initialized" }, Q)).toEqual({ state: { status: "editing" }, reply: { type: "initialQuestionnaire", questionnaire: Q } });
  });
  test("updates and close keep the latest; cancel and abort say so", () => {
    let s = builderStep({ status: "editing" }, { type: "updateQuestionnaire", questionnaire: q(dob) }, Q).state;
    expect(s.latest).toEqual(q(dob));
    s = builderStep(s, { type: "closed", questionnaire: q(name, dob) }, Q).state;
    // The first version the builder sent is its round-trip, kept as the baseline.
    expect(s).toEqual({ status: "closed", latest: q(name, dob), roundTrip: q(dob) });
    expect(builderStep(s, { type: "canceled" }, Q).state.status).toBe("canceled");
    expect(builderStep(s, { type: "aborted", error: "bad" }, Q).state).toMatchObject({ status: "aborted", error: "bad" });
    expect(builderStep(s, { type: "other" }, Q)).toEqual({ state: s });
  });
  test("the builder is opened with referrer and fhirVersion, on the same site", () => {
    const u = new URL(builderUrl("assets/formbuilder/index.html", "https://o.github.io/ig/Questionnaire-intake-form.html"));
    expect(u.origin + u.pathname).toBe("https://o.github.io/ig/assets/formbuilder/index.html");
    expect(u.searchParams.get("referrer")).toBe("https://o.github.io/ig/Questionnaire-intake-form.html");
    expect(u.searchParams.get("fhirVersion")).toBe("R4");
  });
});
