/**
 * Lets a plain `node --env-file=.env.local scripts/foo.mjs` import the app's
 * real TypeScript modules instead of a second copy of their contents.
 *
 * Node 22+ strips TypeScript types natively but does not resolve the two
 * things Next.js resolves for us: the "@/" alias, and imports written without
 * a file extension. This hook adds both, and resolves bare package names from
 * the app's own node_modules so the script can live anywhere.
 *
 * Use it when a script needs a constant that already exists in src/lib. The
 * alternative is retyping the content into the script, which is how a
 * "snapshot of the code" quietly stops matching the code.
 *
 *   import { register } from "node:module";
 *   register("./ts-loader.mjs", import.meta.url);
 *   const { MODULE_OVERVIEW } = await import("@/lib/module-overview.ts");
 */
import { pathToFileURL, fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { existsSync } from "node:fs";
import { dirname, resolve as presolve } from "node:path";

const ROOT = presolve(dirname(fileURLToPath(import.meta.url)), "..") + "/";
const req = createRequire(ROOT + "package.json");

function tryExts(base) {
  for (const c of [base, base + ".ts", base + ".tsx", base + "/index.ts", base + "/index.tsx"]) {
    if (existsSync(c)) return { url: pathToFileURL(c).href, shortCircuit: true };
  }
  return null;
}

export async function resolve(spec, ctx, next) {
  if (spec.startsWith("@/")) {
    const hit = tryExts(ROOT + "src/" + spec.slice(2));
    if (hit) return hit;
  }
  if (spec.startsWith(".") && ctx.parentURL?.startsWith("file:")) {
    const hit = tryExts(presolve(dirname(fileURLToPath(ctx.parentURL)), spec));
    if (hit) return hit;
  }
  if (!spec.startsWith(".") && !spec.startsWith("/") && !spec.startsWith("node:")) {
    try {
      return { url: pathToFileURL(req.resolve(spec)).href, shortCircuit: true };
    } catch { /* fall through to Node's own resolution */ }
  }
  return next(spec, ctx);
}
