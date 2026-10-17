<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Shell / Command Execution Rules

- All commands will run in PowerShell, so write commands in PowerShell-friendly syntax.
- **Exception**: When SSHed into an EC2 instance, use `tcsh` syntax.

<!-- BEGIN:neev-project-rules -->
# Neev CMS project rules (read before changing code)

The app has **one implementation of every kind of thing**, and a test/lint gate that keeps it that way. Do not add a second way. The full reference, with the reasons and the location of every shared file, is [`docs/DESIGN_PRINCIPLES.md`](docs/DESIGN_PRINCIPLES.md): read its section for the area you are touching. Search `src/lib` and `src/components/ui` for an existing helper **before** writing one.

## Always (these are enforced by `npm run lint:ci` and `npm test`)

**UI**
1. Build screens from the kit in `src/components/ui` (import from `@/components/ui`): `Button`/`ButtonLink`, `TextField`/`SelectField`/`TextareaField`/`CheckboxField`, `Modal`, `Alert`, `Card`, `PageHeader`, `Table` + `Td label`, `StatusBadge`, `FilterChips`, `Pagination`, `Tabs`, `StatCard`, `EmptyState`. Never hand-style a button, input, dialog, badge or table.
2. Feedback: `useToast()` for "it worked/failed", `useConfirm()` for "are you sure", `Alert` for inline messages. No `alert()` / `confirm()`.
3. Styling: classes only. CSS lives in `src/styles/` (`tokens.css` values, `components.css` components, `utilities.css` helpers, `responsive.css` breakpoints). No fixed inline `style={{}}`, no hex colours, no `<style>` blocks in components. A new colour, size or spacing is a token in `tokens.css`.
4. Every screen works at 390 px, 820 px and 1440 px with no sideways page scroll (tables use `Table stack` and labelled `Td`s). Check with `scripts/visual-check.mjs`.
5. Pages are server components; add `'use client'` only when needed; client files never import `@/lib/db` or `@/lib/auth`. Pass database rows to client components through `plain()`.

**Wording**
6. Error text comes from `src/lib/errors.ts` and `apiError(kind, message?)` / `throw fail(kind, message?)`. House style: plain words, sentence case, says what to do, **no trailing full stop**, never internals. Never send `err.message` or a stack trace to the browser.
7. Screens call the API only through `fetchJson` / `jsonRequest` / `errorMessage` (`src/lib/client/api.ts`).
8. Dates and numbers are formatted only by `src/lib/format.ts`. Status names and colours come only from the registries in `src/lib/status.ts` (render with `<StatusBadge kind=…>`).

**Server**
9. Every API route is `route(permission, handler)` (`src/lib/route.ts`) or checks `requireRole(...)`. Who may do what is decided only by `can()` in `src/lib/authz.ts`; never compare role names. Validate input with zod.
10. Money is exact: arithmetic through `src/lib/money.ts` (paise), charges through `src/lib/pricing.ts` (rates are per project; no hard-coded 5 % / 6 %).
11. Writes that must succeed together use `transaction()` from `src/lib/db.ts`, never `prisma.$transaction(async …)`. Queries that list or total sales filter with `activeSale`. Delete with `softDelete`.
12. PAN and Aadhaar are encrypted; screens use `maskedPan` / `maskedAadhaar`, only documents use `revealPii`. Never log or return them.
13. Anything that becomes HTML (email, PDF, templates) is escaped with `escapeHtml`; PDFs are made only by `renderHtmlToPdf`.
14. Logging is `logger` (pino). No `console.*`.
15. Database changes need a migration (`npx prisma migrate dev --name …`); never edit one that has shipped. New environment variables go in the three `.env*.example` files and `src/lib/env.ts`.

## Before you say a change is done

Run, and fix what they report (do not raise the lint warning ceiling in `package.json`, do not skip or delete a test to get green):

```powershell
npx tsc --noEmit
npm run lint:ci
npm test            # add TEST_DATABASE_URL (a disposable database) to include the integration tests
```

If you changed anything visual, also run `scripts/visual-check.mjs` and look at the phone and tablet screenshots.

## Working rules

- A new component, helper, token, status or message goes in the **shared place**, then gets used. If it is genuinely new, add a row to the quick map in `docs/DESIGN_PRINCIPLES.md` in the same change.
- If a rule here gets in your way, change the rule (and the docs and the check) deliberately, in its own commit; do not work around it in a screen.
- Do not delete a file because it looks unused: some are loaded by convention (`route.ts`, `page.tsx`, `proxy.ts`, `src/app/uploads/[filename]`). Check how it is referenced first.
- Keep changes focused. Do not reformat or rewrite code you were not asked to touch.
<!-- END:neev-project-rules -->

