/**
 * ig-annexes.ts — the annexes an IG's pages load on demand, declared in an
 * `ig-annex` directory's `annexes.json`.
 *
 * Owner, 2026-10-10: the data dictionary belongs on its page as an annex held
 * in the knowledge graph and loaded dynamically, not as the full workbook
 * (option 2a). This layer knows only the GENERIC contract: a page, a file
 * beside the declaration, and the columns a table shows before a row is
 * opened. What the file holds is the declaring layer's own kind, typed by
 * that layer's validators; `ig-annex.js` renders any `{ sheets: [...] }`
 * table, and a `.md` file is appended to its page as written.
 *
 * Read by `stage-ig-sites.ts` (`annexesIn`), for an index's IG sites and an
 * IG repository's own (`ig-repo-site.ts compose`).
 *
 * @graphNode schema
 */
import { z } from "zod";

export const IG_ANNEXES_TAG = "ig-annexes/v1" as const;
/** The graph typology an IG instance declares a directory of annexes as. */
export const IG_ANNEX_KIND = "ig-annex" as const;
/** The declaration's file name inside such a directory. */
export const IG_ANNEXES_FILE = "annexes.json" as const;

export const IgAnnexRecordSchema = z
  .object({
    /** The page file under `input/pagecontent/`, e.g. `dictionary.md`. */
    page: z.string().min(1),
    /** The annex, relative to the directory that holds this declaration. */
    file: z.string().min(1),
    /** Column keys shown before a row is opened. Default: the first six. */
    columns: z.array(z.string().min(1)).min(1).optional(),
  })
  .strict();
export type IgAnnexRecord = z.infer<typeof IgAnnexRecordSchema>;

export const IgAnnexesSchema = z
  .object({
    $schema: z.literal(IG_ANNEXES_TAG),
    annexes: z.array(IgAnnexRecordSchema),
  })
  .strict();
export type IgAnnexes = z.infer<typeof IgAnnexesSchema>;
