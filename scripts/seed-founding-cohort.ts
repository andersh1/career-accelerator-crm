import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const cohort = [
  {
    firstName: "Ori",
    lastName: "Cohen",
    email: "oricohen005@gmail.com",
    phone: "917-436-7335",
    company: "Baruch College",
    jobTitle: "Finance, Sophomore",
    stage: "ENROLLED",
    leadType: "STUDENT",
    source: "REFERRAL",
    priority: "HIGH",
    tags: ["founding-cohort", "finance", "first-gen"],
    notes: "Finance major, Baruch. May 2029. First-gen. Krav Maga instructor. Heard via Hillel (Ryan). Goals: find lane in finance/business, build AI fluency, network strategically, build personal board of advisors.",
  },
  {
    firstName: "Aidan",
    lastName: "Herzlinger",
    email: "aidanherzlinger@gmail.com",
    phone: "917-544-2707",
    company: "Baruch College",
    jobTitle: "Real Estate, Junior",
    stage: "ENROLLED",
    leadType: "STUDENT",
    source: "REFERRAL",
    priority: "HIGH",
    tags: ["founding-cohort", "real-estate", "hillel"],
    notes: "Real Estate major, Baruch. May 2027. Outgoing Hillel president. TAMID fellow. Krav Maga. Goals: real estate acquisitions → raise a fund; AI fluency in financial modeling; high-level industry conversations.",
  },
  {
    firstName: "Shimon",
    lastName: "Jeselsohn",
    email: "shimjes@gmail.com",
    phone: "201-893-7152",
    company: "Baruch College",
    jobTitle: "Finance, Junior",
    stage: "ENROLLED",
    leadType: "STUDENT",
    source: "REFERRAL",
    priority: "NORMAL",
    tags: ["founding-cohort", "finance", "wealth-management"],
    notes: "Finance major, Baruch. May 2028. Heard via Jews of Baruch WhatsApp (Ryan) + TAMID (Matthew Levine). Goals: find internship, explore wealth management, learn to network, overcome analysis paralysis.",
  },
  {
    firstName: "Kristopher",
    lastName: "Kolos",
    email: "kmkolos1@gmail.com",
    phone: "347-452-8999",
    company: "Baruch College",
    jobTitle: "Computer Info Systems, Junior",
    stage: "ENROLLED",
    leadType: "STUDENT",
    source: "REFERRAL",
    priority: "NORMAL",
    tags: ["founding-cohort", "tech", "hillel", "entrepreneur"],
    notes: "CIS major, Baruch. Dec 2026. Division I water polo. Family glass business. Met Dan at Baruch event. Goals: specialize and commit to one direction, pressure-test startup idea (data collection), find tech-adjacent lane, build financial stability.",
  },
  {
    firstName: "Elliot",
    lastName: "Kolker",
    email: "elliotkolker@gmail.com",
    phone: "917-209-0167",
    company: "Falberg STEM Academy",
    jobTitle: "Co-founder + Marketing, Junior",
    stage: "ENROLLED",
    leadType: "STUDENT",
    source: "REFERRAL",
    priority: "NORMAL",
    tags: ["founding-cohort", "marketing", "entrepreneur", "edtech"],
    notes: "Marketing major, Baruch. 2027. Age 18 (graduated HS early). Co-founder of Falberg STEM Academy (550+ students, NJ private schools). Referred by Ilya Bratman. Goals: marketing role + scale Falberg, learn from Dan as ed-tech entrepreneur.",
  },
  {
    firstName: "Maria",
    lastName: "Frayman",
    email: "mariafrayman28@gmail.com",
    phone: "917-495-9302",
    company: "Baruch College",
    jobTitle: "Finance, Rising Sophomore",
    stage: "ENROLLED",
    leadType: "STUDENT",
    source: "REFERRAL",
    priority: "NORMAL",
    tags: ["founding-cohort", "finance", "hillel", "tamid"],
    notes: "Finance major, Baruch. May 2029. Immigrated from Moscow. President of Marketing at Hillel. TAMID member. Referred by Josh Keum. Goals: mentorship, navigate finance paths, avoid wrong steps, close AI gap, move away from marketing.",
  },
  {
    firstName: "Joshua",
    lastName: "Keum",
    email: "joshuakeum9@gmail.com",
    phone: "929-623-3583",
    company: "Baruch College",
    jobTitle: "Finance, Junior",
    stage: "ENROLLED",
    leadType: "STUDENT",
    source: "REFERRAL",
    priority: "HIGH",
    tags: ["founding-cohort", "finance", "tamid", "first-gen"],
    notes: "Finance major, Baruch. May 2028. FIRST-GEN. TAMID member. Referred Maria Frayman. Has fall offer at NYC OTI. Goals: build future-proof skills, find lane (internal consulting/ops), overcome professional networking confidence drop, eventually start business.",
  },
  {
    firstName: "Ernest",
    lastName: "Rafailov",
    email: "ernestrafailov2003@gmail.com",
    phone: null,
    company: "Baruch College",
    jobTitle: "MS Accountancy, Graduate",
    stage: "ENROLLED",
    leadType: "STUDENT",
    source: "REFERRAL",
    priority: "NORMAL",
    tags: ["founding-cohort", "accounting", "graduate", "hillel"],
    notes: "MS Accountancy, Baruch. Graduate student. Referred by Ilya at Hillel. Late entry (joined after orientation). Goals: pass CPA, find what field of business to enter, build accountability in job search, use AI more meaningfully.",
  },
  {
    firstName: "Joshua",
    lastName: "Hakimi",
    email: "joshuahakimi07@gmail.com",
    phone: "516-582-5210",
    company: "Baruch College",
    jobTitle: "Finance, Freshman",
    stage: "LEAD",
    leadType: "WAITLIST",
    source: "REFERRAL",
    priority: "NORMAL",
    tags: ["founding-cohort", "finance", "v2-cohort"],
    notes: "Finance major, Baruch. May 2029. Iranian-Jewish, Great Neck. Speaks 5 languages. Already runs CRM, cold-outreaches bankers, in TAMID. Heard via Hillel. Not eligible for summer 2026 pilot — hold for v2 cohort or guest contributor.",
  },
];

async function main() {
  console.log("Seeding founding cohort into CRM...");

  for (const member of cohort) {
    const existing = await prisma.lead.findFirst({
      where: { email: member.email, deletedAt: null },
    });

    if (existing) {
      console.log(`  SKIP  ${member.firstName} ${member.lastName} (already exists)`);
      continue;
    }

    await prisma.lead.create({
      data: {
        firstName:  member.firstName,
        lastName:   member.lastName,
        email:      member.email,
        phone:      member.phone,
        company:    member.company,
        jobTitle:   member.jobTitle,
        stage:      member.stage,
        leadType:   member.leadType,
        source:     member.source,
        priority:   member.priority,
        tags:       member.tags,
        notes:      member.notes,
      },
    });

    console.log(`  ADDED ${member.firstName} ${member.lastName}`);
  }

  console.log("Done.");
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
