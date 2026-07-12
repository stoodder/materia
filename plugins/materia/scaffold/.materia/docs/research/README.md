# Research notes

Durable research artifacts that inform product and pipeline decisions. Each note
captures **why** we believe a direction is worth taking — the external evidence,
with citations — so a later reader (or a spec proposal) can trace a decision back
to its sources.

These are **reference docs, not a queue.** Unlike `.materia/docs/specs/_proposed/` and
`.materia/docs/bugs/_reports/` (transient intake queues that trend toward empty),
research notes are kept as a standing corpus. A proposal drafted from a note
cites it via `source_refs`.

| Doc | What |
|---|---|

## Authoring a note

Name it `<YYYY-MM-DD>-<slug>.md`. Lead with what the note is for and how the
evidence was gathered (method + source quality), then organize findings so a
reader can act on them. Cite primary sources (papers, official docs, engineering
blogs) over listicles; prefer bare URLs or `<url>` over markdown links so the
doc link-check stays focused on in-repo paths. Add a row to the table above and
run `sh .materia/scripts/check-docs.sh`.
