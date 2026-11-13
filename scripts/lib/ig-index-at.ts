/**
 * Where an IG layer's artefact index is READ from: the layer's output root
 * when a writer put it there, else the layer's own directory.
 *
 * @module scripts/lib/ig-index-at
 * @graphNode none — the one path every reader of `fhir-artifact-index/` in this layer asks
 *
 * Bean `cat-tools-sm8r`, item 4, plan step 2 ("no CI step writes inside a
 * mount"): a mounted layer is read-only, and what a step computes for it goes
 * to `build/layers/<instance>/…` (cat-harness-tools `scripts/lib/layer-output.ts`).
 * Readers move first: until `ig-index:build` writes to the output root, this
 * returns the same path as before, because nothing is there yet. Then the
 * writer moves, and no reader has to change with it.
 */
import { join, resolve } from "node:path";

import { checkoutRootFor } from "@litlfred/cat-harness-tools/schemas/kg/cat-harness.js";
import { mountedInstances, readPathFor } from "@litlfred/cat-harness-tools/scripts/lib/layer-output.js";

/** The instance-relative directory an IG layer's artefact index is in. */
export const INDEX_DIR = "fhir-artifact-index";

/**
 * The path to read `fhir-artifact-index/<rel…>` of the IG layer whose
 * directory is `instanceRoot`. A layer the checkout mounts (its
 * `index.lock.json` lists it at that path) is read through the overlay; any
 * other layer, and a tree with no determinable checkout, is read in place.
 */
export function indexReadPath(instanceRoot: string, ...rel: string[]): string {
  const at = resolve(instanceRoot);
  const own = join(at, INDEX_DIR, ...rel);
  let root: string;
  try {
    root = checkoutRootFor(at);
  } catch {
    return own;
  }
  const mounted = mountedInstances(root);
  for (const [instance, path] of mounted) {
    if (resolve(root, path) === at) return readPathFor(root, { instance, path }, join(INDEX_DIR, ...rel), mounted);
  }
  return own;
}
