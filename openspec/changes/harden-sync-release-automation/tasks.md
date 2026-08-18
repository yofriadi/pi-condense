## 1. Fork release and CI hardening

- [x] 1.1 Restrict `release.sh propose` to the nearest reachable `vX.Y.Z` release tag and verify a `subtree-*` tag does not hide unreleased commits.
- [x] 1.2 Run `bun run typecheck` before tests in fork test CI, release CI, and the local release preflight; validate workflow YAML and helper behavior.
- [x] 1.3 Add a credential-gated isolated Antigravity smoke helper with actionable manual verification output; test its fail-closed input validation.

## 2. Fork sync contract

- [x] 2.1 Apply the release-automation and upstream-sync delta requirements to durable specs, document the smoke helper, and validate OpenSpec.
- [ ] 2.2 Commit and push the fork hardening change on `local/main` after its package gates pass.

## 3. Monorepo consumer and reproducibility

- [ ] 3.1 Replace the direct-upstream `update:pi-condense` wrapper with a guarded `pi-condense-fork local/main --squash` consumer that runs post-pull G1–G4.
- [ ] 3.2 Regenerate `pnpm-lock.yaml` from a clean isolated monorepo worktree; review every changed importer against committed manifests and verify frozen installation/type checking.
- [ ] 3.3 Pull the committed fork hardening change through the guarded subtree flow without direct package edits, validate exact fork-tree identity, and commit/push the monorepo consumer and lockfile changes.

## 4. Authenticated live verification

- [ ] 4.1 Run the smoke helper in an authenticated Antigravity session; inspect the emitted session artifact and record direct configured-model summarization or the exact fallback/error outcome.
