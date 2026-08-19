---
name: coaching-session
description: Log a 1-on-1 coaching session to the CRM and send a follow-up email. Paste a Fathom transcript, get AI analysis, review the draft note + email, then commit.
---

# Coaching Session Logger

Help Dan log a 1-on-1 coaching session to the 10x Career Accelerator CRM and send a follow-up email to the student.

## What you need before starting

- `SKILL_API_KEY` — stored in your environment as `SKILL_API_KEY` (ask Caleb if you don't have it)
- The student's Fathom transcript text (copy from Fathom or paste directly)
- The student's name or email

## Step 1 — Get inputs

Ask Dan:
1. What is the student's name or email?
2. Paste the full session transcript below.

Wait for both before proceeding.

## Step 2 — Analyze the session

POST to the CRM skill endpoint:

```bash
curl -s -X POST https://crm.10ximpact.co/api/skill/session \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $SKILL_API_KEY" \
  -d '{
    "query": "<student name or email>",
    "transcript": "<full transcript text>"
  }'
```

If the response contains `"error"`, show Dan the error and stop.

If the response contains `"matches"` (multiple students found), list the options and ask Dan to specify which one by email, then retry with the email.

## Step 3 — Show Dan the analysis

Display the following clearly:

**Summary:** (the `summary` field)

**Session Notes (to be saved to CRM):**
(the `sessionNotes` field)

**Student Progress:**
- (each item in `studentProgress`)

**Blockers:**
- (each item in `blockers`)

**Next Steps:**
- (each item in `nextSteps` with owner and due date)

**Draft Follow-up Email:**
Subject: (draftEmail.subject)
---
(draftEmail.body)
---

## Step 4 — Get Dan's approval

Ask Dan:
> "Does the session note look right? And do you want to send this email, edit it first, or skip the email?"

Options:
- **"Looks good, send it"** — proceed with note + email as-is
- **"Edit the email"** — ask Dan to paste the revised email body, then proceed
- **"Skip email"** — save the note only, no email
- **"Edit the note"** — ask Dan to paste revised notes, then proceed

## Step 5 — Commit to CRM

POST to the commit endpoint with the (possibly edited) note and email:

```bash
curl -s -X POST https://crm.10ximpact.co/api/skill/session/<leadId>/commit \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $SKILL_API_KEY" \
  -d '{
    "note": "<session notes>",
    "sendEmail": {
      "subject": "<email subject>",
      "body": "<email body>"
    }
  }'
```

If skipping the email, omit the `sendEmail` field entirely.

## Step 6 — Confirm

Show Dan:
- ✓ Session note saved to CRM
- ✓ Email sent to [student email] (or "No email sent")
- Link to the student's CRM record: (the `crmUrl` from the response)
