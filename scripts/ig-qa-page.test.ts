import { describe, expect, test } from "bun:test";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readQaRecords } from "../../cat-harness-tools/scripts/kg-qa-report.ts";
import { runInNewContext } from "node:vm";
import { fhirQaMarkdown, QA_MESSAGES_JS, readFhirQa, renderQaPage } from "./ig-qa-page.ts";

function dirWith(files: Record<string, string>): string {
  const d = mkdtempSync(join(tmpdir(), "ig-qa-"));
  for (const [f, s] of Object.entries(files)) writeFileSync(join(d, f), s);
  return d;
}

const RECORD = {
  $schema: "qa-results/v1",
  producer: { script: "x/check.ts" },
  subject: { kind: "fhir-ig", id: "an-ig" },
  families: {
    "lane-gap": { summary: "a lane with | a pipe", count: 2, entries: [{ persona: "A" }, { persona: "B", note: "{{ not liquid }}" }] },
    clean: { summary: "nothing", count: 0, entries: [] },
  },
  total: 2,
};

const MANIFEST = {
  generatedAt: "2026-11-05T17:28:37Z",
  authority: "cache",
  provisional: ["indices", "versions"],
  provisionalUntil: "a full IG Publisher run",
  toolchain: { publisher: "3.0.0", core: "7.0.1" },
  resources: [{}, {}],
};

describe("ig-qa-page", () => {
  test("fhirQaSummaryFromAst", () => {
    const ast = dirWith({ "qa.json": JSON.stringify({ errs: 3, warnings: 7, hints: 0, tool: "2.0.15", version: "5.0.0", date: "Wed, 05 Nov 2026" }), "manifest.json": JSON.stringify(MANIFEST) });
    const md = fhirQaMarkdown(readFhirQa(ast), { up: "" }).join("\n");
    expect(md).toContain("(IG Publisher 2.0.15, FHIR 5.0.0, on Wed, 05 Nov 2026)");
    expect(md).toContain("| errors | 3 |");
    expect(md).toContain("| hints | 0 |");
    expect(md).not.toContain("suppressed");
    expect(md).toContain("(assets/fhir-qa/qa.json)");
    expect(md).toContain("| generated | `2026-11-05T17:28:37Z` |");
    expect(md).toContain("| provisional | `indices`, `versions`, until a full IG Publisher run |");
  });

  test("fhirQaWithoutSummarySaysSo", () => {
    const ast = dirWith({ "manifest.json": JSON.stringify(MANIFEST) });
    const validity = join(dirWith({ "v.json": JSON.stringify({ verdict: "stale", detail: { verdict: "stale", why: "the inputs changed" }, recorded: { inputDigest: "a" }, current: { inputDigest: "b" } }) }), "v.json");
    const md = fhirQaMarkdown(readFhirQa(ast, validity)).join("\n");
    expect(md).toContain("holds no Publisher QA summary");
    expect(md).not.toContain("| errors |");
    expect(md).toContain("**Validity for this checkout:** `stale`. the inputs changed");
    expect(md).toContain("| inputDigest | `a` | `b` |");
  });

  test("pageRawHalvesKgRecords", () => {
    const d = dirWith({ "swim.qa-results.json": JSON.stringify(RECORD) });
    const page = renderQaPage({ title: "QA Report", fhir: {}, kg: { view: "en/h/qa/", instances: [{ instance: "an-ig", dirs: [d], records: readQaRecords([d]), page: "en/h/qa/an-ig/" }] } });
    expect(page.startsWith("---\ntitle: \"QA Report\"\nnav_exclude: true\n")).toBe(true);
    expect(page).toContain("{% raw %}");
    expect(page.indexOf("## FHIR QA")).toBeLessThan(page.indexOf("## Knowledge-graph QA"));
    expect(page).toContain("[Every instance's QA](en/h/qa/)");
    expect(page).toContain("2 finding(s), written by `x/check.ts`");
    expect(page).toContain("(assets/kg-qa/an-ig/swim.qa-results.json)");
    expect(page).toContain("a lane with \\| a pipe");
    expect(page).toContain("| B | {{ not liquid }} |");
    expect(page.trimEnd().endsWith("{% endraw %}")).toBe(true);
  });

  test("publisherLayoutFromTheMessageList", async () => {
    const qa = { title: "An IG", "package-id": "example.an-ig", "ig-ver": "0.9.9", version: "4.0.1", tool: "6.0.0", errs: 1, warnings: 1, hints: 1, "broken-links": 0, url: "http://x/ig" };
    const messages = {
      $schema: "ig-qa-messages/v1",
      groups: [
        { messages: [{ severity: "warning", text: "The build" }] },
        { file: "Questionnaire-A.json", messages: [{ severity: "error", text: "no linkId", path: "Questionnaire.item[0]", line: 12, col: 4, messageId: "Q_LINKID" }, { severity: "information", text: "a hint" }] },
      ],
    };
    const ast = dirWith({ "qa.json": JSON.stringify(qa), "qa-messages.json": JSON.stringify(messages) });
    const md = fhirQaMarkdown(readFhirQa(ast), { up: "" }).join("\n");
    expect(md).toContain('class="ig-qa-publisher"');
    expect(md).toContain('data-messages="assets/fhir-qa/qa-messages.json"');
    expect(md).toContain('<script src="assets/fhir-qa/qa-messages.js"></script>');
    expect(md).not.toContain("| errors |");

    // The page script, over a fake DOM: the Publisher's tables, as text in order.
    const texts: string[] = [];
    const node = (tag: string): Record<string, unknown> => ({
      tag,
      className: "ig-qa-publisher",
      set textContent(v: string) {
        if (v) texts.push(v);
      },
      appendChild: (c: unknown) => c,
      setAttribute: () => {},
      getAttribute: (k: string) => (k === "data-summary" ? "qa.json" : "qa-messages.json"),
      addEventListener: () => {},
    });
    const document = {
      querySelectorAll: () => [node("div")],
      getElementById: () => null,
      head: node("head"),
      createElement: (t: string) => node(t),
      createTextNode: (t: string) => (texts.push(t), {}),
    };
    const fetch = async (u: string) => ({ ok: true, json: async () => (u === "qa.json" ? qa : messages) });
    runInNewContext(QA_MESSAGES_JS, { document, fetch, Promise, Error, String, Object, Array });
    for (let i = 0; i < 20; i++) await new Promise((r) => setTimeout(r, 0));
    const out = texts.join("\n");
    expect(out).toContain("Validation Results for An IG");
    expect(out).toContain("FHIR version 4.0.1 for example.an-ig#0.9.9");
    expect(out).toContain("errors = 1, warn = 1, info = 1, broken links = 0");
    for (const h of ["Filename", "Errors", "Warnings", "Hints", "Path", "Severity", "Message"]) expect(texts).toContain(h);
    expect(out).toContain("Build Errors");
    expect(out).toContain("Questionnaire-A.json  (1 errors, 0 warnings, 1 hints)");
    expect(out).toContain("Questionnaire.item[0] (l12/c4)");
    expect(out).toContain("Q_LINKID");
  });
});
