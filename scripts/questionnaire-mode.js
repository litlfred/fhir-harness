/**
 * questionnaire-mode.js — the ✍ suggest editor's Questionnaire mode.
 *
 * PROVISIONAL until the cat-harness-tools mode registry merges: the shape
 * below (`open`, `checker`, `issue`) is the one that registry's owner has
 * described, and its exact type signature is theirs to send. Skill:
 * fhir-harness `fhir-questionnaire-wireframe`, step 7.
 *
 * A plain ES module with no build step and no dependency but the vendored
 * NLM tools the page already serves. It is loaded by the IG site's
 * Questionnaire form page (`questionnaire-form.ts` writes the config), and it
 * is unit-tested with bun.
 *
 * - `open(host, ctx)` puts a small panel in `host`: the choice of which side
 *   was edited (the Questionnaire, or its L2 wireframe), the status of the
 *   editor, and a raw-JSON fallback. When `ctx.builder` names the self-hosted
 *   NLM Form Builder, it opens it in a window and keeps the latest
 *   `updateQuestionnaire` / `closed` result. `get()` returns the edited
 *   Questionnaire as JSON text.
 * - `checker(before, after, ctx)` returns findings `{ severity, message }`.
 *   Errors are syntax only; warnings never block and report only what the
 *   edit introduces (`checkSuggestion` in `check-wireframe-questionnaire`).
 * - `issue(before, after, ctx)` returns `{ title, body, template, fields }`
 *   for the `questionnaire-change` issue form: an RFC 6902 JSON Patch over
 *   the built Questionnaire, a before/after item table, the FSH source when
 *   known, and the side that was edited.
 */
import { checkSuggestion } from "./check-wireframe-questionnaire.js";

/** The issue form a change request is opened with. */
export const TEMPLATE = "questionnaire-change.yml";
/** GitHub answers 414 above about 8 KB of URL; the ✍ runtime's cap. */
export const URL_CAP = 7000;

const isObj = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const esc = (s) => String(s).replace(/~/g, "~0").replace(/\//g, "~1");
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/**
 * An RFC 6902 patch turning `a` into `b`. Objects are compared key by key,
 * arrays index by index (a trailing add or remove, a replace in between), so
 * a changed item's text is one `replace`, not the whole item list.
 */
export function jsonPatch(a, b, path = "") {
  if (same(a, b)) return [];
  if (isObj(a) && isObj(b)) {
    const ops = [];
    for (const k of Object.keys(a)) if (!(k in b)) ops.push({ op: "remove", path: `${path}/${esc(k)}` });
    for (const k of Object.keys(b)) {
      if (!(k in a)) ops.push({ op: "add", path: `${path}/${esc(k)}`, value: b[k] });
      else ops.push(...jsonPatch(a[k], b[k], `${path}/${esc(k)}`));
    }
    return ops;
  }
  if (Array.isArray(a) && Array.isArray(b)) {
    const ops = [];
    const n = Math.min(a.length, b.length);
    for (let i = 0; i < n; i++) ops.push(...jsonPatch(a[i], b[i], `${path}/${i}`));
    for (let i = n; i < b.length; i++) ops.push({ op: "add", path: `${path}/${i}`, value: b[i] });
    // Removed from the end backwards, so each index is still valid when applied.
    for (let i = a.length - 1; i >= n; i--) ops.push({ op: "remove", path: `${path}/${i}` });
    return ops;
  }
  return [{ op: "replace", path: path || "", value: b }];
}

/**
 * The `linkId` of the deepest item a patch path runs through, read in the
 * document the path addresses (`before` for replace and remove, `after` for
 * add). RFC 6902 §4 ignores members an operation does not define, so the
 * annotation rides on the operation itself.
 */
export function linkIdAt(doc, path) {
  let node = doc;
  let linkId;
  for (const raw of path.split("/").slice(1)) {
    const k = raw.replace(/~1/g, "/").replace(/~0/g, "~");
    if (node === undefined || node === null) break;
    node = node[k];
    if (isObj(node) && typeof node.linkId === "string") linkId = node.linkId;
  }
  return linkId;
}

/** The patch, each operation annotated with the item it touches. */
export function annotatedPatch(before, after) {
  return jsonPatch(before, after).map((op) => {
    const linkId = linkIdAt(op.op === "add" ? after : before, op.path) ?? linkIdAt(after, op.path);
    return linkId ? { ...op, linkId } : op;
  });
}

/** Every item, depth first, by linkId. */
function itemsById(q) {
  const m = new Map();
  const walk = (items) => {
    for (const it of items ?? []) {
      if (it.linkId !== undefined) m.set(it.linkId, it);
      walk(it.item);
    }
  };
  walk(q?.item);
  return m;
}

const cell = (s) => (s === undefined || s === "" ? "—" : String(s).replace(/\s+/g, " ").replace(/\|/g, "\\|"));
const summary = (it) =>
  it === undefined
    ? undefined
    : [it.type, it.text, it.required ? "required" : undefined, it.repeats ? "repeats" : undefined, it.enableWhen?.length ? `enableWhen ${it.enableWhen.map((e) => e.question).join(", ")}` : undefined]
        .filter(Boolean)
        .join(" · ");

/** A readable before/after table of the items that changed, as Markdown. */
export function itemTable(before, after) {
  const a = itemsById(before);
  const b = itemsById(after);
  const rows = [];
  for (const id of new Set([...a.keys(), ...b.keys()])) {
    const x = a.get(id);
    const y = b.get(id);
    if (x && y && same({ ...x, item: undefined }, { ...y, item: undefined })) continue;
    rows.push(`| \`${cell(id)}\` | ${cell(summary(x))} | ${cell(summary(y))} |`);
  }
  if (!rows.length) return "No item changed (the change is to the Questionnaire's own elements; see the patch).";
  return ["| linkId | before | after |", "|---|---|---|", ...rows].join("\n");
}

function parse(text) {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

/**
 * Findings on a suggested edit. `before` is the editor's own round-trip of
 * the original, so only what the edit introduces is reported. `ctx.wireframe`
 * is the L2 wireframe's HTML when the Questionnaire was derived from one.
 */
export function checker(before, after, ctx = {}) {
  const r = checkSuggestion(before, after, { wireframe: ctx.wireframe });
  return [...r.errors.map((message) => ({ severity: "error", message })), ...r.warnings.map((message) => ({ severity: "warning", message }))];
}

/**
 * The change request. `ctx.edited` is `questionnaire` or `wireframe`;
 * `ctx.source` the FSH file (and line) the Questionnaire is built from, when
 * known; `ctx.slug` the IG's short name for the title.
 */
export function issue(before, after, ctx = {}) {
  const a = parse(before) ?? {};
  const b = parse(after) ?? {};
  const id = b.id ?? a.id ?? "?";
  const ref = b.url ?? a.url ?? `Questionnaire/${id}`;
  const edited = ctx.edited === "wireframe" ? "wireframe" : "questionnaire";
  const patch = JSON.stringify(annotatedPatch(a, b), null, 2);
  const items = itemTable(a, b);
  const findings = ctx.findings ?? checker(before, after, ctx);
  const fields = { questionnaire: ref, edited, items, patch, ...(ctx.source ? { source: ctx.source } : {}) };
  const body = [
    `**Questionnaire:** ${ref}`,
    `**Edited:** ${edited === "wireframe" ? "the L2 wireframe — bring the Questionnaire in line with it" : "the Questionnaire — bring the L2 wireframe in line with it"}`,
    ...(ctx.source ? [`**Source:** ${ctx.source}`] : []),
    ...(ctx.page ? [`**Page:** ${ctx.page}`] : []),
    "",
    "### Items, before and after",
    "",
    items,
    "",
    "### JSON Patch (RFC 6902) over the built Questionnaire",
    "",
    "```json",
    patch,
    "```",
    ...(findings.length ? ["", "### Checker warnings (they do not block)", "", ...findings.map((f) => `- ${f.severity}: ${f.message}`)] : []),
    ...(ctx.note ? ["", "### Why", "", ctx.note] : []),
  ].join("\n");
  return { title: `Suggested edit${ctx.slug ? ` [${ctx.slug}]` : ""}: Questionnaire/${id}`, body, template: TEMPLATE, fields };
}

/**
 * The `issues/new` URL for a change request, prefilled by issue-form field
 * id. Above `URL_CAP` the fields are dropped and `clipboard` carries the body
 * for the reader to paste, as the ✍ runtime does.
 */
export function issueUrl(repo, r) {
  const q = new URLSearchParams({ template: r.template, title: r.title });
  for (const [k, v] of Object.entries(r.fields ?? {})) q.set(k, v);
  const full = `https://github.com/${repo}/issues/new?${q}`;
  if (full.length <= URL_CAP) return { url: full };
  const stub = new URLSearchParams({ template: r.template, title: r.title, questionnaire: r.fields?.questionnaire ?? "", edited: r.fields?.edited ?? "" });
  return { url: `https://github.com/${repo}/issues/new?${stub}`, clipboard: r.body };
}

/**
 * The NLM Form Builder hand-back protocol (formbuilder-lhcforms API.md): the
 * host opens the builder with `referrer`, waits for `initialized`, posts
 * `initialQuestionnaire`, then receives `updateQuestionnaire`, `closed`,
 * `canceled` or `aborted`. Pure: `state` in, `{ state, reply }` out, so it is
 * tested without a window.
 */
export function builderStep(state, data, questionnaire) {
  switch (data?.type) {
    case "initialized":
      return { state: { ...state, status: "editing" }, reply: { type: "initialQuestionnaire", questionnaire } };
    case "updateQuestionnaire":
      return { state: { ...state, status: "editing", latest: data.questionnaire ?? state.latest } };
    case "closed":
      return { state: { ...state, status: "closed", latest: data.questionnaire ?? state.latest } };
    case "canceled":
      return { state: { ...state, status: "canceled" } };
    case "aborted":
      return { state: { ...state, status: "aborted", error: String(data.error ?? "the Form Builder stopped") } };
    default:
      return { state };
  }
}

/** The builder's URL with the parameters its API reads. */
export function builderUrl(builder, referrer, fhirVersion = "R4") {
  const u = new URL(builder, referrer);
  u.searchParams.set("referrer", referrer);
  u.searchParams.set("fhirVersion", fhirVersion);
  return u.href;
}

const STATUS = {
  idle: "Not edited yet.",
  opening: "Opening the Form Builder…",
  editing: "Editing in the Form Builder. Changes arrive here as you make them.",
  closed: "The Form Builder was closed; its last version is kept.",
  canceled: "The Form Builder was cancelled; nothing from it is kept.",
  aborted: "The Form Builder stopped",
  blocked: "The browser blocked the Form Builder window. Allow pop-ups for this site, or edit the JSON below.",
};

/**
 * The editor. `ctx.questionnaire` is the Questionnaire (object or JSON text)
 * the page rendered; `ctx.builder` the self-hosted Form Builder's URL, when
 * the site carries it. Returns `{ get, edited, dispose }`.
 */
export function open(host, ctx = {}) {
  const doc = host.ownerDocument;
  const win = doc.defaultView;
  const original = typeof ctx.questionnaire === "string" ? parse(ctx.questionnaire) : ctx.questionnaire;
  let state = { status: "idle", latest: undefined };
  let raw = false;
  let child = null;

  const el = (tag, props = {}, kids = []) => {
    const e = doc.createElement(tag);
    Object.assign(e, props);
    for (const k of kids) e.append(k);
    return e;
  };
  const side = (v, label) => el("label", {}, [el("input", { type: "radio", name: "fa-q-edited", value: v, checked: v === "questionnaire" }), ` ${label}`]);
  const status = el("p", { className: "fa-q-status", textContent: STATUS.idle });
  status.setAttribute("role", "status");
  const textarea = el("textarea", { className: "fa-q-raw", rows: 16, hidden: true, spellcheck: false });
  textarea.setAttribute("aria-label", "The Questionnaire as JSON");
  const builderBtn = el("button", { type: "button", textContent: "Open in the Form Builder", disabled: !ctx.builder });
  const rawBtn = el("button", { type: "button", textContent: "Edit the JSON" });
  const panel = el("div", { className: "fa-q-mode" }, [
    el("fieldset", {}, [el("legend", { textContent: "What did you edit?" }), side("questionnaire", "the Questionnaire"), " ", side("wireframe", "its L2 wireframe")]),
    el("p", {}, [builderBtn, " ", rawBtn]),
    ...(ctx.builder ? [] : [el("p", { className: "fa-q-note", textContent: "The Form Builder is not served on this site; edit the JSON instead." })]),
    status,
    textarea,
  ]);
  host.append(panel);

  const show = () => {
    status.textContent = state.status === "aborted" ? `${STATUS.aborted}: ${state.error}` : STATUS[state.status];
  };
  const onMessage = (e) => {
    if (!child || e.source !== child) return;
    const { state: next, reply } = builderStep(state, e.data, original);
    state = next;
    if (reply) child.postMessage(reply, e.origin);
    if (state.latest) textarea.value = JSON.stringify(state.latest, null, 2);
    show();
  };
  win.addEventListener("message", onMessage);

  builderBtn.addEventListener("click", () => {
    const here = win.location.href.split("#")[0];
    child = win.open(builderUrl(ctx.builder, here, ctx.fhirVersion), "fa-formbuilder");
    state = { ...state, status: child ? "opening" : "blocked" };
    show();
  });
  rawBtn.addEventListener("click", () => {
    raw = !raw;
    textarea.hidden = !raw;
    rawBtn.textContent = raw ? "Hide the JSON" : "Edit the JSON";
    if (raw && !textarea.value) textarea.value = JSON.stringify(state.latest ?? original, null, 2);
  });

  return {
    /** The edited Questionnaire, as JSON text: the raw JSON when it was edited, else the builder's latest. */
    get() {
      if (raw && textarea.value.trim()) return textarea.value;
      return JSON.stringify(state.latest ?? original, null, 2);
    },
    /** `questionnaire` or `wireframe`: the side the reviewer says they edited. */
    edited() {
      return panel.querySelector('input[name="fa-q-edited"]:checked')?.value ?? "questionnaire";
    },
    dispose() {
      win.removeEventListener("message", onMessage);
      if (child && !child.closed) child.close();
      panel.remove();
    },
  };
}
