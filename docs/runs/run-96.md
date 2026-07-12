# Pipeline Run 96

## Run summary

| Field | Value |
| --- | --- |
| Command | drain |
| Status | completed |
| Dry run | no |
| Started | 2026-07-12T09:00:37.892Z |
| Finished | 2026-07-12T09:03:15.763Z |
| Budget | $389.95 |
| Estimated spend | $0.014699 |

## Arguments

```json
{
  "apply": true,
  "budget": "389.95",
  "campaign": "enrichment_menu_retry_v1",
  "concurrency": "24",
  "positional": [],
  "task": "menu_extract"
}
```

## Recorded counts

| Metric | Value |
| --- | --- |
| backlog | {"done":5525,"failed":4} |
| budgetExhausted | false |
| deferred | 0 |
| dispatched | 5 |
| done | 4 |
| failed | 0 |
| failureRate | 0.2 |
| failureRateHalted | false |
| failureRateWindowFailures | 1 |
| failureRateWindowTasks | 5 |
| queue | {"done":4} |
| queueDrained | true |
| retried | 1 |
| retryPending | 0 |
| spendUsd | 0.0146994 |

## Task outcomes

| Status | Count |
| --- | ---: |
| done | 4 |
| **Total** | **4** |

## Current `menu_extract` backlog

| Status | Count |
| --- | ---: |
| done | 5525 |
| failed | 4 |
| **Total** | **5529** |

## Entity change events

| Entity type | Action | Reason | Count |
| --- | --- | --- | ---: |
| offerings | insert | menu_extract:offering_insert | 82 |
| **Total** |  |  | **82** |

## External call totals

| Metric | Value |
| --- | ---: |
| Calls | 5 |
| Input tokens | 15908 |
| Output tokens | 20522 |
| Total tokens | 36430 |
| Estimated cost | $0.014699 |

### By provider

| Provider | Calls | Estimated cost |
| --- | ---: | ---: |
| openrouter | 5 | $0.014699 |

### By call status

| Status | Calls |
| --- | ---: |
| ok | 5 |

## External calls

| ID | Provider | Type | Status | HTTP | Model | Tokens | Cost | Created |
| ---: | --- | --- | --- | ---: | --- | ---: | ---: | --- |
| 31126 | openrouter | menu_extract | ok | 200 | openai/gpt-4o-mini | 6216 | $0.00215955 | 2026-07-12T09:01:04.734Z |
| 31127 | openrouter | menu_extract | ok | 200 | openai/gpt-4o-mini | 7308 | $0.0023256 | 2026-07-12T09:01:16.918Z |
| 31128 | openrouter | menu_extract | ok | 200 | openai/gpt-4o-mini | 7067 | $0.00224715 | 2026-07-12T09:01:24.604Z |
| 31129 | openrouter | menu_extract | ok | 200 | openai/gpt-4o-mini | 6507 | $0.00313605 | 2026-07-12T09:01:42.691Z |
| 31130 | openrouter | menu_extract | ok | 200 | openai/gpt-4o-mini | 9332 | $0.00483105 | 2026-07-12T09:03:13.568Z |
