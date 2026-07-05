# Tier vocabulary — single source of truth

This file is the **only** place the model/effort sets, notation, maps, fallback,
and coercion rules are enumerated. Every other carrier (stage skills,
`tasks.md` rows, § Review table) links here and re-states nothing.

## Closed model set

`haiku · sonnet · opus · fable`

`fable` — **flag-gated; opt-in per run.** fable is billed per-token and is not
covered by the operator's subscription, so it never resolves by default. A
`fable`-tagged unit (a unit's declared tier, or an operator override to fable)
resolves to the fable model ONLY when the run's invocation carried the universal
`--with-fable` argument (defined in `docs/standards/skills.md` § The `--with-fable`
argument). Absent the flag, every `fable`-tagged unit coerces to the fallback
(`opus/high`) — unconditionally, regardless of whether the fable upstream is
reachable right now — recorded with the standard one-line note, reason
`fable not unlocked` (§ Unknown-value coercion rule).

When the flag IS set and a `fable`-tagged spawn is attempted, the availability
tolerance still applies underneath the gate: if the `Agent` call rejects the
fable model or errors out on model availability, coerce that spawn to `opus/high`
and record the one-line note with reason `fable unreachable` — never block or
pause the run waiting for fable to come back. The flag conditions *resolution*;
availability tolerance is the second-order safety net once the flag has already
opened the door.

## Closed effort set

`low · medium · high · xhigh`

Effort is **advisory-only** — it is never an `Agent` parameter. The matching
guidance sentence below is injected into the spawn prompt verbatim.

## Notation

A unit's tier is the single token pair **`<model>/<effort>`**.

Examples: `sonnet/medium` · `haiku/low` · `opus/high`

One representation everywhere; no synonyms.

## effort → guidance-sentence map

| effort | Guidance sentence injected into the spawn prompt |
|---|---|
| `low` | "Run this at low reasoning effort — it's mechanical; don't over-deliberate." |
| `medium` | "Run this at medium reasoning effort." |
| `high` | "Run this at high reasoning effort — reason carefully before acting." |
| `xhigh` | "Run this at maximum reasoning effort — this is the highest-stakes unit; be exhaustive." |

The orchestrator copies the matching sentence verbatim into the spawn prompt.

## Fallback

The single fallback pair is **`opus/high`**.

It applies to any absent / malformed / out-of-vocabulary / `Agent`-rejected
tier — including a `fable` spawn rejected or erroring on model availability
(see the closed model set above). Stated once here; every other carrier
references this file rather than re-enumerating the fallback.

## Unknown-value coercion rule

When a tier value is absent, syntactically malformed, or contains a token
outside the closed sets, coerce to the fallback (`opus/high`) and record a
one-line note of the form:

```
tier-fallback: <unit> … → opus/high (<reason>)
```

Never block the run for a bad tier value.
