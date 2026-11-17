/**
 * Check the generated Wake Forest term against the dates on Dan's curriculum
 * map, before anybody relies on it.
 *
 *   node scripts/check-wake-term.mjs
 *
 * Pure: reads no database and writes nothing. It imports the real planner, so
 * this cannot drift from the code the way a copied list of dates would.
 *
 * The map's own dates are below, typed from the Date column of the Curriculum
 * Map tab. If the planner and the map disagree, one of them is wrong and this
 * says which week.
 */
import { register } from "node:module";
register("./ts-loader.mjs", import.meta.url);
const { planTerm, validateTerm, WAKE_SPRING_2027 } = await import("@/lib/term-plan.ts");

/** Week: [Tuesday, Thursday], from the curriculum map. 2027. */
const MAP = [
  ["01-12", "01-14"], ["01-19", "01-21"], ["01-26", "01-28"],
  ["02-02", "02-04"], ["02-09", "02-11"], ["02-16", "02-18"],
  ["02-23", "02-25"], ["03-02", "03-04"],
  // Spring break, March 6 to 14.
  ["03-16", "03-18"], ["03-23", "03-25"], ["03-30", "04-01"],
  ["04-06", "04-08"], ["04-13", "04-15"], ["04-20", "04-22"],
];

const plan = planTerm({ firstMeeting: "2027-01-12T14:00" });
const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const dow = iso => {
  const [y, m, d] = iso.split("T")[0].split("-").map(Number);
  return DOW[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
};

const fail = [];
const expect = (ok, what) => { if (!ok) fail.push(what); console.log(`${ok ? "ok  " : "FAIL"}  ${what}`); };

expect(plan.length === 28, `28 meetings planned (got ${plan.length})`);
expect(WAKE_SPRING_2027.length === 14, `14 teaching weeks in the template (got ${WAKE_SPRING_2027.length})`);
expect(validateTerm(plan).length === 0, `the plan validates clean (${validateTerm(plan).join(" ") || "no errors"})`);

for (let w = 0; w < MAP.length; w++) {
  for (const [i, day] of MAP[w].entries()) {
    const s = plan[w * 2 + i];
    const want = `2027-${day}`;
    expect(s.startsAt.startsWith(want), `week ${w + 1} day ${i + 1} is ${want} (planner says ${s.startsAt.split("T")[0]})`);
  }
}

expect(plan.every(s => s.startsAt.endsWith("T14:00")), "every meeting starts at 2:00 PM ET");
expect(plan.every(s => s.minutes === 75), "every meeting is 75 minutes");
expect(plan[0].kind === "ORIENTATION", "the term opens with orientation, not a workshop");
expect(plan[0].moduleNumber === null, "orientation belongs to no module");
expect(plan[26].kind === "DEMO_DAY" && plan[27].kind === "DEMO_DAY", "the last week is two Demo Day sessions");
expect(plan.filter(s => s.kind === "LAB").length === 13, `13 labs (got ${plan.filter(s => s.kind === "LAB").length})`);
expect(plan.filter(s => s.kind === "LAB").every(s => s.labKind), "every lab says which kind it is");

console.log("\nThe term as planned:\n");
for (const s of plan) {
  const date = s.startsAt.split("T")[0];
  console.log(
    `  ${String(s.sequence).padStart(2)}  wk${String(s.week).padStart(2)}  ${dow(s.startsAt)} ${date}  ` +
    `${s.kind.padEnd(11)} ${(s.labKind ?? "").padEnd(9)} ` +
    `${s.moduleNumber === null ? "  -" : `M${s.moduleNumber} `} ${s.title}`,
  );
}

const counts = plan.reduce((a, s) => ({ ...a, [s.labKind ?? s.kind]: (a[s.labKind ?? s.kind] ?? 0) + 1 }), {});
console.log("\nBy kind:", counts);
console.log(fail.length ? `\n${fail.length} CHECK(S) FAILED` : "\nThe generated term matches the curriculum map.");
process.exit(fail.length ? 1 : 0);
