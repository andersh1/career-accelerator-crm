import { NextResponse } from "next/server";

// CourseIssue model was removed from the schema.
export async function GET()  { return NextResponse.json({ error: "Feature removed" }, { status: 410 }); }
export async function POST() { return NextResponse.json({ error: "Feature removed" }, { status: 410 }); }
