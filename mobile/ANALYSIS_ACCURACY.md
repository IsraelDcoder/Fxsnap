# Single-setup chart analysis

## Request flow

1. The client sends the selected chart image, pair, and timeframe to `/analyze-chart`.
2. The server makes one OpenRouter vision request for the complete setup JSON. A configured Twelve Data quote is added to the model context; without a quote, the request proceeds using chart levels.
3. The server validates the response, recomputes risk/reward, and returns it. A validation failure gets one retry with the exact failure reason. A second failure returns an error without a trade fallback.

`FXSNAP_SINGLE_SETUP_ANALYSIS_ENABLED` gates the route and is off unless explicitly set to `true`. The legacy analysis pipeline has been removed; turning the flag off disables chart analysis rather than selecting the old pipeline.

## Validation and billing

- Require the response schema, numeric price fields, and at least one numeric support and resistance level.
- Require the selected pair and timeframe to match the response.
- Enforce BUY/SELL level ordering and recompute risk/reward; require at least 1.5R and return the recomputed value.
- Require entry to be within 2% of the live quote or within the returned support/resistance range; use the range when no live quote is available.
- Increment the free-analysis counter only after a validated `ok` response. Non-chart images, retries, and failures do not consume it.
- The client enables Save and Share only for a complete setup that passes its structural and risk/reward checks.

## Provider and monitoring

The existing server-side quote adapter is Twelve Data, configured with `TWELVEDATA_API_KEY`. It is the recommended provider already integrated in this repository. Confirm symbol coverage, entitlements, pricing, and data licensing for every supported asset before rollout; if no quote is returned, analysis runs without live price.

Each request writes its generated image ID, raw model JSON, validation result, retry count, and outcome to server logs. Thirty-day counters log an alert when incomplete successes exceed 2% or retrying requests exceed 10%. These are log alerts; an external paging/notification destination is not configured here.

## Release validation status

The requested 60-chart comparison across 2–3 OpenRouter vision models and 20 human chart checks have not been run: no approved chart corpus or reference labels are present in this workspace. The default model setting is a configuration fallback, not a benchmark winner. Do not roll out until the comparison table, human checks, and operational review are complete.

The live deployment commit could not be established from the local repository metadata. The local committed baseline and uncommitted changes do not prove which commit is running in production.
