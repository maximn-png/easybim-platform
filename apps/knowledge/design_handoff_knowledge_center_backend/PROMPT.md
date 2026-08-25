
Read these files in full before writing any code:

  README.md                          — your working rules and the phase plan
  PRD.md                             — the product spec and what ships in Release 1
  spec/Data Model.md                 — the schema
  spec/API Endpoints.md              — the contract you implement
  spec/Block Contract.md             — the content format
  spec/UI States.md                  — the states the UI already renders
  spec/Roles and Permissions.md      — server-side permission rules
  spec/Integration Points.md         — Monday, Google Docs, email, ACC/Forma, AI

Then open frontend/EasyBIM Knowledge Center.html in a browser and actually use it. It is a
complete, working frontend running on mock data. It is not a prototype to be rebuilt — it
ships as-is, backed by the API you are about to write.

Context you need up front:

- This becomes a new app inside the existing easybim-platform Turborepo (Next.js, pnpm).
  Authentication comes from the existing Portal sign-in — do not build a second auth system.
- Release 1 ships the Employee role only. No Onboarding role, no Team Lead console, no
  progress tracking, no assignments. The frontend already hides all of it under the Employee
  role, so this is a matter of not enabling it, not of removing code.
- Release 1 does include all the real external connections: Monday structure sync, Google Docs
  digestion, real email sending, the ACC/Forma hand-off, and a real AI mentor and translator.
- There is exactly one seam between frontend and backend: frontend/kc-api.js. All integration
  happens there and in your backend. If you find yourself editing kc-app.js, kc-teamlead.js,
  kc-suggest.js, kc-send.js or kc-docpage.js to make data flow, you have taken a wrong turn.
- Do not redesign, restyle, or migrate the frontend to a framework. If you believe a UI change
  is genuinely required, stop and ask.
- English for all code, comments, filenames and commits. User-facing UI copy is localized —
  leave those strings alone.

Your first task is phase R1.0 only: propose the stack and the project structure inside the
monorepo, and the database schema derived from spec/Data Model.md. Write nothing else until
I approve that proposal. Then implement R1.0 and stop for review.
```

---

## Session-by-session order

| Session | Phase | Ask for |
|---|---|---|
| 1 | R1.0 | Stack proposal + schema + migrations + seed |
| 2 | R1.1 | Portal auth, everyone as Employee, server-side permissions |
| 3 | R1.2 | Monday sync + `GET /tree` |
| 4–5 | R1.3 | Google Docs digest + document API + figures |
| 6 | R1.4 | Notebook, personal documents, bookmarks, dictionary, preferences |
| 7 | R1.5 | AI mentor (retrieval over digested docs) + AI translation |
| 8 | R1.6 | Email send + ACC/Forma hand-off + send log |
| 9 | R1.7 | Suggestion capture + the owner's read-only list |
| 10 | — | Hardening, the digest of the remaining documents, launch |

Release 2 (Team Lead console, Onboarding role, progress, assignments) starts only after
Release 1 has been used for two weeks by the real test group.

## What to do when it goes sideways

- **It starts rewriting the frontend.** Stop it, point at rule 1 in README.md, revert. This is
  the single most likely failure mode.
- **It invents an endpoint.** The contract is `spec/API Endpoints.md`. If something genuinely
  is missing, have it propose an addition to the spec file first, then implement.
- **It wants to skip ahead.** Phases exist because each one is verifiable. Refuse.
- **The digest output looks wrong.** That is expected on the first real documents — feed it the
  hardest one (Hebrew, many figures) early and let it correct the converter against reality.
