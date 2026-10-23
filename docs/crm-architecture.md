# How the CRM is organised

Written 23 October 2026, after a working session on partner routing, notification
noise and the Ignition integration. It records the shape we are building toward,
what is already true, and which decisions are still open — so the next person
does not have to re-derive any of it.

This is a design note, not a spec. Where it says "proposed", nothing is built.

---

## The problem it exists to solve

One object and one stage ladder were serving two completely different sales
motions.

`Lead.stage` is an admissions funnel: Waitlist → Lead → Consultation →
Application → Interview → Offer → Enrolled → Graduated. A university does not go
through "Application" or "Interview". It goes Prospecting → Proposal →
Negotiating → Signed.

That second ladder already exists on `Deal`. Until October 2026 nothing was
wired to it: seventeen Organizations had been typed in by hand and the Deals
board had never held a single card.

With universities and schools becoming a bigger share of the business, the two
motions have to stop sharing a pipeline.

## The rule everything else follows

**Track the thing that pays.**

- An institution pays → **Organization + Deal**
- A family or an individual pays → **Lead** on the admissions ladder

Every routing question resolves against that one sentence.

## The four objects

| Object | Job |
| --- | --- |
| **Organization** | The account. A university, school, employer, agency. |
| **Lead** | Every *person*, in both motions. |
| **Deal** | An institutional revenue event, under an Organization. |
| **Cohort** | Delivery. `track` is COHORT or PRIVATE. |

David's framing, quoted in `schema.prisma` above `Organization`, is the one to
hold onto: *"the organization has multiple contact people, and then underneath
that organization, we're working on specific deals with them."*

### A person is not an account

This is the distinction that resolves the oldest confusion in the intake route.

A partner enquiry from an email already in the CRM **does not** change that
person's lead type. A prospective student stays a prospective student. A careers
director who once asked about the programme for their own child is still, as a
person, a consultation lead.

That rule is correct and should not be "fixed". It only ever read as a bug
because the person was the *only* thing being recorded. The account now opens
alongside them, which is where the institution belongs.

### Proposed: split Lead by who they are buying for

`leadType` currently mixes two different ideas. STUDENT, PARENT, APPLICATION and
CONSULTATION describe someone buying for themselves. CONTACT and PARTNER
describe a person at an organisation.

Because there is no clean line, account contacts get scored, escalated and
chased like prospective students. `NON_PARTICIPANT_TYPES` already keeps them out
of blast emails; the same exclusion needs to reach the cold-lead cron.

A `kind` of PROSPECT or CONTACT would make the line explicit. Not built.

## Two boards that never mix

- **Admissions** — the `STAGES` ladder, filtered to prospects only.
- **Partnerships** — the `Deal` ladder, one card per institution.

Dan opens one and sees only schools. David opens the other and sees only
students. Partner stages must never be added to `STAGES`: it is the obvious
shortcut and it permanently poisons every student conversion number.

---

## Built: the partner on-ramp

`src/lib/partner-onramp.ts`, called from both paths of
`api/public/intake/route.ts` (new lead and existing-lead merge).

On a partner enquiry:

1. Find or open an **Organization**, matched on a normalised name, defaulting to
   type UNIVERSITY and assigned to Dan.
2. Link the person via `lead.organizationId`.
3. Open a **Deal** — PROSPECTING, `dealType: PARTNERSHIP`, titled
   `"<Organization> — inbound enquiry"`, `contactLeadId` set to the person.
4. Point the notification at `/partnerships/deals/<id>` rather than the lead.

Three deliberate choices:

- **One live deal per account, not one per submission.** Two people from the
  same university writing in the same week is one conversation. A repeat enquiry
  logs a `DealActivity` on the open deal instead.
- **Acronyms are not guessed.** `normalizeOrgName` drops case, punctuation and a
  leading "the", so `"wake forest university."` matches Wake Forest University.
  BHSU and Black Hills State University stay separate. Silently merging two real
  institutions is far more expensive to undo than merging two rows by hand.
- **Nothing in it may throw.** An enquiry that reached the CRM is already safe. A
  failure to file it tidily must never become a 500 that tells a college their
  message did not send.

`PARTNER` also now routes to Dan in `lead-routing.ts`; before this it had no
entry at all, so every partner enquiry landed unassigned.

### Open

- `Organization.type` has no SCHOOL value. High schools currently land as
  UNIVERSITY and get retyped by hand. Add one if the schools motion grows.
- The default type is a starting guess on a one-click field, not a claim.

---

## Proposed: Deal as the universal revenue object

**Every sale is a Deal, B2C included.**

- University buys 15 seats → Deal, `paymentType: ORG_INVOICE`, 15 participants
- School runs a cohort → Deal, `dealType: PARTNERSHIP`
- Individual student enrols → Deal, `paymentType: INDIVIDUAL`, one participant
- Private 1:1 client → Deal, INDIVIDUAL, different price

`Deal.paymentType` is already `ORG_INVOICE | INDIVIDUAL | MIXED`. The model was
designed for this and never wired.

**Why it matters.** `PaymentRecord.leadId` is currently required, so a $45k
university invoice has nowhere to land except stapled to one person's record.
Revenue by motion is unanswerable today because institutional money has no
shape.

**The objection, and the answer.** Nobody wants to hand-create a deal per
student. So don't: auto-create the Deal when a lead reaches OFFER_SENT. It is
plumbing for individuals and a working board for institutions. Dan and David
never see it for a student.

**Migration.** `PaymentRecord` gains `dealId`, `leadId` becomes nullable, and
existing rows backfill into auto-created deals. This one needs a written,
reviewed script and a quiet window.

---

## Proposed: Ignition

The groundwork in `src/lib/ignition.ts` is sound and does not need redoing. It
normalises both the Zapier shape (phase 1) and Ignition's own webhook envelope
(phase 2), `PaymentRecord.externalId` is unique so repeat deliveries update
rather than double-bank, and `amountCents` keeps the true figure.

Its one limitation is that every part of it is keyed to a Lead.

### Mapping

| Ignition | CRM |
| --- | --- |
| Client | **Organization** (B2B) or **Lead** (B2C) |
| Proposal | **Deal** |
| Invoice / Payment | **PaymentRecord** on the Deal |

The join key moves from the lead id to the **deal id** in `external_reference`.
Keep reading the old lead-ref shape so historical records do not break — the
file already normalises two envelope shapes, so a third is a small change in a
place built for it.

Ignition's API is also available to us directly, which means the CRM can create
the proposal rather than someone rekeying a deal into Ignition and hoping the
reference matches. That removes the likeliest source of broken links.

### Stage automation

Wire the events to stage changes so the boards move because money moved:

| Event | Deal | Lead |
| --- | --- | --- |
| `proposal.sent` | PROPOSAL_SENT | OFFER_SENT |
| `proposal.accepted` | SIGNED | ENROLLED |
| `proposal.lost` | CLOSED_LOST | LOST |
| `invoice.paid` | ACTIVE once fully paid | — |

This matches the Cohorts board, which already auto-advances and is never
draggable. Consistency matters: if one board is truth-from-events and another is
hand-maintained, people stop trusting both. It also kills the deal that sits in
"Proposal Sent" for two months because nobody moved it after the money landed.

---

## Proposed: closing the seats loop

Deal SIGNED with 15 seats → promo code attached to the Organization → students
apply with it → `Deal.participants` fills automatically. The card reads "9 of 15
seats claimed", revenue sits on the deal, students count against the org.

`PromoCode.organizationId` and `Deal.participants` both exist and are unused.
Without this, every institutional deal needs someone hand-tagging students
forever, and that is the job nobody does.

---

## Notification noise

As of 23 October 2026, two types were 92% of the feed:

```
TASK_OVERDUE   1,047
LEAD_COLD        349
NEW_INTAKE        86
OFFER_SENT        15
TASK_DONE          8
LEAD_ENROLLED      7
OFFER_STALE        4
```

Three design faults in `api/cron/notifications/route.ts`:

1. **No terminal state.** The query is `priority IN (HIGH, URGENT)` and
   `updatedAt < 7 days`, deduped only once per lead per day. A dormant lead
   shouts every day forever. Nothing retires.
2. **Auto-escalation defeats itself.** Every cold HIGH lead becomes URGENT, so
   the body line is always "auto-escalated to URGENT". When everything is
   urgent, nothing is.
3. **Test records are in scope.** Leads have no equivalent of the LMS's
   `isTestAccount`.

`take: 10` also truncates silently, so the ten shown may not be the ten that
matter.

Not fixed yet.

---

## Suggested order

1. ~~Partner on-ramp~~ — done, 23 Oct 2026.
2. Notification cleanup. Standalone, no migration.
3. Deal as revenue object. Has a backfill; wants a quiet window.
4. Repoint Ignition to the deal reference, keeping the lead fallback.
5. Stage automation from Ignition events.
6. Seats → promo code → participants.

Steps 2, 5 and 6 each deliver on their own.

## Cautions

- **The LMS and CRM share one database** and mirror `prisma/schema.prisma` **by
  hand**. A column needs the raw `ALTER TABLE` on production, both schema files
  edited, and `npx prisma generate` in both repos. This is why the work belongs
  in one session, not two.
- **`.env.local` is production.** No `db:seed`, no `prisma db push`, no
  `prisma migrate`. Targeted updates only, and backfills as reviewed scripts.
- **Deploying is `git push origin main`.** Never `vercel deploy --prod`.
- **Hold Tuesday deploys until after 8 PM ET** — live sessions run 6:30–8 PM.
