# Career Accelerator CRM

Live at **crm.vantagecareer.co**. This is where cohorts are run: dates, Zoom
links, emails, recordings, rosters.

---

## Commit your work. Always. Before anything is deployed.

**Code that is running has to be in git.** Not "left in the tree for another
session to pick up".

On 8 October, in the LMS, a feature was deployed from a dirty working tree. It
was live and had never been committed. The next deploy came from a clean
worktree off `origin/main`, the correct convention, and silently removed it,
breaking a link on the module Fellows were working in that week. A clean-tree
deploy and a dirty-tree deploy fight each other, and the loser is always
whatever was never committed.

1. **Commit before you hand work off or ask for a deploy.**
2. **Pushing to `main` IS the deploy.** This project is connected to GitHub
   (`andersh1/career-accelerator-crm`), so a push to `main` builds and goes to
   `crm.vantagecareer.co` by itself:
   ```bash
   git push origin main
   ```
   Then confirm the resulting deployment's `meta.githubCommitSha` equals your
   `HEAD` (the Vercel MCP `get_deployment` with `withGitRepoInfo` shows it;
   `vercel inspect` does not). `source: "git"` means it came from a push.

   **Do not run `vercel deploy --prod` from a folder.** It uploads whatever is
   on disk with no commit attached, which is how the 8 October breakage
   happened. Undo with
   `npx vercel promote <previous-url> --scope team_Nvu1yh8J9J7fl7hAoTRdV1i4`.
3. **Never commit** `tsconfig.tsbuildinfo` or `.DS_Store`.
4. **Check before deploying**: `git fetch && git status`. Other sessions push
   here. If the tree is dirty with someone else's work, find out whether it is
   already live before shipping over it.

---

## This database is production, and it is shared with the LMS

`.env.local`'s Neon connection string **is** the live database. Targeted reads
and updates only.

**Never** run `prisma db push`, `prisma migrate` or `db:seed`. This schema is a
SUBSET of the LMS's, so pushing from here drops LMS-only columns. Schema
changes are raw `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`, then mirrored by
hand into **both** `prisma/schema.prisma` files and `npx prisma generate` run
in both.

---

## The division of labour with the LMS

**The CRM runs cohorts. The LMS delivers and owns curriculum.**

| Here | In the LMS |
|---|---|
| Dates, Zoom links, the schedule | Module content (Admin → Content) |
| Which content version a cohort runs | Writing and reviewing that content |
| Recordings and decks ("After the session") | How any of it renders |
| Per-cohort email copy (Emails tab) | Coaching notes on a Fellow |
| The cohort board | |

Writes that have real invariants go **through the LMS endpoint** rather than
straight into the shared database, so there is one implementation. Posting a
recording is the example: it finds or creates the module's replay section,
rewrites Google links to the embeddable `/preview` form, and keeps one deck and
one recording per module per cohort. Two copies of those rules drift, and drift
means a Fellow seeing two recordings or one cohort's replacing another's.
Reads with no invariants go direct.

---

## Before you call it done

- `npx tsc --noEmit` and `npx next build`, both clean.
- **Verify against real data, not just types.**
- Update the Help section and the navigation when you add a feature.
- Nothing Fellow-facing ships without Dan's approval.
- No em dashes in Fellow-facing copy.
