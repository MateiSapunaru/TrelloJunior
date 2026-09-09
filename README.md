# TrelloJunior

A Trello-style task/kanban board app, built as the target application for a layered
QA automation portfolio suite. The app itself (Express + MongoDB API, React
frontend, JWT auth with board ownership/collaborators) is the *means*; the point of
the project is the test automation built around it — functional API tests, E2E UI
tests, a consumer-driven contract test, and a narrow, explicitly-scoped security
test suite (IDOR, JWT tampering, rate limiting).

This README is written as we go, and documents *why* things are built the way they
are — not just how to run them — so every choice here can be defended, not just
demoed.

## Status

**Day 1 complete**: API, auth, board ownership, frontend.
**Day 2 complete**: Playwright E2E (POM structure, API-bootstrapped auth
fixture, cross-browser, visual regression), Pact contract test (auth
endpoints), and a security test suite (IDOR route sweep, JWT tampering,
email-keyed login rate limiting). **Day 3 not started** — see
[Roadmap](#roadmap). MongoDB runs via Docker Compose (`npm run mongo:up`),
pulled forward from Day 3 since Playwright and Pact both need a real,
persistent database to run against.

## Repo structure

```
packages/
  api/    Express + MongoDB backend (TypeScript)
  web/    React + TypeScript frontend (Vite)
```

An npm workspaces monorepo, not two separate repos: the app is one deployable unit
for the purposes of this project, and workspaces keep dependency management and
scripts simple without pulling in Lerna/Nx/Turborepo, which would be unjustifiable
tooling weight at this scale.

## Running it locally

Prerequisites: Node 24+, Docker Desktop.

```bash
npm install
npm run mongo:up                                     # starts MongoDB in Docker (:27017)
cp packages/api/.env.example packages/api/.env
cp packages/web/.env.example packages/web/.env
npm run dev -w packages/api                          # :4000
npm run dev -w packages/web                           # :5173
```

`packages/api/.env` and `packages/web/.env` are gitignored — they hold local dev
secrets/config, never committed. `npm run mongo:down` stops the container;
`docker-compose.yml` only defines MongoDB for now — containerizing the API/web
apps themselves is Day 3 scope, once there's a Dockerfile per app to write.

**Why Mongo got containerized now, ahead of the original Day 3 plan:** Playwright
(Day 2) drives the actual running app end-to-end — unlike Vitest, which imports
Express in-process and needs no real server — so it needs a real, stable MongoDB
to point at. A hand-rolled `mongodb-memory-server` script (what Day 1's browser
verification used, since it's throwaway and disposable) isn't something you can
rely on being up between sessions. A single-service `docker-compose.yml` is the
smallest real fix, and it's the same tool Day 3 was already committed to — not a
new dependency, just used a day earlier than planned.

## Design decisions

### Backend

**Express `app.ts` / `server.ts` split.** `app.ts` exports the Express app with zero
side effects on import — no DB connection, no `.listen()`. `server.ts` is the only
place that connects to Mongo and binds a port. This is what lets Supertest test
routes by importing `app` directly, without a real network listener or a live DB
connection for tests that don't need one (see `tests/health.test.ts`).

**Mongoose, not the native MongoDB driver.** Not strictly necessary, but it made
schema definition, validation, and population meaningfully less boilerplate-heavy
for a project this size — a deliberate trade rather than a default.

**bcryptjs, not bcrypt.** `bcrypt` needs native bindings (a compiler toolchain via
node-gyp); `bcryptjs` is a pure-JS reimplementation built specifically for
JS/TS apps, with no native-build friction — worth it on a Windows dev machine where
node-gyp is extra setup for no functional benefit here.

**JWT lives in an httpOnly cookie, not `localStorage`, and never appears in a JSON
response body.** `POST /auth/signup` and `POST /auth/login` set the token via
`Set-Cookie` (httpOnly, `sameSite: strict`, `secure` in production) and return only
the user profile in the body. Returning it in the body *in addition* to the cookie
would defeat the point — any script that can read a `fetch` response (legitimate
code or an XSS payload) has equal access to it either way, so the token would be
readable regardless of where the cookie lives. `sameSite: strict` is treated as
sufficient CSRF protection here specifically because this app has no cross-site
login redirect or third-party embed flow that strict mode would break.

One consequence: since client-side JS can never read an httpOnly cookie, the
frontend has no way to know "am I logged in" after a page reload just by inspecting
storage. `GET /auth/me` exists specifically to answer that question — it's not a
generic user-lookup endpoint, it's the session-restore mechanism.

**Authorization: 404 vs. 403 is deliberate, not inconsistent.** A user with *no*
relationship to a board (not owner, not collaborator) gets **404** on every
verb, including `GET` — they can't even confirm the board id is real, which is the
actual IDOR mitigation. A **collaborator** attempting an owner-only action (rename
board, delete board, manage collaborators) gets **403** — they already have read
access, so hiding that the board exists would be pointless and inconsistent. This
split is enforced centrally by two middleware (`loadBoard`, `loadList` in
`src/middleware/`) rather than repeated per-route, and it's regression-tested in
`tests/boards.test.ts`. It's also the direct precursor to the IDOR test suite
planned for Day 2 — the same threat model, proven at the functional level first.

**Collaborators can edit board *content*, not board *metadata*.** Any board member
(owner or collaborator) can create/edit/delete Lists and Cards — that's the entire
point of being a collaborator. Only the owner can rename the board, delete it, or
manage collaborators. Enforced identically for Lists and Cards via shared
`loadBoard`/`loadList` middleware, not duplicated per resource.

**Moving a card validates the target list belongs to the same board.** `PATCH
.../cards/:cardId` with a `listId` checks that the target list's `boardId` matches
the board in the URL (which the caller already has access to) before allowing the
move — otherwise a member of board A could reassign a card into a list that
actually belongs to board B.

**Cascade deletes.** Deleting a board deletes its Lists and Cards; deleting a List
deletes its Cards. Without this, deleted boards/lists would leave orphaned
documents referencing ids that no longer resolve to anything.

**List/Card `position` is a plain client-assigned integer — no server-side
reordering of siblings.** A production drag-and-drop board at scale would use
fractional/lexicographic positions to avoid rewriting every sibling's position on
every reorder. Explicitly not built here: it's real complexity that isn't the point
of this portfolio (test automation is), so it's called out as a known
simplification rather than hidden.

**Login is hardened against both user-enumeration and its timing side-channel.**
Wrong password and nonexistent email return the identical `401` and error message.
That alone isn't enough, though — `bcrypt.compare` takes measurably longer than a
DB miss, so skipping it for a nonexistent user would leak whether an email is
registered via response time. The fix: `login` always runs `bcrypt.compare`, against
a constant dummy hash when there's no matching user, so both cases cost the same.

### Frontend

**No state-management or data-fetching library** (no Redux/Zustand, no TanStack
Query). Four pages of mostly-server data don't need one; a plain `fetch` wrapper
(`src/api/client.ts`) and component state cover it without a dependency that would
need defending on its own merits.

**No component-testing library** (no React Testing Library). Deliberate, not an
oversight: Playwright (Day 2) is this project's UI test layer — real browser,
visual regression included. Adding component unit tests on top would be
test-pyramid duplication for an app this size; the API already has functional
coverage via Vitest+Supertest.

**No CSS/component framework** (no MUI/Chakra/Tailwind-as-a-library). Plain CSS
keeps the DOM structure predictable, which matters directly for Playwright: a
third-party component library's internal markup shifts between versions in ways
that make both locators and visual-regression snapshots flakier. This is a
testing-driven decision, not a styling preference.

**`data-testid` attributes on interactive elements from the start.** Cheap to add
while building each component, expensive to retrofit once Playwright POMs depend on
stable locators.

**Cards move via a "Move to…" `<select>`, not drag-and-drop.** No drag-and-drop
library to justify at this scale, it's keyboard-accessible, and it gives Playwright
a deterministic interaction to drive — simulated drag gestures are one of the
flakier things to automate reliably in browser test tools.

### End-to-end (Playwright)

**POM classes, not raw locators in tests.** One class per page
(`LoginPage`/`SignupPage`/`BoardsPage`/`BoardPage`), each exposing locators built
on `data-testid`s and action methods (`login()`, `addCard()`) rather than tests
touching selectors directly — one place to fix if markup changes.

**Locators match on a specific descendant (`filter({ has })`), not substring text
(`filter({ hasText })`).** `hasText` matches an element's *entire* text content,
including nested children — for a board column, that includes every card's "Move
to…" `<option>` labels, which are literally other lists' names. This caused a real
bug (see [Bugs found via testing](#bugs-found-via-testing) below): once a card
sat in "Doing" with "To Do" as its only other destination, its own dropdown
contained the text "To Do", making `listColumn("To Do")` match the wrong column.

**Auth fixture bootstraps a session via the API, not the signup UI.**
`fixtures/auth.fixture.ts` signs up a fresh, throwaway-per-test user directly
against the API; `context.request` shares its cookie jar with the browser
context, so the resulting httpOnly cookie authenticates the page with no UI
interaction. Standard "bypass the UI for setup, only exercise the UI for what
the test is actually about" practice — faster, and each test's data is isolated
by construction (a unique user), not by database reset between tests.

**Two rendering engines locally (Chromium + WebKit), not three.** Firefox's
Windows build needs the Microsoft Visual C++ Redistributable, not installed on
this dev machine; installing a system package wasn't something to do inside a
test-config decision. `playwright.config.ts` documents how to add it back.

**Visual regression baselines are Windows-generated and will need
regenerating on Linux CI** (Day 3) — font rendering differs enough between
operating systems that pixel-diff baselines aren't portable across them. This is
a known, general limitation of screenshot-based visual regression, not specific
to this setup.

### Contract testing (Pact)

**Local pact files, not a Pact Broker.** A real production Pact workflow
publishes contracts to a broker (versioning, webhook-triggered provider
verification, "can-i-deploy" gating). Running one is real infra/cost this
project doesn't need to demonstrate the core idea: `packages/web`'s consumer
test writes `packages/web/pacts/TrelloJuniorWeb-TrelloJuniorApi.json`, which is
committed to the repo, and `packages/api`'s provider verification reads that
same file by path. Same underlying mechanism (a written contract, checked from
both sides), without hosting anything.

**Only the auth endpoints are contracted (signup, login, session check) —
board/list/card endpoints deliberately aren't yet.** Those require an
authenticated session; contracting them needs Pact's provider-state and
`requestFilter` pattern to inject a real session cookie into the replayed
request (the pact file can't record a real one, since JWTs are signed
per-user). Left out of this first pass to keep it correct and understandable
rather than half-implemented — a natural next slice, not an oversight.

**Provider verification is a separate Vitest config
(`vitest.pact.config.mts`, run via `npm run test:pact`), not part of the main
suite.** Pact's `Verifier` makes real HTTP requests, so it needs the Express app
actually listening on a port — unlike the main suite, which imports `app`
in-process via Supertest and never binds one. The main config explicitly
excludes `tests/pact/**`, since Vitest's default file-discovery glob would
otherwise also pick up `*.pact.test.ts` there and run it under the wrong
assumptions (no server listening, no pact file passed to a `Verifier`).

### Security tests

This is a deliberately narrow, explicitly-scoped set of checks — not a general
"security testing" claim. Three things, matching what the ownership/collaborator
model and cookie-based auth actually create as surface area:

**IDOR via a table-driven route sweep, not a copy of the functional tests.**
`tests/security/idor.test.ts` enumerates all 13 board/list/card routes in one
table and confirms a user with zero relationship to a board gets 404 on every
one of them. The authorization checks already inline in
`boards`/`lists`/`cards.test.ts` prove each endpoint behaves correctly as part
of testing its normal CRUD behavior — this file's job is different: prove
*every* route enforces the rule, by enumerating them instead of trusting each
one was remembered individually when it was written.

**JWT tampering covers the token, not just "logged in or not."**
`tests/security/jwt-tampering.test.ts`: no cookie, a token forged with the
wrong signing secret, an expired token, a token whose payload was altered
after signing (signature no longer matches), a garbage string that isn't a JWT
at all, and — a regression check tied to the httpOnly-cookie migration — a
*valid* token sent via an `Authorization` header instead of the cookie is
still rejected, proving there's no leftover bearer-token fallback that would
partly undo the point of moving off `localStorage`.

**Login rate limiting is keyed by the attempted email, not the caller's IP.**
The threat this defends against is repeated password guesses against *one
account* — keying by email means that stays true no matter how many IPs the
attempt is spread across, which a naive per-IP limiter wouldn't catch. The
trade-off: it doesn't limit one IP spraying many different emails (account
enumeration), a different attack, out of scope for this pass. Keying by email
also solved a test-design problem for free: since `express-rate-limit`'s store
is shared process-wide and every test in this sequential suite hits the same
singleton Express app, an IP-keyed limiter would need a manual store-reset
hook to test the exact boundary (10 allowed, 11th blocked) without
interference from other files' login calls. Email-keyed, each test's distinct
email gets an independent bucket — no reset hook needed.

### Testing infrastructure

**`mongodb-memory-server` for API tests**, not a shared/Docker Mongo instance:
tests get an isolated, ephemeral database with no external service dependency.
E2E tests, by contrast, run against the real Docker-Composed MongoDB (`npm run
mongo:up`), since Playwright drives the actual running app rather than importing
it in-process. Pact provider verification reuses the same shared-mongod setup as
the main API suite, since its state handlers need a real database to seed.

## Bugs found via testing

### 1. Mongo test infra crash (backend)

While building out the List/Card test suite, the Vitest run started crashing with
`Mongod internal error (fassert() failure)` once the suite reached 5 test files.
The cause: the original setup started a **new real `mongod` process per test file**
(`beforeAll` in each file), and running 5 of them concurrently overloaded the
machine — not a flaky test, a genuine resource-exhaustion crash.

Fix: moved to Vitest's `globalSetup` (`tests/globalSetup.ts`) to start **one**
shared `mongod` instance for the entire run, with `fileParallelism: false` in
`vitest.config.mts` since all test files now share one database and can't safely
run concurrently against it (one file's `afterEach` collection-wipe would race
another file's in-progress test). At this suite's current size the sequential cost
is small; per-file databases within the one shared instance would be the next fix
if the suite grows large enough for that to matter.

### 2. Low-contrast error text from a CSS specificity collision (frontend)

While manually verifying the login page's error state in a real browser (checking
that a redesigned stylesheet hadn't broken anything), the "invalid credentials"
error rendered as barely-legible muted gray text on a pale pink background instead
of the intended red — an accessibility/contrast bug that unit-level or snapshot
testing wouldn't necessarily have caught, since the element was present with the
right text, just visually wrong.

Root cause: `.auth-page form > p` (meant to style the "Need an account? Sign up"
hint line) is a *structural* selector — it matches every direct-child `<p>` of the
form, which includes the error `<p role="alert">` too, since both are siblings
inside the same `<form>`. Its specificity (`0,1,2`) beat the alert's own
`[role="alert"]` rule (`0,1,0`), so the muted-gray hint-text color silently won.

Fix: gave the hint text an explicit `.auth-hint` class instead of relying on
`form > p` to distinguish it from other paragraphs in the form — a good reminder
that structural selectors scoped only by DOM position are fragile the moment a
sibling with different intent gets added.

### 3. A Playwright locator bug that looked exactly like an app bug (test code)

While writing the move-card-between-lists E2E test, `expect(listColumn("To
Do").getByTestId("card-item")).toHaveCount(0)` kept finding 1 card after a move
that should have emptied that list — consistently, not flakily, which made it look
like a real move-logic bug in the frontend.

It wasn't. `listColumn()`/`cardItem()` were built on
`getByTestId(...).filter({ hasText: title })`, and `hasText` substring-matches an
element's **entire text content**, not just its own label. Once the card actually
moved to "Doing", its own "Move to…" `<select>` now offers "To Do" as the only
remaining option — so the string "To Do" appears inside `<option>To Do</option>`,
which is part of the *"Doing"* column's text content. `listColumn("To Do")` was
therefore matching **both** columns, and the "leftover card in To Do" the
assertion kept finding was the same card, in "Doing", matched through its own
dropdown.

Confirmed the app was correct throughout before touching any test code: called
`PATCH .../cards/:id` directly and checked both lists' `GET` responses, which
showed the move had worked correctly server-side every time. That ruled out the
backend, then browser console logging in `handleCardMoved`/`handleCardCreated`
showed the frontend's React state was also transitioning correctly — which meant
the bug had to be in what the *test* was looking at, not what the app was doing.

Fix: match on a specific descendant (`filter({ has: <locator> })`, matching the
column's own `<h2>` heading or the card's own title element) instead of a loose
substring match against the whole subtree. `has` checks containment of one
specific element; `hasText` checks the text of everything inside, including
nested `<option>` labels that happen to be words the test is also searching for.

## Roadmap

- **Day 2 — done**: Playwright E2E suite (POM structure, cross-browser, visual
  regression); Pact consumer-driven contract test (auth endpoints only — see
  [Design decisions](#contract-testing-pact)); IDOR/JWT-tampering/rate-limit
  security tests added to the API suite (see
  [Design decisions](#security-tests)).
- **Day 3**: OWASP ZAP baseline scan wired into CI (results as a build artifact),
  GitHub Actions with parallel UI/API/contract/security jobs, Docker + Docker
  Compose for the app itself (MongoDB is already containerized — see
  [Running it locally](#running-it-locally)).
