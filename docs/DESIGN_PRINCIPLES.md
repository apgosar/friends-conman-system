# Neev CMS: design principles and where everything lives

This is the reference for how the app is built. It answers two questions: **"what is the rule?"** and **"which file do I use or change?"**

The short, enforced version of the rules is in [`AGENTS.md`](../AGENTS.md) (loaded automatically by Claude Code, and pointed to by the Copilot and Cursor rule files). This document is the long version, with the reasons and the file map. If you change a convention, change it here and in `AGENTS.md` in the same commit.

## Contents

1. [The one idea](#1-the-one-idea)
2. ["I need to…" quick map](#2-i-need-to-quick-map)
3. [User interface](#3-user-interface)
4. [Wording: errors, labels, formats](#4-wording-errors-labels-formats)
5. [API routes](#5-api-routes)
6. [Data, money and transactions](#6-data-money-and-transactions)
7. [Security and personal data](#7-security-and-personal-data)
8. [Documents, PDFs and messages](#8-documents-pdfs-and-messages)
9. [Tests and automatic enforcement](#9-tests-and-automatic-enforcement)
10. [Recipes: how to add…](#10-recipes-how-to-add)
11. [Directory map](#11-directory-map)
12. [Things that look reasonable and are not allowed](#12-things-that-look-reasonable-and-are-not-allowed)

---

## 1. The one idea

**Every kind of thing is implemented once, in one named place, and everything else uses it.**

One button, one modal, one error message list, one date formatter, one place that decides who may do what, one place that builds a document's data. When something looks or behaves differently on two screens, that is a bug in the structure, not a styling choice.

The cost of breaking this is paid later and in bulk: a hand-styled button here, a hand-written error message there, and one day a review finds 500 of them. That clean-up is what these rules exist to prevent.

---

## 2. "I need to…" quick map

| I need to… | Use | File |
|---|---|---|
| Show a button / link that looks like a button | `Button`, `ButtonLink` | `src/components/ui/Button.tsx` |
| Add a form field with label, hint and error | `TextField`, `SelectField`, `TextareaField`, `CheckboxField` (bare: `Input`, `Select`, `Textarea`) | `src/components/ui/Field.tsx` |
| Open a dialog | `Modal` | `src/components/ui/Modal.tsx` |
| Tell the user something worked or failed | `useToast()` | `src/components/ui/Toast.tsx` |
| Ask "are you sure?" | `useConfirm()` | `src/components/ui/Toast.tsx` |
| Show an inline message in a page or form | `Alert` | `src/components/ui/Alert.tsx` |
| Show a status (Booked, Paid, Failed…) | `StatusBadge kind="…"` | `src/components/ui/Badge.tsx`, labels/colours in `src/lib/status.ts` |
| Lay out a page | `PageHeader`, `Card`, `CardHeader`, `StatCard` | `src/components/ui/` |
| Show a table (stacks into cards on a phone) | `Table`, `Td label="…"`, `EmptyRow` | `src/components/ui/Table.tsx`, `EmptyState.tsx` |
| Filter chips / pagination / tabs / steps | `FilterChips`, `Pagination`, `Tabs`, `StepBar` | `src/components/ui/` |
| Show "page failed" / "not found" | `ErrorState` | `src/components/ui/ErrorState.tsx` |
| Call our own API from a screen | `fetchJson`, `jsonRequest`, `errorMessage` | `src/lib/client/api.ts` |
| Write a new API route | `route(permission, handler)` | `src/lib/route.ts` |
| Return an error from an API route | `apiError(kind, message?)`, `throw fail(kind, message?)` | `src/lib/api-error.ts`, `src/lib/errors.ts` |
| Word an error message | the house style in `src/lib/errors.ts` | `src/lib/errors.ts` |
| Format a date, number, rupees, "in words" | `formatDate`, `formatRupees`, … | `src/lib/format.ts` |
| Add or change a colour, spacing, font size, z-index | a token | `src/styles/tokens.css` |
| Add a style | a class | `src/styles/` (see §3.3) |
| Decide who may do something | `can(role, permission)` | `src/lib/authz.ts`, `src/lib/roles.ts` |
| Calculate with money | integer paise helpers | `src/lib/money.ts` |
| Charge GST, stamp duty, registration | `computeCharges(pricingFromProject(project), …)` | `src/lib/pricing.ts` |
| Write several rows that must succeed together | `transaction(async (tx) => …)` | `src/lib/db.ts` |
| Hide cancelled / deleted sales | `activeSale`, `notDeleted` | `src/lib/soft-delete.ts` |
| Number a sale or receipt | `nextSaleNumber`, `nextReceiptNumber` | `src/lib/numbering.ts` |
| Show or use a PAN / Aadhaar number | `maskedPan`, `maskedAadhaar`, `revealPii` | `src/lib/pii.ts` |
| Build the data for a document | `buildSalePayload` / `buildDemandPayload` / `buildReceiptPayload` | `src/lib/documents/payload.ts` |
| Turn HTML into a PDF | `renderHtmlToPdf` | `src/lib/pdf/renderer.ts` |
| Log something | `logger` | `src/lib/logger.ts` |
| Rate limit an endpoint | `rateLimit` helpers | `src/lib/rate-limit.ts` |
| Colour a chart | chart tokens and helpers | `src/lib/chart-theme.ts` |
| Pass database rows from a server page to a client component | `plain(rows)` | `src/lib/plain.ts` |

If the thing you need is not in this table, search `src/lib` and `src/components/ui` before writing it. If it truly does not exist, add it **there** (and add a row here), not inside the screen that first needed it.

---

## 3. User interface

### 3.1 Principles

- **One component per job.** Screens compose the kit in `src/components/ui/`; they never re-implement it. Import from `@/components/ui` (the barrel `index.ts`), not from individual files.
- **Same thing, same look.** A status, a money amount, a date or an empty table looks identical on every screen because it comes from the same function or component.
- **Phone and tablet are first-class.** Every screen is checked at 390 px (phone), 820 px (tablet) and 1440 px (desktop). No page may scroll sideways (wide tables scroll inside their own box).
- **Server first.** Pages are server components that load data directly. A file is a client component (`'use client'`) only when it needs state, effects or browser APIs. Client files never import the database or `lib/auth`.
- **Accessible by default.** The kit gives labels, `aria-*`, focus handling and keyboard support; a screen that bypasses the kit has to supply all of that itself, which is why bypassing is not allowed.

### 3.2 The UI kit (`src/components/ui/`)

| Component | What it is for | Notes |
|---|---|---|
| `Button`, `ButtonLink` | Every button and button-styled link | Variants `primary` `secondary` `ghost` `danger` `success`; sizes `xs`–`lg`; `loading` shows a spinner and blocks clicks; `type` defaults to `"button"` so it never submits a form by accident |
| `TextField`, `SelectField`, `TextareaField`, `CheckboxField` | A labelled form control | Connects label, hint and error for screen readers; `error` marks the field invalid |
| `Input`, `Select`, `Textarea` | A bare control | For use inside tables and toolbars |
| `Modal` | Every dialog | Portal, focus trap, Escape to close, scroll lock, becomes a bottom sheet on a phone. Put actions in `footer`; submit a form from the footer with `form="id"` |
| `FeedbackProvider`, `useToast`, `useConfirm` | Result messages and confirmations | Mounted once in `AppShell`. Replaces `alert()` and `confirm()` |
| `Alert` | Inline message (`danger` `warning` `info` `success`) | For things that should stay on the page; use toasts for "it worked/failed" after an action |
| `Badge`, `StatusBadge` | Pills | `StatusBadge` reads label and colour from `lib/status.ts`; kinds: `unit` `sale` `schedule` `comm` `document` `milestone` `kyc` `project` `projectType` |
| `Card`, `CardHeader` | A panel and its title row | `Card flush` has no padding (for a table that fills the card) |
| `PageHeader` | Page title, subtitle, actions, optional badges (`eyebrow`) | Stacks on a phone |
| `StatCard` | Headline number | `grid grid-stats` keeps them two across on a phone |
| `Table`, `Td`, `EmptyRow`, `EmptyState` | Tables | `Table stack` + `Td label="Column"` turns rows into cards on a phone; `label=""` for action cells |
| `Tabs`, `FilterChips`, `Pagination`, `StepBar` | Navigation inside a page | |
| `ErrorState`, `Spinner` | "Failed / not found" panel, loading indicator | |
| `cn` | Joins class names | |

Layout components (the app frame) are in `src/components/layout/`: `AppShell` (frame, toasts, mobile drawer), `Sidebar`, `TopNav`. The app frame is applied to everything under `src/app/(admin)/` by `src/app/(admin)/layout.tsx`.

### 3.3 CSS: one stylesheet, in layers

Entry point: `src/styles/globals.css`, imported once by `src/app/layout.tsx`. It imports, in this order:

| File | Holds | Rule of thumb |
|---|---|---|
| `src/styles/tokens.css` | Every colour, font, type size (`--text-*`), spacing step (`--space-*`), z-index (`--z-*`), tap size, transition, chart colour | **If a value is used more than once, it is a token.** Change the look here, nowhere else |
| `src/styles/base.css` | Element defaults: `html`, `body`, headings, links, form controls, 16 px inputs on touch | |
| `src/styles/layout.css` | The app frame: sidebar, top bar, page content area, page header | |
| `src/styles/components.css` | Everything that belongs to a component or pattern: buttons, forms, modal, table, badge, alert, toast, tabs, kv-list, step chips, stepper, error state, auth pages… | New component styles go here, under a comment |
| `src/styles/building.css` | The 3D building view, unit table and unit panel (`bv-*` classes) | Feature-specific styles get their own file, imported in `globals.css` |
| `src/styles/utilities.css` | Single-purpose helpers: `flex`, `grid grid-2/3/4/auto/side/stats`, `gap-1…10`, `m*`/`p*` spacing on a 4 px scale, `text-*` size and colour, `font-*`, `truncate`, `border-top`, column widths `col-xs…lg`, `mono`… | Check here before writing a new class |
| `src/styles/responsive.css` | **All** media queries for the shared layout: breakpoints, tablet icon rail, phone drawer, bottom-sheet modal, stacked tables, 44 px touch targets, 16 px inputs | Breakpoints are repeated here as numbers (CSS cannot read variables inside `@media`); change them only here |

**Breakpoints:** `1100px` (tablet: sidebar becomes an icon rail, 4-column grids become 2), `768px` (phone/tablet portrait: drawer navigation, grids go to one column, modals become sheets), `640px` (small phone). Touch devices (`pointer: coarse`) get 44 px targets and 16 px inputs.

**Rules**

- No inline `style={{ … }}` with fixed values. Use a class. An inline style is allowed only for a value computed while rendering (a width from a percentage, a colour from data, a CSS custom property such as `--tint-top`). ESLint enforces this.
- No hex or `rgb()` colours in components. Use `var(--token)`. (The one exception is the browser theme colour in `src/app/layout.tsx`.) ESLint enforces this.
- No `<style>` / styled-jsx blocks in components. Put CSS in `src/styles`.
- Do not change the look of a shared component for one screen. Add a variant or a prop to the component, or a class that composes with it.
- Fonts are self-hosted (`@fontsource-variable/inter`, `@fontsource-variable/plus-jakarta-sans`, imported in `src/app/layout.tsx`). Nothing is loaded from Google, which also keeps the Content-Security-Policy tight.
- Charts (recharts) take colours from `src/lib/chart-theme.ts` (`CHART_COLORS`, `AGING_TONE_COLOR`, tooltip styles), which point at the `--chart-*` tokens.

### 3.4 Responsive checklist (every new screen)

1. Use `PageHeader`, `Card`, `Table stack` and the grid utilities: they already collapse correctly.
2. Give every `Td` a `label`.
3. Never set a fixed pixel width on something that holds user content.
4. Run the visual check (§9) and look at the phone and tablet screenshots, not only the overflow report.

---

## 4. Wording: errors, labels, formats

### 4.1 Error messages

All error wording lives in **`src/lib/errors.ts`**:

- `ERROR_KINDS`: one standard message and HTTP status per kind of failure: `unauthorized` (401), `forbidden` (403), `invalid` (400), `notFound` (404), `conflict` (409), `tooManyRequests` (429), `server` (500), `unavailable` (503).
- `notFoundMessage('Sale')` gives "Sale not found". `plural(n, 'unit')` gives "1 unit" / "3 units".
- `kindForStatus(status)` maps a status back to a kind. `fail(kind, message?)` creates an error you `throw` inside a `route()` handler.

**House style for any message a person can read** (API responses, toasts, form errors, empty states):

- Plain words, sentence case: "Choose a unit", not "unitId required".
- Say what to do, not what the code complained about.
- No full stop at the end. (`apiError` strips a trailing one, so the API cannot drift.)
- Never include internals: SQL, stack traces, file paths, field names, `err.message` of an unexpected error.
- Specific, business-rule messages (for example "This unit was just booked by someone else. Choose another unit") are fine and encouraged; write them at the place that knows the reason, and pass them through `apiError(kind, message)` or `throw fail(kind, message)`.

### 4.2 How an error travels

```
route handler throws / returns          → apiError(kind, message)      src/lib/api-error.ts   (body is always { error: string, … })
unexpected exception in route()         → apiServerError(err, context) logs it, answers with the generic server message
browser: fetchJson()                    → throws ApiError(message)      src/lib/client/api.ts  (also covers "could not reach the server")
screen: catch (err)                     → toast.error(errorMessage(err)) or <Alert>{errorMessage(err)}</Alert>
a whole page crashes                    → src/app/(admin)/error.tsx, src/app/error.tsx, src/app/global-error.tsx
a record does not exist                 → notFound() → src/app/(admin)/not-found.tsx
```

Validation messages come from the schema itself (zod), worded for people: `z.string().min(1, 'Enter a name')`. A bare type error is turned into "Amount is not valid" / "Schedule id is required" by `firstMessage` in `src/lib/validate.ts`.

### 4.3 Status labels and colours

`src/lib/status.ts` is the only place that says what a status is called and which colour its badge is: `SALE_STATUS`, `UNIT_STATUS`, `SCHEDULE_STATUS`, `COMM_STATUS`, `DOCUMENT_STATUS`, `MILESTONE_STATUS`, `KYC_STATUS`, `PROJECT_STATUS`, `PROJECT_TYPE`, `PAYMENT_MODES`, plus the 3D building colours (`UNIT_COLORS`, `UNIT_COLOR_LEGEND`) and helpers (`isUnsold`, `isSaleable`, `OUTSTANDING_SCHEDULE_STATUSES`…). Screens render `<StatusBadge kind="sale" status={…} />`; they do not map statuses to words or colours themselves. To add a status, add it to the registry.

Other shared vocabularies: roles (`src/lib/roles.ts`), inquiry sources and lost reasons (`src/lib/inquiry-constants.ts`), document types (`src/lib/template-constants.ts`), unit categories and wing labels (`src/lib/building-structure.ts`).

### 4.4 Formatting

`src/lib/format.ts` is the only place that formats: `formatDate` (dd/mm/yyyy), `formatDateTime`, `formatDateShort`, `formatMonthYear`, `formatNumber`, `formatMoney`, `formatRupees`, `formatCurrency` (Indian digit grouping), `numberToWords`. Do not call `toLocaleString`, `toLocaleDateString` or `Intl.*` anywhere else (a test enforces this). For chart axes use `formatRupeesCompact` in `src/lib/chart-theme.ts`.

---

## 5. API routes

All routes live in `src/app/api/**/route.ts`.

- **Every route checks who is calling.** Use `route(permission, handler)` from `src/lib/route.ts`, or `requireRole(permission)` from `src/lib/guard.ts` in routes with their own shape. Permissions are `any` (signed in), `staff`, `admin`, `superadmin`; the table of who has which is `PERMISSIONS` in `src/lib/authz.ts`, together with which **pages** each role may open (`PAGE_RULES`, enforced by `src/proxy.ts`). Never compare a role name by hand; use `can(role, permission)`.
- **Public on purpose:** `api/auth/*`, `api/health`, `api/cron/*` (cron secret), `/uploads/[filename]` (unguessable file names WhatsApp needs to fetch), and the document preview endpoints when called with the internal token (`src/lib/internal-auth.ts`).
- **`route()` does the boilerplate:** permission check, awaited `params`, `body(schema)` (JSON parsed and validated with zod, bad input becomes a 400 with the first problem and per-field details), and one error mapping (`HttpError` → its kind, a domain error with a `status` such as `SaleError` / `PaymentError` → that status, Prisma "not found" → 404, anything else → logged and a generic 500). A handler contains only what the route does.
- **Errors:** only through `apiError` / `fail` (see §4). Never `Response.json({ error: … })`, never `err.message` or a stack trace in a response.
- **Input:** validate with zod (`src/lib/validate.ts` re-exports `z` and `parseBody`). Money, ids and enums are checked before they reach the database.
- **Response shape:** success is `{ success: true, data }` (or the resource), failure is `{ error: string }`. Screens read errors only through `fetchJson`.
- **Rate limits** on endpoints that cost money or can be guessed at (login, password change, KYC extraction, upload, payments): `src/lib/rate-limit.ts`, stored in the database so they hold across instances.
- **Next.js 16 differences:** `params` and `searchParams` are promises (`await props.params`; page props are typed with the generated `PageProps<'/route'>`); the old `middleware` file is `src/proxy.ts`; error boundaries receive `unstable_retry`. When unsure, read `node_modules/next/dist/docs/` first.

---

## 6. Data, money and transactions

- **Schema and migrations.** `prisma/schema.prisma` is the schema; every change needs a migration in `prisma/migrations/` (`npx prisma migrate dev --name what_changed`). CI applies all migrations to an empty database and fails if the result differs from `schema.prisma`. Never edit a migration that has shipped; add a new one. The migration test (`tests/migration-upgrade.int.test.ts`) upgrades a database made by the old `db push` workflow.
- **Money is exact.** Columns are `NUMERIC(15,2)`; `src/lib/money-extension.ts` hands them to the app as plain numbers. Any arithmetic that decides who owes what goes through `src/lib/money.ts` (integer paise: `toPaise`, `round2`, `sumRupees`, `percentOf`), never raw floating point. Aggregates (`_sum`) bypass the extension and return `Decimal`; wrap them in `Number(…)`.
- **Tax and charges are per project.** GST, stamp duty, registration and TDS rates are columns on `Project`; `src/lib/pricing.ts` (`pricingFromProject`, `computeCharges`, `gstOn`) is the only calculator, used by the sale form, quotes and the sale creator. Do not hard-code 5 % or 6 %. Settings are validated by `src/lib/pricing-settings.ts`.
- **Transactions.** Several writes that must succeed together use `transaction(async (tx) => …)` from `src/lib/db.ts`, **never** `prisma.$transaction(async …)`. It writes the audit entries inside the same transaction. (The raw form held one connection while the audit write asked for another, which deadlocked the pool under load; a test enforces this.) Inside a transaction use `tx`, not the global `prisma`.
- **Audit trail.** Writes to `Sale`, `Payment`, `Buyer`, `Document`, `KycDocument` and `Project` are audited automatically by `src/lib/prisma-extension.ts`, with PAN, Aadhaar and secrets masked by `src/lib/redact.ts`. Add a manual entry with `createAuditLog` (`src/lib/audit.ts`) only for business events the extension cannot see (for example "stern reminder approved").
- **Deleting.** Sales, payments and documents are soft-deleted via `softDelete.*` (`src/lib/soft-delete.ts`). **Every query that lists or counts sales uses `where: { sale: activeSale }` / `activeSale`**, so cancelled and deleted sales never leak into dashboards, receivables or exports.
- **One live sale per unit** is enforced by a partial unique index in the database, and `src/lib/sales/create-sale.ts` locks the unit row before checking. Sale and receipt numbers come from `number_sequences` (`src/lib/numbering.ts`): gap-free, concurrency-safe, no `max()+1`.
- **Sale status** is derived, not typed: `src/lib/sale-lifecycle.ts` (`deriveSaleStatus`, `syncSaleLifecycle`) from dates and payments.
- **Server to client.** Rows from the money-converting client carry a hidden symbol React refuses to serialise; pass them to a client component through `plain(rows)` (`src/lib/plain.ts`).
- **Counting and paging.** A list that can grow without bound is paginated on the server (see the audit and communications APIs). Do not `findMany()` everything into a table.

---

## 7. Security and personal data

- **Sessions.** `src/lib/auth.ts` (NextAuth, JWT). A token carries a `tokenVersion`; changing a password, role or active flag bumps it and every open session ends (`src/lib/session-token.ts`). Passwords: rules in `src/lib/password-rules.ts` (shown to users from the same constant), hashing in `src/lib/password.ts`. Login is rate limited.
- **PAN and Aadhaar** are encrypted at rest (AES-256-GCM, `PII_ENCRYPTION_KEY`) by a Prisma extension, so a database copy or backup shows `enc:v1:…`. Screens call `maskedPan` / `maskedAadhaar`; only document generation calls `revealPii`. Never select these columns into a response, a log line or a report. Details and the conversion script: `src/lib/pii.ts`, `src/lib/pii-migration.ts`, `scripts/encrypt-pii.ts` (`npm run db:encrypt-pii`).
- **Erasure on request** (DPDP Act): `src/lib/dpdp-compliance.ts`, reachable by a Super Admin from the sale page and `POST /api/buyers/[id]/anonymize`. It keeps the sale and payments, removes the person.
- **Escape everything that becomes HTML.** `src/lib/html-escape.ts` (`escapeHtml`), used by the template engine, the email builder and the quote PDF. Text typed by a user must never be concatenated into HTML unescaped.
- **PDFs** are produced only by `src/lib/pdf/renderer.ts`: one shared Chromium, at most three pages at once, JavaScript off, and only `data:` URLs and public `https` images, fonts and styles may load (never `file://`, `http://` or an internal address). Do not launch Puppeteer anywhere else.
- **Outgoing documents and messages** fetch attachments only from this app's own origin and send the internal token only there (`src/lib/comms-content.ts`, `src/lib/comms-dispatcher.ts`).
- **Uploads** are checked for type and size (`src/app/api/upload/route.ts`, `src/lib/template-validation.ts`, `src/lib/floor-plan.ts`) and stored through `src/lib/storage` (GCS, S3/MinIO or local disk; one interface, `src/lib/storage/types.ts`). Files are served through `/api/files/[...path]` behind login.
- **Headers and CSP** are set in `next.config.ts`. Fonts are self-hosted so the policy has no third-party font hosts; the API sends no CORS headers (it is called only by this app's own pages).
- **Secrets** are read from the environment; the full list with explanations is `.env.example`, validated at startup by `src/lib/env.ts`. Production refuses to start without `PII_ENCRYPTION_KEY`.
- **Logging** goes through `src/lib/logger.ts` (pino). No `console.*` in application code (ESLint). Never log message bodies, phone numbers in full, tokens or ID numbers.

---

## 8. Documents, PDFs and messages

- **Document data is built once**, in `src/lib/documents/payload.ts`, for sale agreements, demand letters and receipts. If a template needs a new `{{tag}}`: add it to the payload builder **and** to the catalogue in `src/lib/template-tags.ts` (that catalogue drives the "available tags" panel and the warnings when a template uses an unknown tag).
- **Loading** the sale and its relations: `src/lib/documents/queries.ts`. **Rendering** (Word templates filled with `docxtemplater`, HTML templates to PDF, sandboxed HTML preview): `src/lib/documents/render.ts`.
- **Routes:** `POST /api/documents/generate` (store a document on a sale), `GET /api/documents/preview/demand-letter` and `/receipt` (what the dispatcher and the preview page fetch).
- **Templates** are per project and per type; one is active at a time (`src/app/(admin)/projects/[id]/templates/`).
- **Messages** (email, WhatsApp) are rows in `communication_logs`, built by `buildCommContent` (`src/lib/comms-content.ts`) with structured attachments. `src/lib/comms-dispatcher.ts` sends them: workers claim one message at a time with `FOR UPDATE SKIP LOCKED`, at most three at once, a message that failed three times waits for a manual retry, and one whose worker died is put back after ten minutes. Email transport: `src/lib/email.ts`; WhatsApp: `src/lib/whatsapp.ts`.
- **Scheduled work:** `GET`/`POST /api/cron/daily` (secret-protected) runs `src/lib/scheduler.ts` (interest, overdue status, escalations).

---

## 9. Tests and automatic enforcement

Run these before you consider a change finished (the same checks run in CI, `.github/workflows/ci.yml`):

```powershell
npx tsc --noEmit        # types
npm run lint:ci         # ESLint; the warning count must not go up (see package.json)
npm test                # unit tests; integration tests need a database:
$env:TEST_DATABASE_URL = "postgresql://postgres:<password>@localhost:5432/neev_test?connection_limit=5"
npm run test:db         # integration tests (empties that database's tables, use a disposable one)
```

CI runs the tests with `connection_limit=5` on purpose: a small pool exposes code that holds one connection while waiting for another.

| What | Where | Enforces |
|---|---|---|
| ESLint rules | `eslint.config.mjs` | no `alert`/`confirm`, no `console`, no fixed inline styles, no hex colours in components, the Next.js and TypeScript defaults. `lint:ci` has a **warning ceiling** (`--max-warnings N` in `package.json`): never raise it, lower it when you fix warnings |
| API conventions | `tests/api-conventions.test.ts` | every route uses `apiError`/`route()`, never leaks `err.message`/stack, and checks the caller |
| UI and shared-helper conventions | `tests/ui-conventions.test.ts` | no raw `fetch` in screens, no `<style>` blocks, no database import in components, no hand-built overlays, formatting only in `format.ts`, transactions only via `transaction()`, role names only via `roles`/`authz`, no raw PAN/Aadhaar on screens |
| Route wrapper and error vocabulary | `tests/route.test.ts` | permission, validation, error mapping |
| Money, pricing, numbering, payments, sales | `tests/money*.test.ts`, `pricing-*.test.ts`, `payments.int.test.ts`, `sales.int.test.ts` | exactness, concurrency, one live sale per unit |
| Documents, PDFs, messages | `tests/documents-payload.test.ts`, `pdf-renderer.test.ts`, `dispatcher.int.test.ts`, `comms-content.test.ts` | |
| Personal data | `tests/pii.test.ts`, `pii.int.test.ts`, `dpdp.int.test.ts` | encryption, masking, erasure |
| Migrations | `tests/migration-upgrade.int.test.ts` + CI schema-drift check | the committed migrations give exactly `schema.prisma` and upgrade an old database |

**Looking at the screens:** `scripts/visual-check.mjs` signs in, opens a list of pages at phone, tablet and desktop size, saves screenshots and reports sideways overflow and console errors. Usage is in the file's header. It needs a running app and a Chromium (`CHROMIUM_PATH`).

**Test helpers:** `tests/helpers/db.ts` (`describeDb`, `resetDb`, `seedProject`), `tests/helpers/global-setup.ts` (applies the migrations to the test database).

---

## 10. Recipes: how to add…

**A screen.** Create `src/app/(admin)/<name>/page.tsx` (server component). Start from `TopNav` + `PageHeader`, put content in `Card`s, lists in `Table stack` with labelled `Td`s, empty states in `EmptyRow`/`EmptyState`. Add it to the sidebar in `src/components/layout/Sidebar.tsx` and, if it needs more than "signed in", a rule in `PAGE_RULES` in `src/lib/authz.ts`. Add its path to the visual-check list and run it.

**A form that saves.** Client component using `TextField` etc. Submit with `fetchJson(url, jsonRequest('POST', body))` inside `try/catch`; on success `toast.success(...)` and `router.refresh()` (or navigate); on failure `toast.error(errorMessage(err))` or an `<Alert>` for a form-level message. Use `Button loading={busy}`.

**A confirm-before-delete button.** `const confirm = useConfirm()` then `if (!(await confirm({ title, message, confirmLabel, danger: true }))) return`. See `src/components/sales/DeleteSaleButton.tsx`.

**A dialog.** `{open && <Modal title="…" onClose={…} footer={<>…</>}>…</Modal>}`. See `src/components/projects/CopyTemplateButton.tsx` for a small one.

**An API route.**
```ts
export const POST = route<{ id: string }>('admin', async ({ params, user, body }) => {
  const input = await body(schema)                          // 400 with a readable message if invalid
  const row = await prisma.thing.findUnique({ where: { id: params.id } })
  if (!row) throw fail('notFound', 'Thing not found')
  const saved = await transaction(async (tx) => { /* writes */ })
  return Response.json({ success: true, data: saved })
})
```
Then add the matching client call with `fetchJson`. `tests/api-conventions.test.ts` will fail if you skip the permission check or hand-write an error body.

**A status or label.** Add it to the registry in `src/lib/status.ts` (and the `StatusBadge` kinds in `src/components/ui/Badge.tsx` if it is a new kind). Do not switch on status strings in a screen.

**A colour, size or spacing.** Add a token to `src/styles/tokens.css`, then a class that uses it in `components.css` (or `utilities.css` if it is a single-purpose helper). Never a literal in a component.

**A new feature stylesheet.** Create `src/styles/<feature>.css`, import it in `src/styles/globals.css` between `components.css` and `utilities.css`, and put its phone/tablet rules next to it.

**A database change.** Edit `prisma/schema.prisma`, run `npx prisma migrate dev --name …`, commit the migration, keep `CHECK` constraints and indexes in the SQL. If existing rows need converting, write an idempotent script in `scripts/` and register it in the `Dockerfile` as the next `NNN-…` data migration (the on-prem updater runs these once per server).

**An environment variable.** Add it to `.env.example`, `.env.production.example` and `deploy/onprem/.env.onprem.example`, and to `src/lib/env.ts` if the app cannot work without it.

**A document tag.** `src/lib/documents/payload.ts` + `src/lib/template-tags.ts` (+ a case in `tests/documents-payload.test.ts`).

---

## 11. Directory map

```
src/
  app/
    layout.tsx               root layout: fonts, global CSS, viewport
    error.tsx, global-error.tsx, not-found.tsx
    login/, license-expired/ signed-out pages (use .auth-* classes)
    (admin)/                 everything behind login, inside the app frame
      layout.tsx             AppShell (sidebar, top bar, toasts)
      error.tsx, loading.tsx, not-found.tsx
      dashboard/ projects/ sales/ payments/ receivables/ escalations/ reports/
      communications/ users/ audit/ settings/ account/ documents/preview/
    api/                     route.ts files (see §5)
    uploads/[filename]/      public, unguessable copies of files WhatsApp must fetch
  components/
    ui/                      THE KIT (§3.2): never put screen-specific code here
    layout/                  AppShell, Sidebar, TopNav
    projects/ sales/ structure/ comms/ dashboard/
                             screen-specific components, built from the kit
  lib/
    errors.ts api-error.ts route.ts guard.ts validate.ts       errors, routes, validation
    client/api.ts            fetchJson for screens
    authz.ts roles.ts auth.ts session-token.ts password*.ts    who may do what, sessions
    format.ts status.ts chart-theme.ts                          wording and presentation
    money.ts money-extension.ts pricing.ts pricing-settings.ts numbering.ts interest.ts
    db.ts prisma-extension.ts soft-delete.ts audit.ts redact.ts sale-lifecycle.ts
    pii.ts pii-mask.ts pii-migration.ts dpdp-compliance.ts      personal data
    documents/ pdf/ pdf.ts pdf-generator.ts docx*.ts template-*.ts html-escape.ts
    comms-content.ts comms-dispatcher.ts email.ts whatsapp.ts scheduler.ts
    storage/                 file storage adapters
    license/                 on-prem licence check
    env.ts logger.ts rate-limit.ts internal-auth.ts deployment-config.ts version.ts plain.ts
  styles/                    the stylesheet (§3.3)
  proxy.ts                   page access, licence gate, auth redirect
prisma/                      schema.prisma, migrations/, seed.ts
scripts/                     one-off and tooling scripts (visual-check, encrypt-pii, migrations of data)
tests/                       vitest (unit and integration), helpers/
deploy/ Dockerfile docker-compose.yml deploy-cloudrun.ps1 DEPLOYMENT_*.md   deployment
.github/workflows/           CI and deploy
docs/                        this file
AGENTS.md CLAUDE.md          rules for AI coding tools (CLAUDE.md imports AGENTS.md)
```

---

## 12. Things that look reasonable and are not allowed

| Tempting | Why not | Instead |
|---|---|---|
| `<button className="btn …">` / `<input className="form-input">` in a screen | Bypasses loading state, type default, labelling | `Button`, `TextField` |
| `style={{ padding: 12, color: '#999' }}` | Cannot change centrally, breaks on phone | a utility class or a new class + token |
| `alert('Saved')`, `window.confirm(...)` | Not styled, blocks, not testable | `useToast`, `useConfirm` |
| `const res = await fetch(...); const json = await res.json(); if (!res.ok) …` | Each copy words errors differently | `fetchJson` |
| `return Response.json({ error: 'Not allowed' }, { status: 403 })` | Wording drifts | `apiError('forbidden')` / `route()` |
| `catch (e) { return Response.json({ error: e.message }) }` | Leaks internals | let `route()` handle it, or `apiServerError` |
| `new Date(x).toLocaleDateString(...)`, `toFixed(2)` on money | Different formats on different screens | `format.ts` |
| `if (role === 'ADMIN' \|\| role === 'SUPER_ADMIN')` | Policy copied into screens; menu and API disagree | `can(role, 'admin')` |
| `sale.agreementValue * 0.05` | Floats, hard-coded rate | `money.ts`, `pricing.ts` |
| `prisma.sale.findMany()` without `activeSale` | Cancelled sales appear in totals | `where: { …, sale: activeSale }` |
| `prisma.$transaction(async tx => …)` | Pool deadlock, audit outside the transaction | `transaction(...)` |
| `{buyer.panNumber}` on a screen | Prints ciphertext (or, if old, a real ID number) | `maskedPan(buyer.panNumber)` |
| `puppeteer.launch()` | A browser per PDF, no sandboxing of the page | `renderHtmlToPdf` |
| `` `<p>${customer.name}</p>` `` in HTML that is emailed or printed | HTML injection | `escapeHtml` |
| New status string compared in a screen | Labels and colours drift | `status.ts` registry |
| A colour/size literal "just this once" | It is never just once | token |
| Raising the lint warning ceiling to get CI green | The ceiling only goes down | fix the warning |
| Editing a shipped migration | Databases already ran it | new migration |
| Adding a package for something `lib/` already does | Two ways to do one thing | use the existing helper; if it is lacking, extend it |
| Deleting a file because it "looks unused" | Some are loaded by convention (`route.ts`, `page.tsx`, `proxy.ts`, `uploads/[filename]`) | check how it is referenced first |
