## ADDED Requirements

### Requirement: Session-derived state SHALL be hydrated before any hook consumes it

Every hook that reads session-derived in-memory state — the loaded configuration, the tool-call index, the block-ref counter, the stats accumulator, and the prune frontier — SHALL find that state rebuilt from the current session branch, whether or not this extension's `session_start` handler has run.

The `context` hook SHALL hydrate on demand when hydration has not yet happened, before it evaluates any configuration-dependent guard, including the per-request image cap.

#### Scenario: Context event arrives before session_start

- **WHEN** another extension's `session_start` handler triggers an agent turn, so this extension's `context` hook runs before its own `session_start` handler
- **THEN** the `context` hook rebuilds configuration and session state from the branch first
- **AND** tool results already summarized in that session are stub-replaced in the outgoing messages, exactly as they would be after a normal `session_start`

#### Scenario: Settings are loaded on demand

- **WHEN** the `context` hook hydrates on demand and the persisted settings enable pruning
- **THEN** the in-memory configuration reflects those settings for that turn, rather than the extension's built-in defaults

### Requirement: On-demand hydration SHALL NOT change configuration semantics

Hydrating on demand SHALL NOT enable pruning that the user has disabled, and SHALL NOT discard configuration overrides made in-session through `/pruner` commands.

#### Scenario: Pruning disabled in settings

- **WHEN** the `context` hook hydrates on demand and the persisted settings have pruning disabled
- **THEN** the hook returns the messages unchanged, apart from any request-validity image cap

#### Scenario: Tree navigation keeps in-session overrides

- **WHEN** the user changes configuration with a `/pruner` command and the session tree is then navigated
- **THEN** the `session_tree` rebuild does not reload settings from disk, and the in-session override stays in effect

### Requirement: Hydration SHALL be idempotent

Rebuilding session state more than once for the same branch SHALL produce the same in-memory state as rebuilding it once, so a hook that hydrates on demand and a `session_start` handler that runs afterwards cannot corrupt the index, the stats accumulator, or the frontier.

#### Scenario: Fallback hydration followed by session_start

- **WHEN** the `context` hook hydrates on demand and `session_start` then runs for the same session
- **THEN** the resulting index, stats, and frontier match what `session_start` alone would have produced
- **AND** no tool result is pruned twice and no diagnostic counter is inflated by the extra rebuild
