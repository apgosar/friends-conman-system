# Instructions for GitHub Copilot

Follow [`AGENTS.md`](../AGENTS.md) in the repository root; it is the single source of truth for how code is written here, and [`docs/DESIGN_PRINCIPLES.md`](../docs/DESIGN_PRINCIPLES.md) says where every shared piece lives. Read both before suggesting changes.

The five that matter most:

1. Build UI only from `src/components/ui` (Button, TextField, Modal, Alert, Table, StatusBadge…). Style with classes from `src/styles`, never fixed inline styles or hex colours.
2. Errors and wording come from `src/lib/errors.ts` / `apiError`; screens call the API through `fetchJson`; dates and numbers through `src/lib/format.ts`; statuses through `src/lib/status.ts`.
3. Every API route uses `route()` (or `requireRole`), validates with zod, and never returns `err.message`.
4. Permissions only through `can()` (`src/lib/authz.ts`). Money only through `src/lib/money.ts` and `src/lib/pricing.ts`. Transactions only through `transaction()` (`src/lib/db.ts`).
5. Finish with `npx tsc --noEmit`, `npm run lint:ci` and `npm test`.
