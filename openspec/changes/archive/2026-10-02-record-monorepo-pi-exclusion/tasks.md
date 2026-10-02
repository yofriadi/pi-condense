## 1. Spec delta

- [x] 1.1 Add requirement `Monorepo path exclusions` to `specs/upstream-sync/spec.md`: exclusions are recorded with path, removing monorepo commit, and known rationale; the fork keeps the path; consumption compares trees with exclusions applied and reports anything else as drift; a fork-side edit to an excluded path is a modify/delete conflict resolved toward the deletion unless the operator says otherwise; a fork-side addition under an excluded prefix is removed again in the same consumption; a sync MUST NOT undo an exclusion
- [x] 1.2 Record `packages/pi-condense/.pi/**` as the first exclusion, citing monorepo commit `4e076141b` ("remove .pi", 2026-10-02) and stating that the commit carries no rationale beyond the operator's confirmation
- [x] 1.3 Modify requirement `Sync gates` so G5's protected-path existence check runs against the fork tree, and after a subtree pull against the monorepo tree adjusted for the recorded exclusions; add a scenario for the monorepo case
- [x] 1.4 `openspec validate record-monorepo-pi-exclusion --strict` passes

## 2. Monorepo-side action

- [x] 2.1 Add `packages/pi-condense/.pi/` to the monorepo root `.gitignore` — scoped, so the tracked `packages/pi-permission-system/.pi/npm/.gitignore` is unaffected — and confirm `git check-ignore` matches the intended path only
- [ ] 2.2 Consume the fork tip into the monorepo through the documented detached-candidate flow and confirm the consumed tree differs from fork `local/main` by exactly the excluded paths — left open here by construction: the subtree pull that consumes this change is what completes it, and the fork cannot know that merge commit in advance, so the hash is named in the consumption report

## 3. Gates

- [x] 3.1 `openspec validate --all` passes in the fork
- [x] 3.2 Fork `bun run typecheck` and `bun test` unaffected (spec-only change)
- [x] 3.3 No `.pi/**` file in the fork is modified or deleted by this change
