/**
 * Check the roster parser against the shapes a registrar actually sends.
 *
 *   node scripts/check-roster-parse.mjs
 *
 * Pure: no database, no request. The parser is the first thing a university
 * class touches, and its failure mode is quiet — a misread line becomes an
 * account with the wrong address, which nobody can sign in to and nobody
 * notices until January.
 */
import { register } from "node:module";
register("./ts-loader.mjs", import.meta.url);
const { parseRoster } = await import("@/lib/roster-import.ts");

const fail = [];
const expect = (ok, what) => { console.log(`${ok ? "ok  " : "FAIL"}  ${what}`); if (!ok) fail.push(what); };

// Name first, comma separated, with a header.
let r = parseRoster("Name,Email\nAda Lovelace,alovelace@wfu.edu\nClara Barton,cbarton@wfu.edu");
expect(r.rows.length === 2, `name-first with a header reads 2 rows (${r.rows.length})`);
expect(r.skipped.length === 0, "the header line is not reported as a problem");
expect(r.rows[0].name === "Ada Lovelace" && r.rows[0].email === "alovelace@wfu.edu", "name and email land in the right fields");

// Email first, tab separated, no header.
r = parseRoster("bbarton@wfu.edu\tClara Barton\ngcarver@wfu.edu\tGeorge Carver");
expect(r.rows.length === 2, `email-first with tabs reads 2 rows (${r.rows.length})`);
expect(r.rows[0].name === "Clara Barton" && r.rows[0].email === "bbarton@wfu.edu", "either order works");

// First and last name in separate columns.
r = parseRoster("Ada,Lovelace,alovelace@wfu.edu");
expect(r.rows.length === 1 && r.rows[0].name === "Ada Lovelace", `split names are joined (${r.rows[0]?.name})`);

// Addresses are lowercased, because an account is found by address.
r = parseRoster("Ada Lovelace,ALovelace@WFU.edu");
expect(r.rows[0].email === "alovelace@wfu.edu", `the address is lowercased (${r.rows[0]?.email})`);

// Blank lines and whitespace.
r = parseRoster("\n\n  Ada Lovelace , alovelace@wfu.edu  \n\n");
expect(r.rows.length === 1 && r.rows[0].name === "Ada Lovelace", "blank lines and stray spaces are ignored");

// The two things worth refusing.
r = parseRoster("Ada Lovelace\nalovelace@wfu.edu");
expect(r.rows.length === 0, "a name with no email and an email with no name are both refused");
expect(r.skipped.length === 2, `both are reported, with their line numbers (${r.skipped.length})`);
expect(r.skipped[0].line === 1 && r.skipped[1].line === 2, "the line numbers are right");

// A typo'd address is refused rather than turned into an account.
r = parseRoster("Ada Lovelace,alovelace@wfu\nClara Barton,cbarton@wfu.edu");
expect(r.rows.length === 1 && r.rows[0].email === "cbarton@wfu.edu", "an address with no valid domain is not accepted");
expect(r.skipped.length === 1 && r.skipped[0].line === 1, "the typo is reported with its line");

// A real paste: twenty students, messy.
const messy = [
  "Student Name\tEmail Address",
  ...Array.from({ length: 20 }, (_, i) => `Student ${i + 1}\tstudent${i + 1}@wfu.edu`),
  "",
  "Dropped: Someone Else",
].join("\n");
r = parseRoster(messy);
expect(r.rows.length === 20, `a 20-student paste reads 20 rows (${r.rows.length})`);
expect(r.skipped.length === 1, `the one unusable line is reported (${r.skipped.length})`);

console.log(fail.length ? `\n${fail.length} CHECK(S) FAILED` : "\nThe parser reads what a registrar sends.");
process.exit(fail.length ? 1 : 0);
