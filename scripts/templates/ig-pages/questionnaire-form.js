/*
 * questionnaire-form.js: the form view of one Questionnaire on an IG site
 * (skill `fhir-questionnaire-wireframe`, step 2), drawn by the vendored NLM
 * LHC-Forms web component, and the ✍ suggest entry point (step 7).
 *
 * The page carries a `#fa-qform` element naming:
 *   data-json     the Questionnaire's rendered copy, relative to the page;
 *   data-lhc      the vendored LHC-Forms directory, relative to the page;
 *   data-fhir     the FHIR version LHC-Forms reads it as (R4, R4B, R5, STU3).
 * and a `#fa-edit-cfg` JSON block whose `suggest` names the Questionnaire mode
 * module (`questionnaire-mode.js`) and, when the site serves it, the Form
 * Builder.
 *
 * Nothing is fetched from another origin. Three states, always visible:
 * loading, shown, and could-not-show naming the file and the error.
 */
(function () {
  "use strict";

  var root = document.getElementById("fa-qform");
  if (!root) return;
  var view = root.querySelector(".fa-qform-view");
  var state = root.querySelector(".fa-qform-state");
  var base = location.href.split("#")[0];
  var at = function (rel) { return new URL(rel, base).href; };
  var say = function (t, failed) { state.textContent = t; state.dataset.state = failed ? "failed" : "ok"; };

  var lhc = root.dataset.lhc.replace(/\/?$/, "/");
  var css = document.createElement("link");
  css.rel = "stylesheet";
  css.href = at(lhc + "webcomponent/styles.css");
  document.head.appendChild(css);

  // In the order the package README gives; each waits for the one before.
  var scripts = ["webcomponent/assets/lib/zone.min.js", "webcomponent/runtime.js", "webcomponent/polyfills.js", "webcomponent/main.js", "fhir/lformsFHIRAll.min.js"];
  var load = function (i) {
    return i === scripts.length
      ? Promise.resolve()
      : new Promise(function (ok, no) {
          var s = document.createElement("script");
          s.src = at(lhc + scripts[i]);
          if (/runtime|polyfills|main/.test(scripts[i])) s.type = "module";
          s.onload = ok;
          s.onerror = function () { no(new Error("could not load " + scripts[i])); };
          document.head.appendChild(s);
        }).then(function () { return load(i + 1); });
  };
  var ready = function () {
    return new Promise(function (ok, no) {
      var t0 = Date.now();
      (function wait() {
        if (window.LForms && window.LForms.Util && window.LForms.Util.addFormToPage) return ok();
        if (Date.now() - t0 > 20000) return no(new Error("LHC-Forms did not start"));
        setTimeout(wait, 50);
      })();
    });
  };

  var original;
  say("Loading the form…");
  Promise.all([
    fetch(at(root.dataset.json)).then(function (r) {
      if (!r.ok) throw new Error(root.dataset.json + ": HTTP " + r.status);
      return r.json();
    }),
    load(0).then(ready),
  ])
    .then(function (got) {
      original = got[0];
      return window.LForms.Util.addFormToPage(original, view, { fhirVersion: root.dataset.fhir || "R4" });
    })
    .then(function () { say(""); })
    .catch(function (e) { say("Could not show the form: " + e.message, true); });

  // ✍ suggest. The suggest runtime, once it carries a mode registry, takes
  // this over (`window.faSuggest`); until then the page opens the mode itself.
  var suggest = root.querySelector(".fa-qform-suggest");
  if (!suggest) return;
  suggest.addEventListener("click", function (e) {
    var cfgEl = document.getElementById("fa-edit-cfg");
    var cfg = cfgEl ? JSON.parse(cfgEl.textContent) : {};
    if (window.faSuggest && typeof window.faSuggest.open === "function") return;
    e.preventDefault();
    if (!original || !cfg.suggest || !cfg.repo) return;
    var host = root.querySelector(".fa-qform-editor");
    if (host.dataset.open) return;
    host.dataset.open = "1";
    import(at(cfg.suggest.module)).then(function (mode) {
      var before = JSON.stringify(original, null, 2);
      var ed = mode.open(host, { questionnaire: original, builder: cfg.suggest.builder ? at(cfg.suggest.builder) : undefined, fhirVersion: root.dataset.fhir, source: cfg.suggest.source });
      var out = document.createElement("div");
      out.className = "fa-qform-findings";
      out.setAttribute("aria-live", "polite");
      var send = document.createElement("button");
      send.type = "button";
      send.textContent = "Check, then open the change request";
      send.addEventListener("click", function () {
        var after = ed.get();
        var findings = mode.checker(before, after, {});
        out.textContent = "";
        findings.forEach(function (f) {
          var p = document.createElement("p");
          p.className = "fa-qform-" + f.severity;
          p.textContent = (f.severity === "error" ? "Error: " : "Warning: ") + f.message;
          out.appendChild(p);
        });
        if (findings.some(function (f) { return f.severity === "error"; })) return;
        var r = mode.issue(before, after, { edited: ed.edited(), source: cfg.suggest.source, slug: cfg.suggest.slug, page: base, findings: findings });
        var u = mode.issueUrl(cfg.repo, r);
        if (u.clipboard && navigator.clipboard) {
          navigator.clipboard.writeText(u.clipboard).catch(function () {});
          var p = document.createElement("p");
          p.textContent = "The change request is too long for a link: its text is on your clipboard. Paste it into the issue that opens.";
          out.appendChild(p);
        }
        window.open(u.url, "_blank", "noopener");
      });
      host.appendChild(send);
      host.appendChild(out);
    }).catch(function (err) {
      host.textContent = "Could not open the editor: " + err.message;
    });
  });
})();
