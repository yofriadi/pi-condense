## Context

The layered-fork model assumes the monorepo's `packages/pi-condense` tree equals fork `local/main`'s tree. That held through four subtree pulls (`913437081b0c…`, then `390c5397072e…`, `623abc2d0879…`). Monorepo commit `4e076141b` broke it on purpose by deleting `.pi/**`, and the fifth pull preserved the deletion without comment, because a three-way merge treats "ours deleted, theirs unchanged" as a resolved deletion rather than a conflict.

Nothing in the repository says the divergence is intended.

## Decisions

### 1. One added requirement, not caveats in three existing ones

The exclusion touches `Protected local surfaces` (`.pi/` is listed first), `Sync gates` (G5 checks that protected paths exist), and `Subtree consumption` (tree comparison, conflict resolution). Writing the rule once as `Monorepo path exclusions` keeps it readable and gives future exclusions one place to be added to. Rewriting the other two requirements' long paragraphs to carry the same caveat would triple the text and triple the sync-conflict surface for a rule that is really about the monorepo, not about protection or consumption mechanics.

`Sync gates` is modified anyway, because G5 is the one statement that now evaluates to a false alarm; leaving it would mean a gate that fails on a chosen state.

### 2. The fork keeps `.pi/**`

Protection is a fork-side property: `.pi/prompts/**` and `.pi/skills/**` are purely local content used when working on the extension, and `.pi/gauntlet-overrides.md` is inherited upstream content carrying fork identity. Deleting them from the fork to satisfy a monorepo packaging preference would destroy local surfaces the sync exists to preserve. The exclusion is therefore directional — the monorepo does not carry them, the fork does — and G5 keeps requiring them in the fork.

### 3. Default conflict resolution keeps the deletion

A fork-side edit to an excluded path produces a modify/delete conflict at the next pull. Resolving toward the fork would silently undo an explicit operator commit; resolving toward the deletion preserves it and is visible in the sync record. The default is the deletion, and the requirement says the operator can choose otherwise — the point is that the choice is recorded rather than implicit.

### 4. Additions under an excluded prefix are removed in the same consumption

A path the fork adds under `.pi/` has no counterpart in base or ours, so the merge adds it cleanly and the exclusion silently erodes. The requirement makes that a step in the consumption: remove it before fast-forward and record it. Without this, exclusions decay one file at a time.

### 5. `.gitignore` is a guard, not the mechanism

Ignore rules do not filter merges or index operations, so the gitignore line cannot enforce the exclusion; the requirement does. It is still worth having because it stops a working-tree `git add -A` from re-staging the path — which is how `.pi/**` came back during the v2.11.2 sync in the first place. It is scoped to `packages/pi-condense/.pi/` rather than a bare `.pi/`, because `packages/pi-permission-system/.pi/npm/.gitignore` is tracked and must stay that way.

### 6. No invented rationale

`4e076141b` has no message body. The exclusion record cites the commit, its subject, and its date, and states that the operator confirmed the exclusion when asked on 2026-10-02. Attributing a motive the commit does not carry would be the same class of error the round-1 review caught in the v2.11.2 sync record.

## Risks

- **Exclusion list rot.** A future monorepo-side deletion that is not recorded here reproduces this problem. Mitigation is the requirement itself: consumption reports any unexplained difference as drift, so an unrecorded deletion surfaces at the next pull instead of silently.
- **Fork-side `.pi/**` churn.** Any fork edit to those files now costs a conflict resolution per sync. If that becomes routine, the cheaper answers are to stop editing them or to revisit the exclusion — both operator decisions.
- **G5 wording drift.** G5 now has two scopes (fork tree, exclusion-adjusted monorepo tree). The added scenario states the monorepo case explicitly so the check cannot be read as fork-only.
