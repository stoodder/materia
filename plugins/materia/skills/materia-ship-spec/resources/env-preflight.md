# Environment preflight — the cold-start procedure

The one place the pipeline's environment *procedure* lives. The concrete,
repo-specific recipes (runtime versions, install commands, codegen, service
provisioning, known failure signatures) live in `MATERIA.md`
§ Environment preflight — that section is the single source for *what* to
run; this file is the single source for *when and how* the orchestrator runs
it. A markdown/docs-only run may skip the code-touching recipes entirely (see
`materia-finalize/SKILL.md` § Procedure's docs/skills-only gate profile).

## Session preflight (orchestrator, once per session)

Run before the first code-touching spawn so every subagent inherits a green
baseline instead of rediscovering the cold-start gap:

1. **Runtime** — confirm the runtime version(s) `MATERIA.md` § Environment
   preflight names; select or install per its recipe.
2. **Dependencies** — install if absent, per the same section.
3. **Codegen** — run any generation steps the section names (ORM clients,
   prepared configs) so typecheck/lint don't fail obscurely on missing
   artifacts.
4. **Services** — bring up any local services the gates need (database,
   containers), per the same section.

Surface any preflight failure once, up front. Record in `STATUS.md` that the
preflight ran (or was skipped for a docs-only run). While `MATERIA.md`
§ Gate's Bootstrap-grace marker is present, a missing gate command or
not-yet-provisionable service is **skip + record** per that section — never a
preflight failure; `check:docs` remains binding.

## Standing rules (stack-independent)

- **Never run code gates under the wrong runtime version** — it produces
  cryptic, misleading errors that obscure the real problem. Code-touching
  tasks halt with a clear remediation when the required runtime is
  unavailable.
- **One service instance per port.** Never let two provisioning paths (e.g. a
  containerized database and a host-installed one) both claim the same port —
  the collision is a latent data-loss trap: a migration/seed lands in
  whichever instance answers first. Standardize on a single instance per
  session; if a second is found listening, stop it (or repoint its port)
  before running migrations.
- **Dead service mid-task:** if a gate step fails because a required service
  is unreachable (a paused/crashed container drops the connection mid-run),
  **restart the service** per `MATERIA.md` § Environment preflight before
  treating it as a task failure — a dead service is the most common
  silent-stall cause. If it can't be revived, write the `Blocker` and stop;
  don't hang.
- **Known failure signatures:** when a cold-start failure matches a signature
  listed in `MATERIA.md` § Environment preflight, apply its recorded fix
  instead of re-deriving it. When a *new* signature costs real time, the
  run's retro entry should say so, so a maintainer can fold recurring ones
  into `MATERIA.md` § Environment preflight.

## Gate invocation notes

- **Shell state does not persist between Bash tool calls.** Source any env
  prelude and run its gate **in the same command** — `source <env> && <gate>`
  — never across separate calls.
- **Record the working invocation once at first use** (e.g. the scoped-e2e
  command that works in this environment) and reuse it for finalize/verify
  re-checks instead of re-deriving it.

## Gate verdicts

Treat every gate command as passing **iff its exit code is 0** — never judge
by the trailing display line, which can read as success while the command
exits non-zero.
