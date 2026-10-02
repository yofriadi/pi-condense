## Why

Monorepo commit `4e076141b` ("remove .pi", 2026-10-02, no message body) deleted all fourteen `packages/pi-condense/.pi/**` files. The next subtree pull preserved that deletion correctly — a three-way merge whose base and theirs both carry an unmodified path while ours deleted it resolves to deleted — so the monorepo tree now differs from fork `local/main` by exactly those fourteen files.

Two statements in the `upstream-sync` spec are false as a result, and nothing records the exclusion:

- **G5** (`Sync gates`) verifies "that required local paths exist with local content", and `.pi/` is first on the `Protected local surfaces` list. Run in the monorepo after a subtree pull, G5 now fails on a state the operator chose.
- The consumption flow compares the consumed tree against the fork tree. That comparison now reports fourteen files of drift on every sync, indistinguishable from accidental loss — which is precisely the failure mode the round-1 adversarial review of the v2.11.2 sync caught in the other direction, when a record claimed `.pi/**` had been kept deleted while the merge had restored it.

Left unrecorded, the next sync either fails a gate, "restores" the files against the operator's intent, or silently accepts drift it cannot explain.

## What Changes

- Add a `Monorepo path exclusions` requirement: the monorepo may deliberately not carry named fork paths; each exclusion records the path, the monorepo commit that removed it, and what is known about why; the fork keeps the path, so an exclusion is a monorepo-side packaging decision and never a removal of a protected local surface. It fixes how consumption treats excluded paths — comparison reports only unexplained drift, a fork-side edit arrives as a modify/delete conflict resolved in favor of the deletion, and a fork-side addition under an excluded prefix is removed again in the same consumption.
- Modify `Sync gates` so G5's protected-path existence check is scoped: it runs against the fork tree, and after a subtree pull against the monorepo tree adjusted for the recorded exclusions.
- Record `packages/pi-condense/.pi/**` as the first exclusion, citing `4e076141b` and stating plainly that the commit carries no rationale.
- Monorepo-side action, not part of the fork spec: add `packages/pi-condense/.pi/` to the monorepo root `.gitignore` so the path cannot be re-staged from a working tree by accident.

## Capabilities

### New Capabilities
<!-- None. -->

### Modified Capabilities
- `upstream-sync`: one added requirement (`Monorepo path exclusions`), one modified requirement (`Sync gates`).

## Impact

- **Spec only.** No code, no tests, no manifest changes; the fork's `.pi/**` tree is untouched and stays protected.
- **Monorepo:** one `.gitignore` line. Ignore rules do not filter merges, so this guards working-tree staging only; the exclusion requirement is what governs subtree pulls.
- **Future syncs:** the tree-identity check gains an exclusion list, and a fork-side `.pi/**` edit becomes a documented conflict resolution instead of a surprise.
