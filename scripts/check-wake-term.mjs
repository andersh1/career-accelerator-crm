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
const {
  planTerm, planModules, validateTerm, templateFromSessions,
  WAKE_SPRING_2027, WAKE_WEIGHTS, TERM_TEMPLATES,
} = await import("@/lib/term-plan.ts");

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

// The modules derived from those meetings.
const mods = planModules(plan);
expect(mods.length === 8, `8 modules derived from the term (got ${mods.length})`);
expect(mods.every(m => m.opensAt.endsWith("T09:00")), "every module opens at 9:00 AM ET");
expect(mods.every(m => m.assignmentDue.endsWith("T23:59")), "every assignment is due at 11:59 PM ET");
expect(
  mods.every(m => new Date(m.opensAt) < new Date(m.assignmentDue)),
  "every module opens before its own assignment is due",
);
expect(
  mods.every((m, i) => i === 0 || new Date(mods[i - 1].assignmentDue) <= new Date(m.assignmentDue)),
  "module deadlines run in order",
);
const weightTotal = Object.values(WAKE_WEIGHTS).reduce((a, b) => a + b, 0);
expect(weightTotal === 90, `module weights total 90%, leaving 10% for attendance and touchpoints (got ${weightTotal})`);
// Module 1 spans two weeks on the map: Jan 19 to Jan 28, so it opens the Monday
// before the first meeting and is due the Friday of the second week.
expect(mods[0].opensAt.startsWith("2027-01-18"), `Module 1 opens Mon Jan 18 (got ${mods[0].opensAt})`);
expect(mods[0].assignmentDue.startsWith("2027-01-29"), `Module 1's assignment is due Fri Jan 29 (got ${mods[0].assignmentDue})`);

/**
 * THE SECOND UNIVERSITY. The real test of "is this a model we can reuse" is
 * whether a term that has been saved can be read back as a shape and rerun on a
 * different date, with no code change and nothing of the first school carried
 * across.
 *
 * So: pretend the Wake term is in the database, read it back, and plan a new
 * class from it starting Tuesday 31 August 2027.
 */
const asSaved = plan.map(s => ({
  sequence: s.sequence,
  week: s.week,
  kind: s.kind,
  labKind: s.labKind,
  title: s.title,
  moduleId: s.moduleNumber === null ? null : `mod-${s.moduleNumber}`,
  startsAt: new Date(`${s.startsAt}:00-05:00`),
}));
const moduleNumberById = new Map(Array.from({ length: 8 }, (_, i) => [`mod-${i + 1}`, i + 1]));
const copied = templateFromSessions(asSaved, moduleNumberById);
const second = planTerm({ firstMeeting: "2027-08-31T10:00", template: copied, minutes: 50 });

expect(copied.length === 14, `the saved term reads back as 14 weeks (got ${copied.length})`);
expect(second.length === 28, `the copy plans 28 meetings (got ${second.length})`);
expect(validateTerm(second).length === 0, `the copy validates clean (${validateTerm(second).join(" ") || "no errors"})`);
expect(
  second.every((s, i) => s.kind === plan[i].kind && s.labKind === plan[i].labKind && s.title === plan[i].title),
  "the copy has the same kinds, lab kinds and titles, meeting for meeting",
);
expect(
  second.every((s, i) => s.moduleNumber === plan[i].moduleNumber),
  "the copy maps to the same modules",
);
expect(second[0].startsAt === "2027-08-31T10:00", `the copy starts on its own date (got ${second[0].startsAt})`);
expect(second.every(s => s.minutes === 50), "the copy uses its own class length");
expect(
  second.every(s => !s.zoomLink && !s.location),
  "the copy carries no Zoom links and no rooms from the class it was copied from",
);
// The break has to survive the copy, in the same place, derived from the source
// term's own dates rather than from a constant.
const gap = (p, i) => (new Date(`${p[i].startsAt}:00Z`) - new Date(`${p[i - 2].startsAt}:00Z`)) / 86400000;
expect(gap(second, 16) === 14, `the copy keeps a break week after week 8 (gap was ${gap(second, 16)} days)`);
expect(Object.keys(TERM_TEMPLATES).length >= 1, "at least one built-in term shape is registered");

console.log("\nThe modules as planned:\n");
for (const m of mods) {
  console.log(
    `  M${m.moduleNumber}  weeks ${String(m.firstWeek).padStart(2)}-${String(m.lastWeek).padStart(2)}  ` +
    `opens ${m.opensAt.split("T")[0]}  due ${m.assignmentDue.split("T")[0]}  ` +
    `${m.weightPct === null ? "unweighted" : m.weightPct + "%"}`,
  );
}

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
