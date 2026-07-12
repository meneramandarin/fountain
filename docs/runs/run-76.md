# Pipeline Run 76

## Run summary

| Field | Value |
| --- | --- |
| Command | drain |
| Status | completed |
| Dry run | no |
| Started | 2026-07-12T07:24:14.640Z |
| Finished | 2026-07-12T07:29:16.138Z |
| Budget | $435.14 |
| Estimated spend | $0.00 |

## Arguments

```json
{
  "apply": true,
  "budget": "435.14",
  "concurrency": "32",
  "positional": [],
  "task": "image_harvest"
}
```

## Recorded counts

| Metric | Value |
| --- | --- |
| backlog | {"done":1550} |
| budgetExhausted | false |
| deferred | 0 |
| dispatched | 1550 |
| done | 1550 |
| failed | 0 |
| failureRate | 0 |
| failureRateHalted | false |
| failureRateWindowFailures | 0 |
| failureRateWindowTasks | 500 |
| queue | {"done":1550} |
| queueDrained | true |
| retried | 0 |
| retryPending | 0 |
| spendUsd | 0 |

## Task outcomes

| Status | Count |
| --- | ---: |
| done | 1550 |
| **Total** | **1550** |

## Current `image_harvest` backlog

| Status | Count |
| --- | ---: |
| done | 1550 |
| **Total** | **1550** |

## Entity change events

| Entity type | Action | Reason | Count |
| --- | --- | --- | ---: |
| images | insert | image_harvest | 1113 |
| **Total** |  |  | **1113** |

## External call totals

| Metric | Value |
| --- | ---: |
| Calls | 0 |
| Input tokens | 0 |
| Output tokens | 0 |
| Total tokens | 0 |
| Estimated cost | $0.00 |

## External calls

_No external calls were recorded for this run._
