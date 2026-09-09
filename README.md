# TrelloJunior

[![CI](https://github.com/MateiSapunaru/TrelloJunior/actions/workflows/ci.yml/badge.svg)](https://github.com/MateiSapunaru/TrelloJunior/actions/workflows/ci.yml)

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
email-keyed login rate limiting).
**Day 3 complete**: the app itself is containerized (Docker + Docker Compose),
CI runs on every push ([GitHub Actions](https://github.com/MateiSapunaru/TrelloJunior/actions),
5 parallel jobs: api/contract/ui/security/docker), and an OWASP ZAP baseline
scan runs against the built app with its report uploaded as a build artifact.
See [Roadmap](#roadmap) for what's genuinely still open (none of the original
3-day scope — everything past this point would be additions, not gaps).

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
logged** — see [bug #6](#6-zap-baseline-scan-found-real-missing-security-headers-infra--frontend)
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
afterward to confirm the Medium/Low counts actually dropped.

Left the Subresource Integrity finding as understood-but-not-fixed: SRI
hashes protect against a *third-party* CDN serving tampered content, and
this bundle is self-hosted, same-origin, built from source in CI — the
threat model SRI addresses doesn't really apply here. Documented that
reasoning rather than adding a Vite plugin to silence a finding whose
premise doesn't hold for this deployment shape.

## Roadmap

- **Day 2 — done**: Playwright E2E suite (POM structure, cross-browser, visual
  regression); Pact consumer-driven contract test (auth endpoints only — see
  [Design decisions](#contract-testing-pact)); IDOR/JWT-tampering/rate-limit
  security tests added to the API suite (see
  [Design decisions](#security-tests)).
- **Day 3 — done**: Docker + Docker Compose for the whole app (see
  [Docker](#docker)); GitHub Actions CI with 5 parallel jobs (see
  [CI/CD](#cicd-github-actions)); OWASP ZAP baseline scan wired in, its
  findings actually fixed rather than just reported (see
  [Security scanning](#security-scanning-owasp-zap) and
  [bug #6](#6-zap-baseline-scan-found-real-missing-security-headers-infrafrontend)).

Everything from the original 3-day plan is built. Genuine next steps, not
gaps in what was promised: a Pact Broker (currently local pact files — see
[Contract testing](#contract-testing-pact)); contracting the
authenticated board/list/card endpoints (needs Pact's provider-state +
`requestFilter` pattern to inject a real session cookie); tightening the
remaining ZAP findings (`Cross-Origin-*-Policy` headers, a stricter
per-directive CSP); and a branch-protection rule requiring CI to pass before
merge, once this repo has more than one contributor for that to matter.
