import { createRequire } from "module";

// Refuse to build if a server route starts async work it does not wait for.
// On Vercel the lambda freezes on response, so that work can be killed while
// the caller has already been told it worked. See scripts/check-floating-promises.js.
//
// Triggered by Next's own build-phase signal. A first version keyed off
// process.argv containing "build", which is not true where Next loads this
// file — it passed a deliberately planted bug straight through.
function assertNoFloatingPromises() {
  const require = createRequire(import.meta.url);
  const { findFloatingPromises } = require("./scripts/check-floating-promises.js");
  const found = findFloatingPromises(process.cwd());
  if (found.length) {
    console.error(`\n✗ ${found.length} unawaited promise(s) in server routes — await them, or mark an intentional one with \`void\`:\n`);
    for (const f of found) console.error(`  ${f.file}:${f.line}  ${f.text}`);
    throw new Error("Unawaited promises in server routes (see above).");
  }
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "**" },
    ],
  },
};

export default (phase) => {
  if (phase === "phase-production-build") assertNoFloatingPromises();
  return nextConfig;
};
