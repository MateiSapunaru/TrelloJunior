# TrelloJunior

[![CI](https://github.com/MateiSapunaru/TrelloJunior/actions/workflows/ci.yml/badge.svg)](https://github.com/MateiSapunaru/TrelloJunior/actions/workflows/ci.yml)

A Trello-style kanban board app, built as the target application for a layered QA
automation portfolio. The app itself (Express + MongoDB API, React frontend, JWT
auth with board ownership/collaborators) is the *means*; the point of this repo is
the test automation built around it — 49 API-level tests, a 27-scenario
cross-browser E2E suite with visual regression, a consumer-driven contract test,
a narrow security test suite (IDOR, JWT tampering, rate limiting), and a DAST
scan wired into CI.

This README documents *why* things are built the way they are, not just how to
run them, and is written to be defended in an interview, not just skimmed. If a
decision looks arguable, the reasoning for it is somewhere below — not left
implicit.

## Contents

- [Testing strategy](#testing-strategy)
- [Test suite reference](#test-suite-reference)
- [Status](#status)
- [Repo structure](#repo-structure)
- [Running it locally](#running-it-locally)
- [Running the tests](#running-the-tests)
- [Design decisions](#design-decisions)
- [Bugs found via testing](#bugs-found-via-testing)
- [Roadmap](#roadmap)

## Testing strategy

The app is intentionally small — a handful of resources, one auth model. The
test automation around it isn't small because the app is complex; it's built at
this depth to demonstrate how a QA engineer would actually approach a real
system: layered by cost and confidence, risk-based rather than exhaustive, and
proven — not asserted — with real, documented bugs each layer caught.

### The pyramid, and why each layer is shaped the way it is

| Layer | Tool | Speed | What it actually catches |
| --- | --- | --- | --- |
| Functional / API | Vitest + Supertest | ~20s for 49 tests, no browser, no network | Business logic, authorization rules, validation — the foundation, run in-process against the real Express app |
| Contract | Pact | ~1s consumer, ~4s provider | The frontend and backend silently drifting apart — a response shape neither side's own tests would catch changing, because each side only tests itself |
| End-to-end | Playwright | ~8s locally (2 engines), ~25s in CI (3 engines) | Whether a real user, in a real browser, can actually complete a real journey — the API being "correct" doesn't guarantee the UI wires it up right |
| Security (functional) | Vitest + Supertest | Same suite as functional, seconds | IDOR, JWT forgery/tampering, brute-force — attacker-shaped requests, not user-shaped ones |
| Security (DAST) | OWASP ZAP | ~1.5 min in CI | What only a *running* app reveals — response headers, real HTTP behavior — that no amount of unit-level assertion would surface |

This is a standard pyramid shape for a reason: the API layer is fast and cheap
enough to run dozens of times and assert business logic precisely, so most of
the volume lives there (49 of the repo's ~85 automated checks). E2E is
slower and more expensive to write and maintain, so it's reserved for what only
a real browser can prove — a handful of complete journeys, not every
permutation the API layer already covers. Security testing is split the same
way: functional-level security tests (fast, precise, run on every push) plus a
DAST scan (slower, broader, catches an entirely different class of issue) —
neither replaces the other.

### Risk-based, not a generic checklist

The security tests exist because of *this app's* actual attack surface, not
because "IDOR/JWT/rate-limiting" is a standard list to tick off:

- This app's core feature is **shared ownership** (boards have an owner and
  collaborators) — so the biggest risk is a user reaching data they don't own.
  That's why IDOR gets a dedicated, systematic route sweep (see below), not
  just a couple of spot checks.
- Auth is **JWT-in-an-httpOnly-cookie** — so the risks that matter are token
  forgery, tampering, and expiry, and specifically whether the httpOnly-cookie
  migration actually closed off the old bearer-token path (it did — there's a
  regression test for exactly that).
- The one endpoint that's meaningfully **brute-forceable** is login — so
  that's the one endpoint with rate limiting and a test proving the exact
  boundary, not a blanket rate limiter applied everywhere "just in case."

### Defense in depth: authorization is tested at three different altitudes

The same rule — "you can't touch a board you have no relationship to" — is
verified three separate ways, deliberately, because each layer would catch a
different way that rule could break:

1. **Inline in the functional tests** (`boards.test.ts`, `lists.test.ts`,
   `cards.test.ts`) — does *this specific endpoint* behave correctly, as part
   of proving its normal CRUD behavior end to end (right status code, right
   body, right side effects).
2. **A systematic sweep** (`tests/security/idor.test.ts`) — does *every*
   board/list/card route enforce it, by enumerating all 13 of them in one
   table instead of trusting each one was remembered individually when it was
   written. This is the layer that would catch "someone added a 14th route
   and forgot the auth middleware" — a class of bug the inline tests
   structurally can't catch, since they only know about the routes someone
   thought to write a test for.
3. **A real browser** (`tests/e2e/auth.spec.ts`) — does a user who isn't
   logged in actually get redirected, and does a logged-out session actually
   lose access after logout — proving the *whole stack* (React Router guard →
   fetch with cookie → Express middleware → Mongo query) behaves correctly
   together, not just each piece in isolation.

### Test hygiene: independence and isolation

Every test — API, security, contract, E2E — creates its own fresh data (a
uniquely-emailed user, sometimes a board/list/card built from that user) rather
than relying on seeded fixtures or a fixed test account. Two consequences worth
calling out explicitly, because they're the kind of thing that's easy to get
wrong and expensive to debug later:

- **No test depends on run order or another test's leftover state.** The API
  suite still resets the database between tests (`afterEach` in
  `tests/setup.ts`) as a second layer of isolation, but the *design* doesn't
  rely on that reset to be correct — each test would still be independent
  without it.
- **The login rate-limit test needed this reasoning explicitly** — see
  [Security tests](#security-tests) below for why keying the limiter by email
  rather than IP was the design choice that made "verify the exact boundary
  (10 allowed, 11th blocked)" possible without a manual reset hook, in a
  suite where every test shares one process and one Express app instance.

### Evidence, not a claim

None of the above is theoretical. [Bugs found via testing](#bugs-found-via-testing)
documents six real, specific bugs this test suite caught — a Mongo test-infra
crash, an accessibility contrast bug, a Playwright locator bug, an IPv6
rate-limiter validation failure that only surfaced in a production build, a
WebKit-specific session bug that only surfaced against a real container, and
real missing-security-headers findings from the ZAP scan that got fixed, not
just logged. Each one includes the actual root cause and the actual fix — the
kind of debugging trail an interviewer can ask follow-up questions about.

## Test suite reference

What's actually being verified, layer by layer. Every test title below is the
literal test name in the repo — nothing paraphrased or rounded up.

### API functional tests — `packages/api/tests/*.test.ts` (25 tests)

Vitest + Supertest, importing the Express app in-process (no real network
listener) against a throwaway `mongodb-memory-server` instance.

<details>
<summary><strong>auth.test.ts</strong> — 7 tests: signup, login, session check, logout</summary>

- `POST /auth/signup`
  - creates a user and sets an auth cookie that `/auth/me` accepts
  - rejects a duplicate email
  - rejects a password under the minimum length
- `POST /auth/login`
  - logs in, and the resulting cookie authenticates subsequent requests
  - returns the same error for a wrong password and a nonexistent user
    (user-enumeration resistance — see [Design decisions](#backend))
- `GET /auth/me`
  - returns 401 when there is no auth cookie
- `POST /auth/logout`
  - clears the auth cookie so `/auth/me` stops working afterward

</details>

<details>
<summary><strong>boards.test.ts</strong> — 8 tests: ownership, collaborators, the 404-vs-403 split</summary>

- rejects unauthenticated requests
- lets the owner read and list their board
- returns 404, not 403, for a user with no relationship to the board (IDOR)
- returns 404 for PATCH/DELETE attempts by a stranger too
- lets the owner add a collaborator, who can then read the board
- lets a collaborator read but not edit or delete the board (403, since they
  can see it exists)
- prevents a non-owner collaborator from adding new collaborators
- deletes the board as owner, then 404s on subsequent access

</details>

<details>
<summary><strong>lists.test.ts</strong> — 4 tests: collaborator permissions, ordering, cascade delete</summary>

- lets a collaborator (not just the owner) create and read lists
- assigns increasing positions to new lists
- returns 404 for a stranger with no access to the board
- deletes a list and cascades to its cards

</details>

<details>
<summary><strong>cards.test.ts</strong> — 5 tests: CRUD, cross-board move guard</summary>

- creates a card and lists it under its list
- returns 404 for a stranger, even with a valid card id on someone else's
  board
- moves a card to another list on the same board
- refuses to move a card into a list that belongs to a different board (the
  cross-board move guard — see [Design decisions](#backend))
- deletes a card

</details>

<details>
<summary><strong>health.test.ts</strong> — 1 test: liveness</summary>

- `GET /health` returns 200 and status ok

</details>

### Security tests — `packages/api/tests/security/*.test.ts` (24 tests)

Same Vitest/Supertest infrastructure as the functional suite — these are
attacker-shaped requests against the same real app, not a separate tool.

<details open>
<summary><strong>idor.test.ts</strong> — 15 tests: a systematic route sweep, not spot checks</summary>

`it.each` over all 13 board/list/card routes, each asserting a stranger (a
user with zero relationship to the board) gets **404**:

`get`/`rename`/`delete` a board · `add a collaborator` · `list`/`create` a
board's lists · `rename`/`delete` a list · `list`/`create` a list's cards ·
`get`/`edit`/`delete` a card

Plus two targeted cases:
- returns 404, not a 500, for a malformed board id (not a valid ObjectId) —
  proves the `Types.ObjectId.isValid()` guard actually works, not just that
  invalid input is rejected somehow
- returns 403, not 404, for a collaborator without owner-only permission —
  the direct contrast case for the sweep above: a collaborator *can* see the
  board exists, so hiding it would be inconsistent (see
  [Design decisions](#backend))

</details>

<details>
<summary><strong>jwt-tampering.test.ts</strong> — 6 tests: the token itself, not just "logged in or not"</summary>

- rejects a request with no cookie at all
- rejects a token signed with the wrong secret (a forged token)
- rejects an expired token
- rejects a token whose payload was altered after signing (signature no
  longer matches)
- rejects a garbage token string that isn't a JWT at all
- ignores a valid token sent via `Authorization` header instead of the
  cookie — a regression test tied to the httpOnly-cookie migration, proving
  there's no leftover bearer-token fallback that would partly undo the point
  of moving off `localStorage`

</details>

<details>
<summary><strong>rate-limit.test.ts</strong> — 3 tests: the exact boundary, and what it's scoped to</summary>

- blocks further login attempts against one account after 10 in the current
  window (the exact configured boundary — 10 allowed, 11th blocked)
- rate-limits per targeted account, not globally — a different email is
  unaffected (proves the email-keyed design actually isolates accounts, not
  just that *a* limit exists)
- does not rate-limit signup — only login is brute-forceable in a way that
  matters (proves the limiter is scoped correctly, not applied blanket)

</details>

### Contract tests — Pact (4 interactions, verified from both sides)

Consumer (`packages/web/tests/pact/auth.pact.test.ts`) describes what the
frontend expects; provider (`packages/api/tests/pact/verify.pact.test.ts`)
replays those exact interactions against the real running Express app.

- returns the created user on a successful signup
- rejects a signup with an email that's already registered (a Pact
  *provider state* — the provider verification step creates that user for
  real before replaying the interaction)
- rejects a login with the wrong credentials
- rejects a session check with no auth cookie

### End-to-end tests — Playwright (9 scenarios × 2–3 browser engines)

Page-Object-Model structure, driving the actual running app (not mocked).
9 unique scenarios; 18 total runs locally (Chromium + WebKit), 27 in CI
(+ Firefox — see [Design decisions](#end-to-end-playwright)).

<details>
<summary><strong>auth.spec.ts</strong> — 3 scenarios: signup, session persistence, logout</summary>

- signs up, lands on Boards, and stays authenticated after a reload (the
  actual proof the httpOnly cookie round-trip works, not just that the API
  test for it passes)
- shows an error for the wrong password
- logs out and can no longer reach a protected page

</details>

<details>
<summary><strong>boards.spec.ts</strong> — 2 scenarios: board creation, empty state</summary>

- creates a board via the API-bootstrapped session and sees it listed
- a freshly signed-up user has no boards yet

</details>

<details>
<summary><strong>board-detail.spec.ts</strong> — 3 scenarios: lists, cards, moving between lists</summary>

- creates lists and cards, and moves a card between lists
- deletes a card, then deletes the list it was in
- a card in the only list on a board has no "move to" dropdown (exercises
  the frontend's actual conditional rendering, not just the happy path)

</details>

<details>
<summary><strong>visual.spec.ts</strong> — 1 scenario: visual regression</summary>

- board view with lists and cards matches its visual baseline (pixel-diff
  screenshot comparison, 2% tolerance for anti-aliasing noise; baselines are
  platform-specific and CI-generated — see [Design decisions](#end-to-end-playwright))

</details>

### Security scanning — OWASP ZAP (1 automated baseline scan, every push)

Not a "test count" in the same sense as the above — a passive DAST crawl of
the actually-running, actually-built app. See
[Security scanning](#security-scanning-owasp-zap) for what it checks and
[bug #6](#6-zap-baseline-scan-found-real-missing-security-headers-infrafrontend)
for what it found and how it was fixed.

## Status

**All three planned phases are complete and CI-verified on every push:**

- **Phase 1 — Application**: Express + MongoDB API, JWT-in-httpOnly-cookie
  auth, board ownership/collaborators, React frontend.
- **Phase 2 — Test automation**: Playwright E2E (POM structure,
  API-bootstrapped auth fixture, cross-browser, visual regression), Pact
  contract test, security test suite (IDOR sweep, JWT tampering, rate
  limiting).
- **Phase 3 — Delivery pipeline**: the app is containerized (Docker + Docker
  Compose), [CI runs 5 parallel jobs](https://github.com/MateiSapunaru/TrelloJunior/actions)
  on every push (api/contract/ui/security/docker), and an OWASP ZAP baseline
  scan runs against the built app with its report uploaded as a build
  artifact.

See [Roadmap](#roadmap) for what's genuinely still open — extensions beyond
the original scope, not gaps in what was promised.

## Repo structure

```
packages/
  api/    Express + MongoDB backend (TypeScript)
    src/
    tests/            functional + security tests (Vitest/Supertest)
    tests/security/   IDOR / JWT tampering / rate limiting
    tests/pact/       Pact provider verification
  web/    React + TypeScript frontend (Vite)
    src/
    tests/pact/       Pact consumer test
  e2e/    Playwright E2E suite
    pages/            Page Object Model classes
    fixtures/         API-bootstrapped auth fixture
    tests/            E2E + visual regression specs
```

An npm workspaces monorepo, not separate repos: the app is one deployable unit
for this project, and workspaces keep dependency management and scripts simple
without pulling in Lerna/Nx/Turborepo, which would be unjustifiable tooling
weight at this scale.

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

Or run the whole stack (mongo + api + web) containerized, no local Node
install needed beyond what's used to build it:

```bash
docker compose up --build
```

`packages/api/.env` and `packages/web/.env` are gitignored — they hold local
dev secrets/config, never committed. `npm run mongo:down` stops the Mongo-only
container; `docker compose down` stops the full stack.

## Running the tests

| What | Command | Needs |
| --- | --- | --- |
| API functional + security (49 tests) | `npm test -w packages/api` | nothing — starts its own throwaway MongoDB |
| API security tests only | `npm test -w packages/api -- tests/security` | same as above |
| Contract — consumer (writes the pact file) | `npm run test:pact -w packages/web` | nothing |
| Contract — provider verification | `npm run test:pact -w packages/api` | the pact file above must exist; starts its own throwaway MongoDB |
| E2E — all browsers, headless | `npm test -w packages/e2e` | `npm run mongo:up` first (or a running docker-compose stack); auto-starts api/web dev servers |
| E2E — interactive UI mode | `npm run test:ui -w packages/e2e` | same as above |
| E2E — headed (watch the browser) | `npm run test:headed -w packages/e2e` | same as above |
| Docker images build | `docker build -f packages/api/Dockerfile .` / same for `packages/web/Dockerfile` | Docker |

All of the above also run automatically on every push — see
[CI/CD](#cicd-github-actions) — and the [Actions tab](https://github.com/MateiSapunaru/TrelloJunior/actions)
has the real, current results rather than a claim in this README.

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
`Set-Cookie` (httpOnly, `sameSite: strict`, `secure` controlled by a dedicated
`COOKIE_SECURE` flag — see [bug #5](#5-session-persistence-broke-in-webkit-specifically-only-against-the-container-backendfrontend-boundary))
and return only the user profile in the body. Returning it in the body *in
addition* to the cookie would defeat the point — any script that can read a
`fetch` response (legitimate code or an XSS payload) has equal access to it
either way, so the token would be readable regardless of where the cookie
lives. `sameSite: strict` is treated as sufficient CSRF protection here
specifically because this app has no cross-site login redirect or third-party
embed flow that strict mode would break.

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
`tests/boards.test.ts` — then swept systematically across every route in
`tests/security/idor.test.ts` (see [Test suite reference](#test-suite-reference)).

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
oversight: Playwright is this project's UI test layer — real browser,
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

**Two rendering engines locally (Chromium + WebKit), three in CI.** Firefox's
Windows build needs the Microsoft Visual C++ Redistributable, not installed on
this dev machine; installing a system package wasn't something to do inside a
test-config decision. CI (a clean Linux runner, no such missing dependency) runs
all three via `PLAYWRIGHT_PROJECTS=all` — see [CI/CD](#cicd-github-actions).

**Visual regression baselines are generated per-platform, by the environment
that will actually compare against them.** Font rendering differs enough
between Windows and Linux that pixel-diff baselines aren't portable across
them — a Windows-generated baseline would fail in Linux CI for reasons that
have nothing to do with a real regression. The Linux baselines committed here
were downloaded from CI's own first run (it correctly failed once, with no
baseline to compare against, then the resulting capture was retrieved as a
build artifact and committed) — generated by the actual target environment,
not a local approximation. Windows baselines stay alongside them for local
dev on a Windows machine; Playwright's snapshot naming (`-win32` vs `-linux`
suffix) keeps both without conflict.

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
model and cookie-based auth actually create as surface area (see
[Testing strategy](#testing-strategy) for the risk-based reasoning behind why
these three specifically):

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

### Docker

**Multi-stage builds, running compiled output, not dev-mode tooling.**
`packages/api/Dockerfile` runs `node dist/server.js`, not `tsx watch`;
`packages/web/Dockerfile` serves a `vite build` output via nginx, not the Vite
dev server. The build stage's `node_modules` (and TypeScript source) never
make it into the runtime image — only compiled JS/static assets do.

**Every workspace's `package.json` gets copied into the build context, not
just the one being built.** npm workspaces' lockfile validation needs every
workspace present for `npm ci` to succeed, even though only that package's
actual source and output end up in the image. Standard pattern for Docker +
npm-workspaces monorepos, not an oversight of "why does the API image know
about the web package".

**`VITE_API_URL` is a build ARG, not a runtime env var** — Vite inlines
`import.meta.env.*` into the built JS bundle at build time, unlike a Node
server that reads `process.env` per-request. It has to be the URL the
*browser* can reach the API at (`http://localhost:4000`, matching the
API's host-mapped port), not an internal Docker service hostname like
`http://api:4000`, which would resolve fine for other containers but not for
a browser tab running on the host.

**CI does *not* use `docker-compose` to run the test jobs** — see
[Contract testing](#contract-testing-pact) and the api/ui/security job
descriptions below for the same reasoning applied consistently: a test
runner shouldn't orchestrate Docker itself. `docker-compose.yml` is for local
dev and for running the finished app; CI's `docker` job only smoke-builds
both Dockerfiles to prove they still work, and doesn't push or deploy them
anywhere.

### CI/CD (GitHub Actions)

Five jobs, all running in parallel (no `needs:` between them):

- **`api`** — `npm test -w packages/api`: functional and security tests
  together (same Vitest suite, same infra — see
  [Security tests](#security-tests)). No Mongo service container: this suite
  starts its own throwaway `mongod` via `mongodb-memory-server`, same as
  running it locally. The downloaded binary (~700MB on first use) is cached
  across runs.
- **`contract`** — consumer Pact test, then provider verification, sequenced
  in one job (verification needs the file the consumer step just generated).
- **`ui`** — Playwright, with a real MongoDB service container since this
  actually runs the app rather than importing it in-process. Re-adds Firefox
  for real 3-engine coverage — excluded locally only because this dev
  machine is missing a Windows-specific dependency a Linux runner doesn't
  need. Uploads the HTML report as a build artifact regardless of outcome.
- **`security`** — the ZAP baseline scan (see below).
- **`docker`** — smoke-builds both Dockerfiles (see [Docker](#docker)).

**Jobs needing a real running server build it and start it in the
background**, rather than reusing Playwright's dev-server-spawning
`webServer` config (that mechanism is specific to the Playwright test
runner) — `nohup npm start -w packages/api &` / `npm run preview -w
packages/web &`, then a short polling loop against `/health` before the next
step runs.

### Security scanning (OWASP ZAP)

**A passive-only baseline scan**, not an active scan — matches the "narrow,
explicitly-scoped" security claim already established by the Vitest security
suite. Runs against the actually-built, actually-running app (`vite preview`
serving the production build), not the dev server.

**`allow_issue_writing: false`, set explicitly.** The action's own default is
`true` — it opens or updates a GitHub issue with the findings on every run
using the default token. That's not something a CI job should do
unprompted on every push; the uploaded report artifact is the actual
deliverable the original plan called for ("results as a build artifact").

**`fail_action: false`.** Baseline findings are informational/advisory at
this scope — the report is meant to be read, not to hard-block a merge. Can
be tightened later if wanted.

**The scan found real gaps on its first run, and they're fixed, not just
logged** — see [bug #6](#6-zap-baseline-scan-found-real-missing-security-headers-infrafrontend)
below. `packages/web/nginx.conf` and `packages/web/vite.config.ts`'s
`preview.headers` both carry the same CSP/`X-Frame-Options`/
`X-Content-Type-Options` headers now, since they're two independent static
servers (nginx for the real Docker deployment, `vite preview` for what CI's
`security` job actually scans) with no shared config layer between them.
Remaining findings (`Cross-Origin-*-Policy` headers, a stricter
per-directive CSP, `Permissions-Policy`) are progressively more niche for
this app — COEP/COOP specifically matter for cross-origin isolation
scenarios (e.g. `SharedArrayBuffer`) this app doesn't use — and are left as
known, understood follow-ups rather than chased to zero findings for its
own sake.

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

### 4. `express-rate-limit` crashed on startup, but only under `NODE_ENV=production` (backend)

The login rate limiter (see [Security tests](#security-tests)) worked fine
in every local run and in the Vitest suite, then threw a `ValidationError`
the moment the Docker image actually started:
`ERR_ERL_KEY_GEN_IPV6 — Custom keyGenerator appears to use request IP
without calling the ipKeyGenerator helper function for IPv6 addresses`.

The limiter's `keyGenerator` keys by the attempted email, with a fallback to
`req.ip` for the (route-validated-anyway) case where email is missing. That
fallback used the raw IP directly. `express-rate-limit` requires wrapping
any IP-based key in its `ipKeyGenerator()` helper, which normalizes IPv6
addresses down to a subnet — without it, a client can trivially rotate
through many addresses within their own /64 to bypass the limit, since each
one would count as a "different" client. The check that catches this only
runs under `NODE_ENV=production` (skipped in dev for speed), which is
exactly the env the Docker image sets and local `npm run dev`/tests never
do — the container was the first thing to actually exercise that code path.

Fix: wrap the fallback in `ipKeyGenerator(req.ip)`, per the library's own
documented pattern. Confirmed clean startup afterward and reran the full
Vitest suite (49/49) to confirm no regression.

### 5. Session persistence broke in WebKit specifically, only against the container (backend/frontend boundary)

Running the E2E suite against the newly-Dockerized app for the first time,
one test failed in WebKit only: session persistence after a page reload.
Chromium passed the identical test.

The auth cookie's `secure` flag was `process.env.NODE_ENV === "production"`
— true inside the Docker image, same as bug #4. But this Docker Compose
setup serves over plain HTTP on `localhost`, not HTTPS. Chromium tolerates a
`Secure` cookie on `localhost` over HTTP as a developer convenience; WebKit
does not; it correctly refuses to store the cookie at all. Login still
returned 200 (the cookie was *sent* in the response, just never *kept* by
the browser), so the failure only showed up on the very next request — in
this case, the reload.

Root cause was conflating two different questions under one flag:
`NODE_ENV` should mean "run the optimized/compiled build"; whether a
deployment actually terminates TLS is a separate, deployment-specific fact.
Fixed by splitting them: `NODE_ENV=production` stays true in the Docker
image (it *is* a production build), and a new dedicated `COOKIE_SECURE` env
var (false in `docker-compose.yml`, since this is plain HTTP) controls the
cookie flag instead. Confirmed by rerunning the Playwright suite against the
rebuilt containers — WebKit passed, all 18 tests green.

### 6. ZAP baseline scan found real missing security headers (infra/frontend)

The whole point of wiring up the ZAP scan (see
[Security scanning](#security-scanning-owasp-zap)) is that it's supposed to
find things — and its first real run did: 0 High, 3 Medium (no CSP header,
no anti-clickjacking header, no Subresource Integrity attribute), 5 Low
(missing `X-Content-Type-Options` and several `Cross-Origin-*-Policy`
headers), 3 Informational.

Fixed the two clearly-applicable ones by adding `X-Content-Type-Options`,
`X-Frame-Options`, and a real `Content-Security-Policy` — first to
`nginx.conf` (the real Docker deployment), then discovered the CI
`security` job doesn't scan that at all: it scans `vite preview`'s output
(a second, independent static-file server used only for that CI job), which
has its own default headers untouched by nginx's config. Added the
identical headers there too via `vite.config.ts`. Verified in a real browser
(a fresh tab, to rule out stale console history) that the CSP doesn't break
anything — Google Fonts still loads, signup/auth/board creation all still
work, zero console errors — before trusting it, and re-ran the scan
afterward to confirm the Medium/Low counts actually dropped (Medium 3→2,
Low 5→4).

Left the Subresource Integrity finding as understood-but-not-fixed: SRI
hashes protect against a *third-party* CDN serving tampered content, and
this bundle is self-hosted, same-origin, built from source in CI — the
threat model SRI addresses doesn't really apply here. Documented that
reasoning rather than adding a Vite plugin to silence a finding whose
premise doesn't hold for this deployment shape.

## Roadmap

- **Phase 2 — done**: Playwright E2E suite (POM structure, cross-browser, visual
  regression); Pact consumer-driven contract test (auth endpoints only — see
  [Design decisions](#contract-testing-pact)); IDOR/JWT-tampering/rate-limit
  security tests added to the API suite (see
  [Design decisions](#security-tests)).
- **Phase 3 — done**: Docker + Docker Compose for the whole app (see
  [Docker](#docker)); GitHub Actions CI with 5 parallel jobs (see
  [CI/CD](#cicd-github-actions)); OWASP ZAP baseline scan wired in, its
  findings actually fixed rather than just reported (see
  [Security scanning](#security-scanning-owasp-zap) and
  [bug #6](#6-zap-baseline-scan-found-real-missing-security-headers-infrafrontend)).

Everything from the original plan is built. Genuine next steps, not gaps in
what was promised:

- A real **Pact Broker** (currently local pact files — see
  [Contract testing](#contract-testing-pact)) for versioning and
  webhook-triggered verification.
- **Contracting the authenticated board/list/card endpoints**, which needs
  Pact's provider-state + `requestFilter` pattern to inject a real session
  cookie into the replayed request.
- **Tightening the remaining ZAP findings** (`Cross-Origin-*-Policy` headers,
  a stricter per-directive CSP).
- A **branch-protection rule** requiring CI to pass before merge, once this
  repo has more than one contributor for that to matter.
