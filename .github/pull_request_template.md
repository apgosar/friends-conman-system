## What and why

<!-- One or two sentences. -->

## Checklist (see AGENTS.md and docs/DESIGN_PRINCIPLES.md)

- [ ] UI uses the shared kit (`src/components/ui`) and classes from `src/styles`: no fixed inline styles, no hex colours, no hand-built buttons, dialogs or tables
- [ ] Error text goes through `apiError` / `fail` / `errorMessage`; screens use `fetchJson`; no `err.message` sent to the browser
- [ ] Dates, numbers, statuses use `format.ts` / `status.ts`; permissions use `can()`; money uses `money.ts` / `pricing.ts`
- [ ] New API routes use `route()` (or `requireRole`) and validate input
- [ ] Multi-write operations use `transaction()`; sale queries use `activeSale`
- [ ] Database change has a migration; new env vars are in the three `.env*.example` files and `src/lib/env.ts`
- [ ] Checked at phone (390), tablet (820) and desktop widths if anything visual changed
- [ ] `npx tsc --noEmit`, `npm run lint:ci` and `npm test` pass (lint warning ceiling not raised)
- [ ] If a convention changed, `AGENTS.md` and `docs/DESIGN_PRINCIPLES.md` were updated
