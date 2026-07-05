# Environment preflight — the single source for cold-start recipes

The one place the pipeline's environment knowledge lives. The `ship-spec`
orchestrator applies § Session preflight **once per session** before
dispatching any code-touching stage; every stage skill points here instead of
carrying its own copy. A markdown/docs-only run may skip the code-touching
recipes entirely (see `finalize/SKILL.md` § Procedure's docs/skills-only gate
profile).

## Session preflight (orchestrator, once per session)

Run before the first code-touching spawn so every subagent inherits a green
baseline instead of rediscovering the cold-start gap:

1. **Node major** — root the session in the `engines.node` major from
   `package.json` (recipe below).
2. **Deps** — if `node_modules` is absent, run `pnpm install` (its
   `nuxt prepare` postinstall generates `.nuxt/eslint.config.mjs`, whose
   absence makes `pnpm lint` fail obscurely). If the install fails on the
   Prisma engines postinstall, retry with `--ignore-scripts` and handle Prisma
   separately (below).
3. **Prisma client** — generate it, applying the engines recipe below if the
   download resets.

Surface any preflight failure once, up front. Record in `STATUS.md` that the
preflight ran (or was skipped for a docs-only run).

## Node 24 absent (the env usually ships Node 20/21/22)

- **Pure-Node gates** (`check:docs`, markdown-only tasks): proceed on the
  resident Node and note the version in the commit.
- **Code-touching gates:** prefer a hard `PATH` prefix to a v24 `bin` over
  `nvm use` — nvm state is inconsistent across shells here. E.g.
  `PATH=/root/.nvm/versions/node/v24.16.0/bin:$PATH pnpm lint` (locate the bin
  with `nvm which 24` or a glob under the nvm versions dir).
- **nvm-absent fallback:** if `~/.nvm` doesn't exist, don't dead-end on the
  missing source file — locate any installed v24 `bin` directly
  (`command -v node`, `which -a node`, or a glob such as
  `/usr/local/*/node-v24*/bin`); if no v24 is installed, install it before
  running code-touching gates.
- **Never run code gates under the wrong Node** — it produces cryptic
  `Object.groupBy is not a function` / oxc-walker errors that obscure the real
  problem. Code-touching tasks halt with a clear remediation when Node 24 is
  unavailable.

## Prisma engines ECONNRESET through the proxy

`@prisma/engines` postinstall resets through the egress proxy. Point
`NODE_EXTRA_CA_CERTS` at the proxy CA bundle first; if the download still
resets, curl-fetch the engine binaries and set `PRISMA_ENGINES_MIRROR` to the
local copy (with `CHECKSUM_IGNORE_MISSING`) so `prisma generate` resolves them
locally instead of re-fetching.

## Playwright browser revision mismatch

The env ships one Chromium revision while the pinned `@playwright/test` build
wants another. Do **not** re-download (`playwright install`) — launch with
`executablePath` pointed at the resident browser under `/opt/pw-browsers`
(the `PLAYWRIGHT_BROWSERS_PATH` location). When a launcher resolves Chromium
by the **pinned revision number** rather than honoring `executablePath`
(wants `chromium-1228`, env ships `chromium-1194`), **symlink the resident
revision dir to the pinned name** (`ln -s chromium-1194 chromium-1228` under
`/opt/pw-browsers`). When the two revisions differ in **internal layout**
(e.g. 1194's `chrome-linux/headless_shell` vs 1228's
`chrome-headless-shell-linux64/chrome-headless-shell`), the dir-level symlink
is insufficient — additionally symlink the resident binary at the pinned
build's expected nested path inside the linked dir.

## prisma migrate dev blocks on a TTY probe

`prisma migrate dev` probes for an interactive TTY and hangs (until timeout)
in this environment. Redirect stdin on the canonical recipe —
`pnpm run db:migrate:dev </dev/null` (and pass `--name <migration>` where a
name would otherwise be prompted for) — so the command cannot block waiting
for input.

## Second `nuxt dev` needs NUXT_IGNORE_LOCK

A second concurrent `nuxt dev` (e.g. an e2e stack alongside the main dev
server) refuses to start against the first instance's lock. Set
`NUXT_IGNORE_LOCK=true` on the second instance.

## E2e Postgres over TCP

Export `PGHOST/PGPORT/PGUSER/PGPASSWORD` (default `PGHOST=localhost`) before
`createdb` / `prisma migrate` / `scripts/test-e2e.sh` — the default
Unix-socket assumption fails in this env. Standard values:
`PGHOST=localhost PGPORT=5432 PGUSER=postgres PGPASSWORD=postgres`.

**One Postgres, one data dir.** Never let two provisioning paths (e.g. the
docker-compose Postgres and a host-installed cluster) both claim :5432 — the
collision is a latent DB-loss trap: a migrate/seed lands in whichever cluster
answers first. Standardize on a single cluster/data dir per session; if a
second Postgres is found listening, stop it (or repoint its port) before
running migrations.

## Dead Postgres mid-task

If a gate step fails because Postgres is unreachable (a paused/crashed dev
container drops the connection mid-migration), **restart the DB**
(`docker compose up -d`, or restart the Postgres service) before treating it
as a task failure — a dead DB is the most common silent-stall cause. If it
can't be revived, write the `Blocker` and stop; don't hang.

## Host-fallback gate (Docker Hub rate limits)

If the Docker gate can't start because Docker Hub rate-limits
`postgres:16-alpine`, stand up a host gate instead: host Node 24 (per above)
plus a local PostgreSQL 16 (`createdb` + `prisma migrate deploy` + `db:seed`
against a local `DATABASE_URL`). The host gate is a complete equivalent
(migrate/seed/live route checks all run); record in the PR that the host
fallback was used.

## Gate invocation notes

- **Shell state does not persist between Bash tool calls.** Source any env
  prelude and run its gate **in the same command** — `source <env> && <gate>`
  — never across separate calls.
- **The working scoped-e2e invocation in this environment** is
  `E2E_SKIP_PROVISION=1 bash scripts/test-e2e.sh --grep <pattern>` — record
  it once at first use and reuse it for finalize/verify re-checks instead of
  re-deriving it.

## Gate verdicts

Treat every gate command as passing **iff its exit code is 0** — never judge
by the trailing display line, which can read as success while the command
exits non-zero.
