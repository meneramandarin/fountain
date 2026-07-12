# Pipeline Run 21

## Run summary

| Field | Value |
| --- | --- |
| Command | drain |
| Status | completed |
| Dry run | no |
| Started | 2026-07-12T02:19:42.381Z |
| Finished | 2026-07-12T02:21:42.090Z |
| Budget | $3.00 |
| Estimated spend | $0.01513 |

## Arguments

```json
{
  "apply": true,
  "budget": "3",
  "concurrency": "2",
  "positional": [],
  "stage": "all",
  "task": "legitimacy_check"
}
```

## Recorded counts

| Metric | Value |
| --- | --- |
| backlog | {"done":300} |
| budgetExhausted | false |
| deferred | 35 |
| dispatched | 335 |
| done | 300 |
| failed | 0 |
| queue | {"done":300} |
| queueDrained | true |
| retried | 0 |
| retryPending | 0 |
| spendUsd | 0.01513035 |
| stages | {"stage_1":{"budgetExhausted":false,"deferred":35,"dispatched":300,"done":265,"failed":0,"queueDrained":true,"retried":0,"spendUsd":0.01214775},"stage_2":{"budgetExhausted":false,"deferred":0,"dispatched":35,"done":35,"failed":0,"queueDrained":true,"retried":0,"spendUsd":0.01513035}} |

## Task outcomes

| Status | Count |
| --- | ---: |
| done | 300 |
| **Total** | **300** |

## Current `legitimacy_check` backlog

| Status | Count |
| --- | ---: |
| done | 300 |
| **Total** | **300** |

## External call totals

| Metric | Value |
| --- | ---: |
| Calls | 20 |
| Input tokens | 57881 |
| Output tokens | 10747 |
| Total tokens | 68628 |
| Estimated cost | $0.01513 |

### By provider

| Provider | Calls | Estimated cost |
| --- | ---: | ---: |
| openrouter | 20 | $0.01513 |

### By call status

| Status | Calls |
| --- | ---: |
| ok | 20 |

## External calls

| ID | Provider | Type | Status | HTTP | Model | Tokens | Cost | Created |
| ---: | --- | --- | --- | ---: | --- | ---: | ---: | --- |
| 2 | openrouter | legitimacy_stage_1 | ok | 200 | openai/gpt-4o-mini | 3030 | $0.0007551 | 2026-07-12T02:19:52.624Z |
| 3 | openrouter | legitimacy_stage_1 | ok | 200 | openai/gpt-4o-mini | 3270 | $0.00078345 | 2026-07-12T02:19:55.719Z |
| 4 | openrouter | legitimacy_stage_1 | ok | 200 | openai/gpt-4o-mini | 3526 | $0.00081645 | 2026-07-12T02:20:02.087Z |
| 5 | openrouter | legitimacy_stage_1 | ok | 200 | openai/gpt-4o-mini | 3733 | $0.000861 | 2026-07-12T02:20:08.130Z |
| 6 | openrouter | legitimacy_stage_1 | ok | 200 | openai/gpt-4o-mini | 3603 | $0.00084375 | 2026-07-12T02:20:15.598Z |
| 7 | openrouter | legitimacy_stage_1 | ok | 200 | openai/gpt-4o-mini | 3507 | $0.0007983 | 2026-07-12T02:20:20.349Z |
| 8 | openrouter | legitimacy_stage_1 | ok | 200 | openai/gpt-4o-mini | 3576 | $0.0008469 | 2026-07-12T02:20:27.241Z |
| 9 | openrouter | legitimacy_stage_1 | ok | 200 | openai/gpt-4o-mini | 3601 | $0.0008502 | 2026-07-12T02:20:31.897Z |
| 10 | openrouter | legitimacy_stage_1 | ok | 200 | openai/gpt-4o-mini | 3648 | $0.00084015 | 2026-07-12T02:20:37.892Z |
| 11 | openrouter | legitimacy_stage_1 | ok | 200 | openai/gpt-4o-mini | 2946 | $0.0007497 | 2026-07-12T02:20:46.762Z |
| 12 | openrouter | legitimacy_stage_1 | ok | 200 | openai/gpt-4o-mini | 3504 | $0.00082125 | 2026-07-12T02:20:50.800Z |
| 13 | openrouter | legitimacy_stage_1 | ok | 200 | openai/gpt-4o-mini | 3100 | $0.00075255 | 2026-07-12T02:20:58.707Z |
| 14 | openrouter | legitimacy_stage_1 | ok | 200 | openai/gpt-4o-mini | 3515 | $0.00081885 | 2026-07-12T02:21:02.852Z |
| 15 | openrouter | legitimacy_stage_1 | ok | 200 | openai/gpt-4o-mini | 3339 | $0.0007956 | 2026-07-12T02:21:09.732Z |
| 16 | openrouter | legitimacy_stage_1 | ok | 200 | openai/gpt-4o-mini | 3546 | $0.0008145 | 2026-07-12T02:21:13.759Z |
| 17 | openrouter | legitimacy_stage_2 | ok | 200 | openai/gpt-4o-mini | 2898 | $0.00050085 | 2026-07-12T02:21:26.456Z |
| 18 | openrouter | legitimacy_stage_2 | ok | 200 | openai/gpt-4o-mini | 4402 | $0.0007539 | 2026-07-12T02:21:28.731Z |
| 19 | openrouter | legitimacy_stage_2 | ok | 200 | openai/gpt-4o-mini | 3307 | $0.00058425 | 2026-07-12T02:21:37.137Z |
| 20 | openrouter | legitimacy_stage_2 | ok | 200 | openai/gpt-4o-mini | 4900 | $0.00085785 | 2026-07-12T02:21:37.608Z |
| 21 | openrouter | legitimacy_stage_2 | ok | 200 | openai/gpt-4o-mini | 1677 | $0.00028575 | 2026-07-12T02:21:41.274Z |
