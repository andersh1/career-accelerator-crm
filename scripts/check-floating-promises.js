/**
 * Fail the build if a server route starts async work it does not wait for.
 *
 * On Vercel the lambda freezes the moment a response is sent, so an unawaited
 * promise in a route handler can be killed mid-flight — while the caller has
 * already been told it worked. That is how Dan's bulk feedback emails could
 * reach the in-app bell but not a Fellow's inbox, and how a public event
 * registration could say "you're registered" without landing in the CRM.
 * (Sept 18 2026 QA, after Nick Goldstein's application was swallowed.)
 *
 * Uses the TypeScript compiler already installed for the build, so it knows
 * the actual TYPE of each expression — it flags a statement only when it really
 * evaluates to a Promise, rather than guessing from how the line looks.
 *
 * Scope is deliberately narrow: route handlers under src/app/api only. Browser
 * code legitimately fires and forgets (the tab stays alive); servers do not.
 *
 * If something genuinely should not be waited on, say so with `void`:
 *     void trackViewCount(id);
 * That is an explicit decision a reviewer can see, not an accident.
 */
const path = require("path");
const ts = require("typescript");

function findFloatingPromises(projectRoot) {
  const configPath = ts.findConfigFile(projectRoot, ts.sys.fileExists, "tsconfig.json");
  const { config } = ts.readConfigFile(configPath, ts.sys.readFile);
  const parsed = ts.parseJsonConfigFileContent(config, ts.sys, path.dirname(configPath));

  const apiDir = path.join(projectRoot, "src", "app", "api") + path.sep;
  const roots = parsed.fileNames.filter(f => path.resolve(f).startsWith(apiDir) && /route\.tsx?$/.test(f));
  const program = ts.createProgram(roots, { ...parsed.options, noEmit: true });
  const checker = program.getTypeChecker();

  // "Thenable", not "named Promise". The first version matched the type name
  // and was blind to Prisma, whose calls return PrismaPromise — so a bare
  // `prisma.x.create()` left unawaited sailed straight through. Anything with a
  // callable `then` can be abandoned mid-flight, whatever it is called.
  const isPromise = (type) => {
    if (!type) return false;
    if (type.isUnion()) return type.types.some(isPromise);
    const then = type.getProperty("then");
    if (!then) return false;
    const thenType = checker.getTypeOfSymbolAtLocation(then, then.valueDeclaration ?? then.declarations?.[0]);
    return !!thenType && thenType.getCallSignatures().length > 0;
  };

  const found = [];
  for (const file of roots) {
    const sf = program.getSourceFile(file);
    if (!sf) continue;
    const visit = (node) => {
      if (ts.isExpressionStatement(node)) {
        const expr = node.expression;
        // `void x()` is an explicit, reviewable decision not to wait. Allowed.
        if (!ts.isVoidExpression(expr) && !ts.isAwaitExpression(expr)) {
          if (isPromise(checker.getTypeAtLocation(expr))) {
            const { line } = sf.getLineAndCharacterOfPosition(node.getStart());
            found.push({
              file: path.relative(projectRoot, file),
              line: line + 1,
              text: node.getText(sf).split("\n")[0].trim().slice(0, 90),
            });
          }
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(sf);
  }
  return found;
}

module.exports = { findFloatingPromises };

// Run directly: node scripts/check-floating-promises.js
if (require.main === module) {
  const found = findFloatingPromises(process.cwd());
  if (!found.length) {
    console.log("✓ No unawaited promises in server routes.");
  } else {
    console.log(`✗ ${found.length} unawaited promise(s) in server routes:\n`);
    for (const f of found) console.log(`  ${f.file}:${f.line}\n      ${f.text}`);
    process.exitCode = 1;
  }
}
