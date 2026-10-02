# usage-reporting Specification

## Purpose
TBD - created by archiving change report-summarizer-usage-to-pi. Update Purpose after archive.
## Requirements
### Requirement: Summarizer spend SHALL be recorded as Pi usage entries

Every summarizer LLM attempt that returns a provider response carrying usage SHALL append one Pi `type: "usage"` session entry, attributed to the kind `context_prune`, carrying the response's provider, the model that actually served the request, the usage object, and a note describing the call.

The entry SHALL be appended before the response's stop reason is evaluated, so an attempt that aborted, errored, or produced an unusable summary is recorded whenever it consumed tokens.

#### Scenario: Successful batch summarization

- **WHEN** a flush summarizes a captured batch and the provider returns usage
- **THEN** one usage entry is appended with kind `context_prune` and a note naming the tool-call count and turn index

#### Scenario: Failed attempt that consumed tokens

- **WHEN** a summarizer attempt returns a response whose stop reason is `error` or `aborted`, and that response carries usage
- **THEN** the usage entry is still appended, before the failure is classified or the abort propagates

#### Scenario: Chain range fusion

- **WHEN** chain compression fuses per-batch summaries through the range summarizer
- **THEN** the appended entry's note identifies the call as a range fusion rather than a batch summarization

#### Scenario: Provider-reported model

- **WHEN** the response carries a `responseModel` that differs from the requested `model`
- **THEN** the usage entry records `responseModel`, so the spend is attributed to what actually served the request

### Requirement: Usage reporting SHALL degrade silently and never fail a prune

The session manager reachable from an extension context is typed read-only, so the usage-appending capability SHALL be feature-detected at call time. A host that does not provide it SHALL result in no reporting and no error, and a failure inside reporting SHALL be surfaced as a notification without propagating to the caller.

#### Scenario: Host without the capability

- **WHEN** the session manager exposes no usage-appending method
- **THEN** the summarizer call completes normally and no usage entry is written

#### Scenario: Reporting throws

- **WHEN** appending the usage entry throws
- **THEN** the error is passed to the caller's error notifier, the exception does not propagate, and the prune outcome is unaffected

### Requirement: Local stats SHALL count the same attempts as the reported usage

The extension's own cumulative stats SHALL be updated at the same point where usage is reported, so the totals surfaced in the footer widget and persisted in stats entries cannot diverge from the totals Pi records for the session. No attempt SHALL be counted twice.

#### Scenario: One attempt, one count

- **WHEN** a summarizer attempt returns a response with usage
- **THEN** the stats accumulator records that usage exactly once, and exactly one Pi usage entry is appended for it

#### Scenario: Fallback retry

- **WHEN** a primary-model attempt fails after consuming tokens and the fallback model retries
- **THEN** both attempts appear in the stats totals and both have their own usage entry

