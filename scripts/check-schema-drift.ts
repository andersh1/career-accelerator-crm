/**
 * check-schema-drift.ts
 *
 * Compares the CRM prisma/schema.prisma against the LMS prisma/schema.prisma
 * and reports any models or fields present in CRM but missing from LMS.
 *
 * LMS is the DB source of truth — every CRM schema change must be mirrored
 * in the LMS schema BEFORE running `prisma db push`.
 *
 * Run: npx tsx scripts/check-schema-drift.ts
 */

import { readFileSync } from "fs";
import { resolve } from "path";

const CRM_SCHEMA = resolve(__dirname, "../prisma/schema.prisma");
const LMS_SCHEMA = resolve(__dirname, "../../Career Accelerator LMS/prisma/schema.prisma");

function parseFields(schema: string): Record<string, Set<string>> {
  const models: Record<string, Set<string>> = {};
  let currentModel: string | null = null;

  for (const raw of schema.split("\n")) {
    const line = raw.trim();
    const modelMatch = line.match(/^model\s+(\w+)\s*\{/);
    if (modelMatch) {
      currentModel = modelMatch[1];
      models[currentModel] = new Set();
      continue;
    }
    if (line === "}" && currentModel) {
      currentModel = null;
      continue;
    }
    if (currentModel && line && !line.startsWith("//") && !line.startsWith("@") && !line.startsWith("@@")) {
      const fieldName = line.split(/\s+/)[0];
      if (fieldName && !fieldName.startsWith("//")) {
        models[currentModel].add(fieldName);
      }
    }
  }
  return models;
}

const crmSchema = readFileSync(CRM_SCHEMA, "utf8");
const lmsSchema = readFileSync(LMS_SCHEMA, "utf8");

const crmModels = parseFields(crmSchema);
const lmsModels = parseFields(lmsSchema);

let driftFound = false;

for (const [model, fields] of Object.entries(crmModels)) {
  if (!lmsModels[model]) {
    console.log(`❌ Model missing from LMS: ${model}`);
    driftFound = true;
    continue;
  }
  for (const field of fields) {
    if (!lmsModels[model].has(field)) {
      console.log(`❌ Field missing from LMS: ${model}.${field}`);
      driftFound = true;
    }
  }
}

if (driftFound) {
  console.log("\n⚠️  Schema drift detected.");
  console.log("   Add the missing fields to the LMS schema, then run:");
  console.log("   cd '../Career Accelerator LMS' && npx prisma db push");
  console.log("   Then redeploy both apps.\n");
  process.exit(1);
} else {
  console.log("✅ No schema drift — CRM and LMS schemas are in sync.");
}
