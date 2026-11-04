# BuramLoop Workspace Guidelines

## Documentation updates

- After each code change, inspect the existing project docs and update the
  documents directly affected by the behavior, API, data model, workflow,
  tests, or verified project status. Do not update unrelated documents just
  to make a change appear everywhere.
- Preserve the existing headings, tables, wording style, and ordering in
  [docs/](./docs/). Follow the established patterns: append dated work to
  [DAILY_LOG.md](./docs/DAILY_LOG.md) and a versioned entry to
  [CONTEXT_HISTORY.md](./docs/CONTEXT_HISTORY.md); record resolved defects in
  [ISSUES_AND_FIXES.md](./docs/ISSUES_AND_FIXES.md); refresh current summaries
  in the tracker, roadmap, context, or master handoff only when they are
  affected.
- Keep historical entries intact. Correct stale current-state claims without
  rewriting old records, and report only validations actually run.
- If no documentation is materially affected, leave it unchanged. Do not
  claim updates happen automatically outside coding-agent work; this guideline
  ensures documentation is considered and updated as part of each relevant
  code task.
