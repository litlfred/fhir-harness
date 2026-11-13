/**
 * Where an IG layer's `fhir-artifact-index/` files are written and read:
 * through cat-harness-tools' one resolver for a layer's computed files
 * (`scripts/lib/layer-output.ts`, bean `sm8r` item 4).
 *
 * @module fhir-harness/scripts/ig-index-output
 * @covers fhir-artifact-index
 *
 * `ig-index:build` (`build-ig-indexes.ts`) COMPUTES `index.json`,
 * `menu.json`, `releases.json`, `package.tgz`, `sidecars/` and `contexts/`
 * for each IG layer. For a MOUNTED layer they belong under
 * `build/layers/<instance>/fhir-artifact-index/`, not inside the mount; for
 * the checkout's own (local) layer, inside the layer as before. That choice
 * is the resolver's, never this module's.
 *
 * A reader reads through the overlay ({@link indexReadPath}): the output
 * root when a writer put the file there, else the layer's own path. Today
 * the writer still writes inside the layer, so every read lands where it
 * did; the readers are moved first so the writer can follow without a
 * reader left behind (bean `sm8r`, plan step 2).
 *
 * Nothing here may know about WHO (fhir-harness/AGENTS.md).
 */
import { basename, join, relative, resolve } from "node:path";
import { existsSync, readFileSync } from "node:fs";

import { checkoutRootFor, declarationPathIn } from "@litlfred/cat-harness-tools/schemas/kg/cat-harness.js";
import { outputPathFor, readPathFor, type LayerRef } from "../../cat-harness-tools/scripts/lib/layer-output.ts";

/** The directory, relative to an IG layer, that holds its artefact index. */
export const INDEX_DIR = "fhir-artifact-index";

/** The layer's name: its declaration's `name`, else its directory's (as every reader here names it). */
function nameOf(instanceRoot: string): string {
  const p = declarationPathIn(instanceRoot);
  try {
    const n = p !== undefined && existsSync(p) ? (JSON.parse(readFileSync(p, "utf-8")) as { name?: unknown }).name : undefined;
    if (typeof n === "string" && n.length > 0) return n;
  } catch {
    // An unreadable declaration names nothing: the directory does.
  }
  return basename(resolve(instanceRoot));
}

/**
 * The checkout and the layer, as the resolver names them, for the layer at
 * `instanceRoot`. `name` overrides the declaration's when the caller holds it.
 */
export function layerOf(instanceRoot: string, name?: string, checkout?: string): { root: string; layer: LayerRef } {
  const abs = resolve(instanceRoot);
  let found = checkout;
  if (found === undefined) {
    try {
      found = checkoutRootFor(abs);
    } catch {
      // No checkout can be named (a bare fixture, say): nothing is mounted, so the layer's own path stands.
      found = abs;
    }
  }
  const root = resolve(found);
  return { root, layer: { instance: name ?? nameOf(abs), path: relative(root, abs) } };
}

/** Where `rel` (relative to `fhir-artifact-index/`) is WRITTEN for the layer at `instanceRoot`. */
export function indexWritePath(instanceRoot: string, rel = "", opts: { name?: string; checkout?: string } = {}): string {
  const { root, layer } = layerOf(instanceRoot, opts.name, opts.checkout);
  return outputPathFor(root, layer, join(INDEX_DIR, rel));
}

/** Where `rel` (relative to `fhir-artifact-index/`) is READ for the layer at `instanceRoot`: the output root when written there, else the layer's own. */
export function indexReadPath(instanceRoot: string, rel = "", opts: { name?: string; checkout?: string } = {}): string {
  const { root, layer } = layerOf(instanceRoot, opts.name, opts.checkout);
  return readPathFor(root, layer, join(INDEX_DIR, rel));
}

/**
 * Where a path the index records relative to the LAYER (`localPath`, e.g.
 * `fhir-artifact-index/package.tgz`) is read: through the overlay when it is
 * under `fhir-artifact-index/`, else the layer's own path.
 */
export function layerFileReadPath(instanceRoot: string, localPath: string, opts: { name?: string; checkout?: string } = {}): string {
  const norm = localPath.replace(/^\.\//, "");
  if (norm.startsWith(`${INDEX_DIR}/`)) return indexReadPath(instanceRoot, norm.slice(INDEX_DIR.length + 1), opts);
  return join(resolve(instanceRoot), localPath);
}
