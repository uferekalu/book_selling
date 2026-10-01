---
name: new-feature-branch
description: Use when starting any new work on the book_selling repo — "start the next ticket", "begin BS-N", "create a feature branch", "move to the next phase", a bug fix, or any code change at all (main is protected, so every change needs a branch). Creates feature/BS-<n>-<description> off an up-to-date main, bumps the ticket counter in docs/ROADMAP.md, and walks the change through PR, CI, and self-merge.
---

# New Feature Branch (book_selling)

`main` is protected (PR required, CI checks `Backend (lint, build, test)` and `Frontend (lint,
build, test)` required, admins included). Nothing is ever pushed to `main` directly.

## Steps

1. **Find the ticket number** at the top of `docs/ROADMAP.md`:
   - Planned roadmap work: **"Next planned ticket"**. Use its row's "Branch suffix" and scope.
   - Reactive work (bug report, hotfix, follow-up, the user's new idea): **"Next reactive ticket"**.
     Choose a 2–4 word kebab-case suffix, and add a row at the end of the table when done.
   - If other work is in progress, `git stash push -u -m "<what>"` first, and `git stash pop`
     on that branch after the fix is merged (and rebased on `main`).
2. **Update main.**
   ```
   git fetch origin
   git checkout main
   git pull --ff-only origin main
   ```
   If the working tree has uncommitted changes, stop and ask the user what to do with them. Never
   discard them.
3. **Branch.** `git checkout -b feature/BS-<n>-<suffix>`
4. **Bump the counter** in `docs/ROADMAP.md` to `BS-<n+1>`. Commit it together with real work, not as
   a separate empty commit.
5. **Do the work**, following `CLAUDE.md`, `docs/ENGINEERING_RULES.md` and the ARCHITECTURE sections
   for the area. For payments, orders, checkout, coupons or library code, also run the
   `money-path-review` skill before opening the PR.
6. **Definition of done** (ENGINEERING_RULES §2). Run and record the results:
   ```
   cd backend  && npm run lint && npx tsc --noEmit -p tsconfig.json && npm run build && npm test && npm run test:e2e
   cd frontend && npm run lint && npm test && npm run build
   ```
   Then update the docs: rewrite the ROADMAP row as "✅ Done" with real detail (what shipped, any
   deviation from the plan and why, incidents), plus any ARCHITECTURE section or CLAUDE.md
   convention that changed.
7. **Commit** with messages starting `BS-<n>: …`, ending with the attribution lines required by
   the current session.
8. **Push and open the PR:**
   ```
   git push -u origin feature/BS-<n>-<suffix>
   gh pr create --base main --title "BS-<n>: <summary>" --body "<Summary / Why / Test plan>"
   ```
9. **Wait for CI:** `gh pr checks --watch`. If it fails, fix it on the same branch and push again.
10. **Merge** (standing instruction from the user, 2026-09-30):
    `gh pr merge --squash --delete-branch`. Then `git checkout main && git pull --ff-only`.
    Tell the user what shipped, with the PR link. Stop and ask instead of merging if the fix for a
    CI failure isn't obvious, or if a money-flow change goes beyond what the docs already specify.
