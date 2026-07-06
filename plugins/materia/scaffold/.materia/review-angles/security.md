---
name: security
description: Security review of the cumulative diff.
---

# security — security review angle

## What it checks

Security defects across the cumulative diff.

## How to run it

Invoke the `security-review` skill if the session provides it; otherwise run
the same angle inline.

`security-review` is harness-provided and may be absent from a session. When it
is unavailable, running this angle inline is the documented procedure, not a
deviation.
