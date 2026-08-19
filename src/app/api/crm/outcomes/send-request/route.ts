import { NextResponse } from "next/server";

// DISABLED: "ENROLLED" stage = completed enrollment pipeline, NOT graduated from the program.
// Outcome emails must only go to students who have finished and graduated (certificateIssuedAt set).
// Re-enable this route once the send logic is updated to filter by graduation status.
export async function POST() {
  return NextResponse.json(
    { error: "Outcome email sends are disabled until cohort graduation filtering is implemented." },
    { status: 503 }
  );
}
