/**
 * The on-ramp from a partner enquiry to the partnerships pipeline.
 *
 * A college filling in "Partner with Us" used to produce one thing: a Lead. The
 * partnerships side of the CRM — Organizations and Deals, the board Dan opens —
 * was never touched, so seventeen organizations had been typed in by hand and
 * the deal board had never held a single card. An enquiry was recorded and then
 * sat in the student funnel, which is not where anyone looks for a university.
 *
 * The split this file rests on is David's: "the organization has multiple
 * contact people, and then underneath that organization, we're working on
 * specific deals with them." So a partner enquiry is three facts, not one:
 *
 *   the institution  -> Organization   (the account)
 *   the person       -> Lead           (already created by the caller)
 *   the opportunity  -> Deal           (PROSPECTING, on Dan's board)
 *
 * That also settles an old tension in the intake route. A partner enquiry from
 * an email already in the CRM deliberately does NOT change the person's lead
 * type — a prospective student stays a prospective student. That rule is right
 * and stays, because the person is not the account. The account is created
 * either way, so a careers director who once asked about the programme for
 * their own child still puts their university on the board.
 *
 * Nothing here may throw. An enquiry that reached the CRM is already safe; a
 * failure to file it tidily must never turn into a 500 that tells a college
 * their message did not send.
 */
import { prisma } from "@/lib/prisma";
import { DAN } from "@/lib/lead-routing";

/** Deal statuses that mean the conversation is over. */
const CLOSED = ["CLOSED_WON", "CLOSED_LOST"];

/**
 * A name reduced to the part worth matching on: case, punctuation and a leading
 * "the" all dropped. "Wake Forest University" and "wake forest university." are
 * the same account; "BHSU" and "Black Hills State University" are not, and this
 * does not pretend otherwise. Guessing at acronyms would silently merge two
 * real institutions, which is far more expensive to undo than merging two rows
 * by hand later.
 */
export function normalizeOrgName(raw: string): string {
  // Collapse and trim BEFORE stripping a leading "the": done the other way
  // round, " The University of New Haven" keeps its "the" because the pattern
  // is anchored at a space, and silently becomes a second account.
  return raw
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^the /, "");
}

export interface PartnerOnRamp {
  organizationId: string;
  organizationName: string;
  dealId: string;
  createdOrganization: boolean;
  createdDeal: boolean;
}

/**
 * File a partner enquiry on the partnerships side: find or open the account,
 * attach the person to it, and make sure there is a live deal to work.
 *
 * Returns null when there is nothing to anchor an account to (no institution
 * named) or when anything at all goes wrong. The caller still alerts and still
 * notifies either way — this only decides whether the enquiry also lands on the
 * board.
 */
export async function onboardPartnerEnquiry(opts: {
  leadId: string;
  /** The institution as the enquirer typed it. */
  company: string | null | undefined;
  contactName: string;
}): Promise<PartnerOnRamp | null> {
  const typed = opts.company?.trim();
  if (!typed) return null;

  try {
    const key = normalizeOrgName(typed);
    if (!key) return null;

    /**
     * Matching happens in JS rather than SQL because the comparison is on the
     * normalised form, which no column holds. The table is small by nature —
     * one row per institution we have ever spoken to — so reading it is cheap,
     * and the cap is only there so this can never become the slow part of a
     * public endpoint.
     */
    const candidates = await prisma.organization.findMany({
      select: { id: true, name: true },
      take: 2000,
    });
    const match = candidates.find(o => normalizeOrgName(o.name) === key);

    let organizationId: string;
    let organizationName: string;
    let createdOrganization = false;

    if (match) {
      organizationId = match.id;
      organizationName = match.name;
    } else {
      /**
       * UNIVERSITY is the default because that is who the form is written for.
       * It is a starting guess on a field anyone can change in one click, not a
       * claim — an employer or a high school gets retyped by whoever works the
       * deal.
       */
      const created = await prisma.organization.create({
        data: {
          name: typed,
          type: "UNIVERSITY",
          createdBy: "website-intake",
          assignedTo: DAN,
          notes: "Opened automatically from a Partner with Us enquiry.",
        },
        select: { id: true, name: true },
      });
      organizationId = created.id;
      organizationName = created.name;
      createdOrganization = true;
    }

    // Attach the person to the account, without disturbing an existing link.
    await prisma.lead.updateMany({
      where: { id: opts.leadId, organizationId: null },
      data:  { organizationId },
    });

    /**
     * One live deal per account, not one per enquiry. Two people from the same
     * university writing in the same week is one conversation, and a board that
     * grows a card per form submission is the noise problem in a new place.
     */
    const open = await prisma.deal.findFirst({
      where:   { organizationId, status: { notIn: CLOSED } },
      select:  { id: true },
      orderBy: { createdAt: "desc" },
    });

    if (open) {
      await prisma.dealActivity.create({
        data: {
          dealId:    open.id,
          type:      "NOTE",
          content:   `New enquiry through Partner with Us — ${opts.contactName}.`,
          createdBy: "website-intake",
        },
      }).catch(() => {});
      return {
        organizationId, organizationName,
        dealId: open.id, createdOrganization, createdDeal: false,
      };
    }

    const deal = await prisma.deal.create({
      data: {
        title:         `${organizationName} — inbound enquiry`,
        orgName:       organizationName,
        organizationId,
        dealType:      "PARTNERSHIP",
        status:        "PROSPECTING",
        contactLeadId: opts.leadId,
        assignedTo:    DAN,
        notes:         "Opened automatically from a Partner with Us enquiry.",
      },
      select: { id: true },
    });

    await prisma.dealActivity.create({
      data: {
        dealId:    deal.id,
        type:      "NOTE",
        content:   `Opened from a Partner with Us enquiry — ${opts.contactName}.`,
        createdBy: "website-intake",
      },
    }).catch(() => {});

    return {
      organizationId, organizationName,
      dealId: deal.id, createdOrganization, createdDeal: true,
    };
  } catch (err) {
    console.error("[partner-onramp] failed to file enquiry:", err);
    return null;
  }
}
