/**
 * Script decryption support for encrypted/obfuscated JS files.
 * Uses CDP to fetch decrypted source from V8 runtime, then writes
 * debugged.js output file.
 */

import { writeFile } from "node:fs/promises";
import { resolve, dirname, basename, extname } from "node:path";

export interface DecryptResult {
  outputPath: string;
  success: boolean;
  error?: string;
}

// Extensions we know how to strip before appending .debugged.js. Only
// stripping ".js" (the original behavior) left ".mjs"/".cjs"/".ts" input
// files with a misleading double extension, e.g. "app.mjs.debugged.js".
const KNOWN_SOURCE_EXTS = [".mjs", ".cjs", ".ts", ".tsx", ".jsx", ".js"];

function stripKnownExtension(filename: string): string {
  const ext = extname(filename);
  return KNOWN_SOURCE_EXTS.includes(ext) ? basename(filename, ext) : filename;
}

/**
 * Write decrypted source to a debugged.js file alongside the original.
 * If the original file is at /path/to/encrypted.js, output goes to
 * /path/to/encrypted.debugged.js. Pass `outputPath` to write to an exact
 * path instead (e.g. when the caller already resolved one via a CLI flag).
 */
export async function decryptScript(
  originalPath: string,
  decryptedSource: string,
  outputDirOrPath?: string,
  options?: { exactOutputPath?: boolean },
): Promise<DecryptResult> {
  let outputPath = "";
  try {
    if (options?.exactOutputPath && outputDirOrPath) {
      outputPath = resolve(outputDirOrPath);
    } else {
      const dir = outputDirOrPath ?? dirname(originalPath);
      const base = stripKnownExtension(basename(originalPath));
      outputPath = resolve(dir, `${base}.debugged.js`);
    }

    await writeFile(outputPath, decryptedSource, "utf-8");

    return { outputPath, success: true };
  } catch (err) {
    // Previously this always reported outputPath: "" on failure, even when
    // we'd already computed a path — making the error message less useful.
    return { outputPath, success: false, error: (err as Error).message };
  }
}
