# Spec Delta: upstream-sync

## ADDED Requirements

### Requirement: Monorepo path exclusions

The monorepo MAY deliberately not carry a named fork path. Every exclusion SHALL be recorded here with the path, the monorepo commit that removed it, and whatever rationale is actually evidenced — a commit subject, a message body, or an operator confirmation — and SHALL NOT be attributed a motive the record does not carry. The fork SHALL keep the path: an exclusion is a monorepo-side packaging decision, not a removal of a protected local surface, and the fork-side gates keep requiring it.

Consumption SHALL compare the consumed monorepo tree against the fork tree with the recorded exclusions applied, and SHALL report any remaining difference as drift to investigate rather than accept it. A sync MUST NOT undo an exclusion.

Recorded exclusions:

- `packages/pi-condense/.pi/**` — removed by monorepo commit `4e076141b` ("remove .pi", 2026-10-02). The commit carries no message body; the operator confirmed the exclusion on 2026-10-02. Fourteen files: `.pi/gauntlet-overrides.md`, `.pi/prompts/**`, `.pi/skills/**`. The fork continues to track all of them, and they remain protected local surfaces there.

A fork-side edit to an excluded path arrives as a modify/delete conflict at the next pull, and the resolution SHALL keep the deletion unless the operator asks otherwise, recorded in the sync change. A path the fork adds under an excluded prefix merges cleanly and would silently erode the exclusion, so the consumption SHALL remove it again before fast-forwarding and record the removal.

#### Scenario: Consumed tree comparison with an exclusion

- **WHEN** the consumed monorepo tree is compared against fork `local/main`
- **THEN** the recorded exclusions account for the differences, and anything else is reported as drift that pauses the sync

#### Scenario: Fork edits an excluded path

- **WHEN** a fork commit modifies a file under an excluded prefix and the next subtree pull stops on a modify/delete conflict
- **THEN** the deletion is kept unless the operator chooses otherwise, and the sync change records the resolution

#### Scenario: Fork adds a file under an excluded prefix

- **WHEN** a fork commit adds a new file under an excluded prefix and the subtree pull merges it in without conflict
- **THEN** the consumption removes it again before fast-forwarding the caller branch and records the removal

#### Scenario: A sync attempts to restore an excluded path

- **WHEN** a subtree pull or a manual step would re-add a path the monorepo has excluded
- **THEN** the sync does not re-add it; restoring the path requires an operator decision that also updates this requirement

## MODIFIED Requirements

### Requirement: Sync gates

Every sync SHALL run the gates in the fork and rerun the applicable gates in the monorepo after the subtree pull. G4 runs for each thematic slice; G1, G3, and G5 run at the slice tip and after the subtree pull; G6 runs once at the fork tip. Fork test CI, release CI, and the local release preflight SHALL execute package-owned `bun run typecheck` before tests using the committed `bun.lock`, pinned Bun version, and frozen install. When a subtree pull changes `packages/pi-condense/package.json`, the root lockfile SHALL be regenerated in a detached candidate worktree with the repository's declared pnpm version; the candidate MUST pass frozen install and root/G1–G4 checks before the caller branch fast-forwards, and a failed candidate MUST leave the caller branch unchanged.

1. G0 requires a repo-wide clean tracked monorepo tree before subtree operations: `git diff-index HEAD` and `git diff-index --cached HEAD` are both empty.
2. G1 forbids imports or mocks from `@earendil-works/pi-ai/compat` and `reasoningEffort:` option assignments under `src/`. The `not.toHaveProperty("reasoningEffort")` regression assertion is allowed.
3. G2 runs targeted summarizer tests; G3 runs the complete suite.
4. G4 runs `bun run typecheck` through the package-owned TypeScript 7 project configuration; test CI, release CI, and release preflight run it before package tests.
5. G5 verifies the protected-path allowlist, that required local paths exist with local content, and the exact scoped identity, branch-qualified image URLs, release-script identity constants, test PR target, and GitHub default branch. The protected-path existence check runs against the fork tree; when G5 runs in the monorepo after a subtree pull it runs against the monorepo tree adjusted for the exclusions recorded under `Monorepo path exclusions`, and an excluded path's absence there is not a failure.
6. G6 verifies exported patch completeness and the sync-introduced allowlist.
7. The local automation suites (`scripts/test-release-helper.sh`, `scripts/test-smoke-antigravity.sh`) run at the fork tip whenever the sync touches `.agents/skills/release/**` or `scripts/**`.

G3 runs the complete suite and MUST be green. A test file committed ahead of its implementation — the executable spec of an active, unimplemented OpenSpec change — SHALL be guarded with `describe.skip` and an in-place comment naming the change, why the cases fail by construction, and the task that removes the guard, so the skipped cases stay visible in test output and the gate stays meaningful for everything else. Such a guard is not a removal of the tests and SHALL be recorded in the sync change.

#### Scenario: Current TypeScript runs without parent-config leakage

- **WHEN** G4 runs in the standalone fork or from the monorepo package directory
- **THEN** it invokes the package-owned TypeScript 7.0.2 compiler through `tsconfig.json`, checks the `index.ts` graph, and does not resolve a parent monorepo configuration or global compiler

#### Scenario: A gate fails

- **WHEN** any sync gate fails
- **THEN** the sync pauses until the failure is fixed or the work rolls back; the monorepo is never left half-synced

#### Scenario: A spec-first suite is red

- **WHEN** a synced tree contains tests for a local change that is not implemented yet
- **THEN** the suite is skip-guarded with an in-place note, G3 passes with the skips reported, and the sync change records the guard and the task that removes it

#### Scenario: G5 runs in the monorepo with a recorded exclusion

- **WHEN** G5 runs after a subtree pull and a protected path is absent from the monorepo tree because `Monorepo path exclusions` records it
- **THEN** G5 does not fail on that absence and reports the exclusion, while still failing if the same path is missing from the fork tree
