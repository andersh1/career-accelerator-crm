import { NextResponse } from "next/server";

// CourseIssue model was removed from the schema.
export async function PATCH()  { return NextResponse.json({ error: "Feature removed" }, { status: 410 }); }
export async function DELETE() { return NextResponse.json({ error: "Feature removed" }, { status: 410 }); }
