/**
 * One LHC-Forms form page per Questionnaire, from a synthetic AST: this layer
 * names no real IG.
 */
import { afterAll, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { checkerModule, formPageHtml, LHC_FORMS_VERSION, lformsFhirVersion, questionnaireFormPages, SMART_FORMS_URL } from "./questionnaire-form.ts";

const made: string[] = [];
afterAll(() => made.forEach((d) => rmSync(d, { recursive: true, force: true })));
const tmp = (p: string) => {
  const d = mkdtempSync(join(tmpdir(), p));
  made.push(d);
  return d;
};
const put = (root: string, rel: string, text: string) => {
  mkdirSync(dirname(join(root, rel)), { recursive: true });
  writeFileSync(join(root, rel), text);
};

function ast(resources: Array<{ type: string; id: string; json: object; source?: string }>): string {
  const dir = tmp("q-ast-");
  const rs = resources.map((r) => {
    const file = `resources/${r.type}/${r.id}.json`;
    put(dir, file, JSON.stringify({ resourceType: r.type, id: r.id, ...r.json }));
    return { key: `${r.type}/${r.id}`, canonical: null, version: null, resourceType: r.type, id: r.id, file, source: r.source ?? null };
  });
  put(dir, "manifest.json", JSON.stringify({ $schema: "ig-ast/v1", authority: "cache", provisional: ["indices", "dependencies", "versions"], resources: rs }));
  put(dir, "dependencies.json", JSON.stringify({ $schema: "ig-ast-dependencies/v1", dependencies: [] }));
  return dir;
}

const intake = { title: "Client intake", item: [{ linkId: "1", type: "string", text: "Name" }] };

describe("questionnaireFormPages", () => {
  test("a page, the rendered copy and the vendored files for each Questionnaire; nothing for other types", () => {
    const out = tmp("q-site-");
    const pages = questionnaireFormPages(
      ast([
        { type: "Questionnaire", id: "intake", json: intake, source: "input/fsh/intake.fsh" },
        { type: "Patient", id: "p1", json: {} },
      ]),
      out,
      { editBase: "https://github.com/o/ig/edit/main", fhirVersion: "4.0.1", slug: "example.ig" },
    );
    expect(pages).toEqual([{ id: "intake", page: "Questionnaire-intake-form.html", json: "questionnaires/Questionnaire-intake.json", source: "input/fsh/intake.fsh" }]);
    expect(JSON.parse(readFileSync(join(out, "questionnaires/Questionnaire-intake.json"), "utf-8"))).toEqual({ resourceType: "Questionnaire", id: "intake", ...intake });
    for (const f of [
      `assets/lhc-forms/${LHC_FORMS_VERSION}/webcomponent/main.js`,
      `assets/lhc-forms/${LHC_FORMS_VERSION}/fhir/lformsFHIRAll.min.js`,
      `assets/lhc-forms/${LHC_FORMS_VERSION}/LICENSE.md`,
      "assets/js/questionnaire-form.js",
      "assets/js/questionnaire-mode.js",
      "assets/js/check-wireframe-questionnaire.js",
      "assets/js/edit-links.js",
    ])
      expect(existsSync(join(out, f))).toBe(true);
    expect(existsSync(join(out, "Questionnaire-p1-form.html"))).toBe(false);
  });
  test("no AST, or none with a Questionnaire: nothing written", () => {
    const out = tmp("q-site-");
    expect(questionnaireFormPages(join(out, "absent"), out)).toEqual([]);
    expect(questionnaireFormPages(ast([{ type: "Patient", id: "p", json: {} }]), out)).toEqual([]);
    expect(existsSync(join(out, "assets"))).toBe(false);
  });
});

describe("the page", () => {
  const html = formPageHtml({ id: "intake", title: "Client <intake>" }, { json: "questionnaires/Questionnaire-intake.json", source: "input/fsh/intake.fsh", editBase: "https://github.com/o/ig/edit/main", fhirVersion: "5.0.0", slug: "example.ig" });
  test("✎, 📣 and ✍, the Smart Forms link-out, and nothing loaded from another origin", () => {
    expect(html).toContain('data-fa-link="edit"');
    expect(html).toContain('data-fa-link="feedback"');
    expect(html).toContain("✍ suggest a change");
    expect(html).toContain(`href="${SMART_FORMS_URL}"`);
    expect(html).toContain('data-fhir="R5"');
    expect(html).toContain("Client &lt;intake&gt;: the form");
    expect(html.match(/<script[^>]+src="([^"]+)"/g)!.every((s) => !/src="(https?:)?\/\//.test(s))).toBe(true);
  });
  test("the suggest config names the Questionnaire mode", () => {
    const cfg = JSON.parse(/<script type="application\/json" id="fa-edit-cfg">(.*?)<\/script>/.exec(html)![1]!);
    expect(cfg).toEqual({
      repo: "o/ig",
      branch: "main",
      suggest: { mode: "questionnaire", module: "assets/js/questionnaire-mode.js", checker: "assets/js/questionnaire-mode.js", source: "input/fsh/intake.fsh", slug: "example.ig" },
    });
  });
  test("without a repository there is no edit, feedback or suggest link", () => {
    const bare = formPageHtml({ id: "x" }, { json: "questionnaires/Questionnaire-x.json" });
    expect(bare).not.toContain("data-fa-link");
    expect(bare).not.toContain("fa-qform-suggest");
  });
});

test("FHIR versions as LHC-Forms names them", () => {
  expect(["3.0.2", "4.0.1", "4.3.0", "5.0.0", undefined].map(lformsFhirVersion)).toEqual(["STU3", "R4", "R4B", "R5", "R4"]);
});

test("the checker ships as a browser module: types stripped, no Node import at load", async () => {
  const js = checkerModule();
  expect(js).not.toContain(": string");
  expect(js).not.toMatch(/^import .*node:/m);
  const dir = tmp("q-mod-");
  writeFileSync(join(dir, "c.mjs"), js);
  const m = await import(join(dir, "c.mjs"));
  expect(m.checkSuggestion('{"resourceType":"Questionnaire"}', "{").errors).toHaveLength(1);
});
