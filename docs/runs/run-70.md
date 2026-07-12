# Pipeline Run 70

## Run summary

| Field | Value |
| --- | --- |
| Command | drain |
| Status | completed |
| Dry run | no |
| Started | 2026-07-12T07:01:21.297Z |
| Finished | 2026-07-12T07:21:38.248Z |
| Budget | $436.67 |
| Estimated spend | $1.533566 |

## Arguments

```json
{
  "apply": true,
  "budget": "436.67",
  "concurrency": "32",
  "positional": [],
  "task": "contact_fill"
}
```

## Recorded counts

| Metric | Value |
| --- | --- |
| backlog | {"done":5518} |
| budgetExhausted | false |
| deferred | 0 |
| dispatched | 5518 |
| done | 5518 |
| failed | 0 |
| failureRate | 0 |
| failureRateHalted | false |
| failureRateWindowFailures | 0 |
| failureRateWindowTasks | 500 |
| queue | {"done":5518} |
| queueDrained | true |
| retried | 0 |
| retryPending | 0 |
| spendUsd | 1.53356635 |

## Task outcomes

| Status | Count |
| --- | ---: |
| done | 5518 |
| **Total** | **5518** |

## Current `contact_fill` backlog

| Status | Count |
| --- | ---: |
| done | 5518 |
| **Total** | **5518** |

## Entity change events

| Entity type | Action | Reason | Count |
| --- | --- | --- | ---: |
| locations | update | contact_fill:address | 39 |
| locations | update | contact_fill:email | 1165 |
| locations | update | contact_fill:phone | 252 |
| locations | update | contact_fill:website | 113 |
| **Total** |  |  | **1569** |

## External call totals

| Metric | Value |
| --- | ---: |
| Calls | 272 |
| Input tokens | 956653 |
| Output tokens | 50114 |
| Total tokens | 1006767 |
| Estimated cost | $1.533566 |

### By provider

| Provider | Calls | Estimated cost |
| --- | ---: | ---: |
| openrouter | 272 | $1.533566 |

### By call status

| Status | Calls |
| --- | ---: |
| ok | 272 |

## External calls

| ID | Provider | Type | Status | HTTP | Model | Tokens | Cost | Created |
| ---: | --- | --- | --- | ---: | --- | ---: | ---: | --- |
| 13016 | openrouter | website_discovery_web_search | ok | 200 | openai/gpt-4o-mini | 4510 | $0.0057584 | 2026-07-12T07:01:51.991Z |
| 13017 | openrouter | website_discovery_web_search | ok | 200 | openai/gpt-4o-mini | 4444 | $0.0057332 | 2026-07-12T07:02:05.013Z |
| 13018 | openrouter | website_discovery_web_search | ok | 200 | openai/gpt-4o-mini | 3547 | $0.0056135 | 2026-07-12T07:02:51.801Z |
| 13019 | openrouter | website_discovery_web_search | ok | 200 | openai/gpt-4o-mini | 4272 | $0.0057308 | 2026-07-12T07:03:21.145Z |
| 13020 | openrouter | website_discovery_web_search | ok | 200 | openai/gpt-4o-mini | 3887 | $0.0056708 | 2026-07-12T07:04:54.949Z |
| 13021 | openrouter | website_discovery_web_search | ok | 200 | openai/gpt-4o-mini | 4826 | $0.00582965 | 2026-07-12T07:05:02.252Z |
| 13022 | openrouter | website_discovery_web_search | ok | 200 | openai/gpt-4o-mini | 3617 | $0.00560825 | 2026-07-12T07:05:07.988Z |
| 13023 | openrouter | website_discovery_web_search | ok | 200 | openai/gpt-4o-mini | 5274 | $0.0058676 | 2026-07-12T07:05:10.422Z |
| 13024 | openrouter | website_discovery_web_search | ok | 200 | openai/gpt-4o-mini | 3110 | $0.00555875 | 2026-07-12T07:05:14.271Z |
| 13025 | openrouter | website_discovery_web_search | ok | 200 | openai/gpt-4o-mini | 3819 | $0.00567005 | 2026-07-12T07:05:15.881Z |
| 13026 | openrouter | website_discovery_web_search | ok | 200 | openai/gpt-4o-mini | 3873 | $0.0056498 | 2026-07-12T07:05:19.490Z |
| 13027 | openrouter | website_discovery_web_search | ok | 200 | openai/gpt-4o-mini | 3432 | $0.00564575 | 2026-07-12T07:05:20.772Z |
| 13028 | openrouter | website_discovery_web_search | ok | 200 | openai/gpt-4o-mini | 3966 | $0.00568445 | 2026-07-12T07:05:34.575Z |
| 13029 | openrouter | website_discovery_web_search | ok | 200 | openai/gpt-4o-mini | 5359 | $0.00592085 | 2026-07-12T07:05:42.323Z |
| 13030 | openrouter | website_discovery_web_search | ok | 200 | openai/gpt-4o-mini | 3917 | $0.00567665 | 2026-07-12T07:05:47.741Z |
| 13031 | openrouter | website_discovery_web_search | ok | 200 | openai/gpt-4o-mini | 3012 | $0.00552875 | 2026-07-12T07:06:25.457Z |
| 13032 | openrouter | website_discovery_web_search | ok | 200 | openai/gpt-4o-mini | 2643 | $0.0054689 | 2026-07-12T07:06:25.548Z |
| 13033 | openrouter | website_discovery_web_search | ok | 200 | openai/gpt-4o-mini | 2884 | $0.00549425 | 2026-07-12T07:06:26.593Z |
| 13034 | openrouter | website_discovery_web_search | ok | 200 | openai/gpt-4o-mini | 3168 | $0.005567 | 2026-07-12T07:06:26.972Z |
| 13035 | openrouter | website_discovery_web_search | ok | 200 | openai/gpt-4o-mini | 3277 | $0.00556625 | 2026-07-12T07:06:27.100Z |
| 13036 | openrouter | website_discovery_web_search | ok | 200 | openai/gpt-4o-mini | 3048 | $0.0055175 | 2026-07-12T07:06:27.134Z |
| 13037 | openrouter | website_discovery_web_search | ok | 200 | openai/gpt-4o-mini | 3813 | $0.005639 | 2026-07-12T07:06:27.143Z |
| 13038 | openrouter | website_discovery_web_search | ok | 200 | openai/gpt-4o-mini | 2644 | $0.00546365 | 2026-07-12T07:06:27.464Z |
| 13039 | openrouter | website_discovery_web_search | ok | 200 | openai/gpt-4o-mini | 3164 | $0.0055439 | 2026-07-12T07:06:27.662Z |
| 13040 | openrouter | website_discovery_web_search | ok | 200 | openai/gpt-4o-mini | 2817 | $0.0055004 | 2026-07-12T07:06:27.929Z |
| 13041 | openrouter | website_discovery_web_search | ok | 200 | openai/gpt-4o-mini | 2578 | $0.0054425 | 2026-07-12T07:06:28.132Z |
| 13042 | openrouter | website_discovery_web_search | ok | 200 | openai/gpt-4o-mini | 3957 | $0.0056552 | 2026-07-12T07:06:28.173Z |
| 13043 | openrouter | website_discovery_web_search | ok | 200 | openai/gpt-4o-mini | 3331 | $0.00557705 | 2026-07-12T07:06:28.691Z |
| 13044 | openrouter | website_discovery_web_search | ok | 200 | openai/gpt-4o-mini | 2999 | $0.00552725 | 2026-07-12T07:06:29.088Z |
| 13045 | openrouter | website_discovery_web_search | ok | 200 | openai/gpt-4o-mini | 2930 | $0.005507 | 2026-07-12T07:06:29.212Z |
| 13046 | openrouter | website_discovery_web_search | ok | 200 | openai/gpt-4o-mini | 4477 | $0.00578765 | 2026-07-12T07:06:32.625Z |
| 13047 | openrouter | website_discovery_web_search | ok | 200 | openai/gpt-4o-mini | 3142 | $0.00553745 | 2026-07-12T07:06:34.464Z |
| 13048 | openrouter | website_discovery_web_search | ok | 200 | openai/gpt-4o-mini | 4109 | $0.0056969 | 2026-07-12T07:06:34.468Z |
| 13049 | openrouter | website_discovery_web_search | ok | 200 | openai/gpt-4o-mini | 2729 | $0.005489 | 2026-07-12T07:06:35.350Z |
| 13050 | openrouter | website_discovery_web_search | ok | 200 | openai/gpt-4o-mini | 2702 | $0.00547415 | 2026-07-12T07:06:35.399Z |
| 13051 | openrouter | website_discovery_web_search | ok | 200 | openai/gpt-4o-mini | 3683 | $0.0056294 | 2026-07-12T07:06:35.578Z |
| 13052 | openrouter | website_discovery_web_search | ok | 200 | openai/gpt-4o-mini | 4318 | $0.00571925 | 2026-07-12T07:06:35.580Z |
| 13053 | openrouter | website_discovery_web_search | ok | 200 | openai/gpt-4o-mini | 3027 | $0.00551435 | 2026-07-12T07:06:35.640Z |
| 13054 | openrouter | website_discovery_web_search | ok | 200 | openai/gpt-4o-mini | 3162 | $0.00553865 | 2026-07-12T07:06:35.712Z |
| 13055 | openrouter | website_discovery_web_search | ok | 200 | openai/gpt-4o-mini | 4085 | $0.00568205 | 2026-07-12T07:06:35.753Z |
| 13056 | openrouter | website_discovery_web_search | ok | 200 | openai/gpt-4o-mini | 3065 | $0.0055682 | 2026-07-12T07:06:35.756Z |
| 13057 | openrouter | website_discovery_web_search | ok | 200 | openai/gpt-4o-mini | 2891 | $0.00550385 | 2026-07-12T07:06:35.838Z |
| 13058 | openrouter | website_discovery_web_search | ok | 200 | openai/gpt-4o-mini | 2720 | $0.00546785 | 2026-07-12T07:06:35.839Z |
| 13059 | openrouter | website_discovery_web_search | ok | 200 | openai/gpt-4o-mini | 3237 | $0.0055472 | 2026-07-12T07:06:35.985Z |
| 13060 | openrouter | website_discovery_web_search | ok | 200 | openai/gpt-4o-mini | 3792 | $0.0056345 | 2026-07-12T07:06:36.487Z |
| 13061 | openrouter | website_discovery_web_search | ok | 200 | openai/gpt-4o-mini | 2866 | $0.0054974 | 2026-07-12T07:06:36.733Z |
| 13062 | openrouter | website_discovery_web_search | ok | 200 | openai/gpt-4o-mini | 3156 | $0.00554945 | 2026-07-12T07:06:36.896Z |
| 13063 | openrouter | website_discovery_web_search | ok | 200 | openai/gpt-4o-mini | 3073 | $0.00554735 | 2026-07-12T07:06:36.978Z |
| 13064 | openrouter | website_discovery_web_search | ok | 200 | openai/gpt-4o-mini | 3816 | $0.0056858 | 2026-07-12T07:06:37.104Z |
| 13065 | openrouter | website_discovery_web_search | ok | 200 | openai/gpt-4o-mini | 3022 | $0.0055415 | 2026-07-12T07:06:37.344Z |
| 13066 | openrouter | website_discovery_web_search | ok | 200 | openai/gpt-4o-mini | 3752 | $0.005633 | 2026-07-12T07:06:37.637Z |
| 13067 | openrouter | website_discovery_web_search | ok | 200 | openai/gpt-4o-mini | 4219 | $0.0057035 | 2026-07-12T07:06:37.689Z |
| 13068 | openrouter | website_discovery_web_search | ok | 200 | openai/gpt-4o-mini | 2936 | $0.00551015 | 2026-07-12T07:06:37.803Z |
| 13069 | openrouter | website_discovery_web_search | ok | 200 | openai/gpt-4o-mini | 3396 | $0.00558365 | 2026-07-12T07:06:37.831Z |
| 13070 | openrouter | website_discovery_web_search | ok | 200 | openai/gpt-4o-mini | 3791 | $0.005633 | 2026-07-12T07:06:38.011Z |
| 13071 | openrouter | website_discovery_web_search | ok | 200 | openai/gpt-4o-mini | 3231 | $0.0055661 | 2026-07-12T07:06:38.700Z |
| 13072 | openrouter | website_discovery_web_search | ok | 200 | openai/gpt-4o-mini | 2869 | $0.0054974 | 2026-07-12T07:06:38.842Z |
| 13073 | openrouter | website_discovery_web_search | ok | 200 | openai/gpt-4o-mini | 4815 | $0.005828 | 2026-07-12T07:06:38.867Z |
| 13074 | openrouter | website_discovery_web_search | ok | 200 | openai/gpt-4o-mini | 3539 | $0.00560465 | 2026-07-12T07:06:38.879Z |
| 13075 | openrouter | website_discovery_web_search | ok | 200 | openai/gpt-4o-mini | 3755 | $0.00567305 | 2026-07-12T07:06:39.030Z |
| 13076 | openrouter | website_discovery_web_search | ok | 200 | openai/gpt-4o-mini | 3815 | $0.00563435 | 2026-07-12T07:06:39.315Z |
| 13077 | openrouter | website_discovery_web_search | ok | 200 | openai/gpt-4o-mini | 4033 | $0.00568415 | 2026-07-12T07:06:39.357Z |
| 13078 | openrouter | website_discovery_web_search | ok | 200 | openai/gpt-4o-mini | 3050 | $0.0055124 | 2026-07-12T07:06:43.751Z |
| 13079 | openrouter | website_discovery_web_search | ok | 200 | openai/gpt-4o-mini | 2572 | $0.005447 | 2026-07-12T07:06:44.018Z |
| 13080 | openrouter | website_discovery_web_search | ok | 200 | openai/gpt-4o-mini | 2533 | $0.00545015 | 2026-07-12T07:06:45.409Z |
| 13081 | openrouter | website_discovery_web_search | ok | 200 | openai/gpt-4o-mini | 4303 | $0.0057134 | 2026-07-12T07:06:45.984Z |
| 13082 | openrouter | website_discovery_web_search | ok | 200 | openai/gpt-4o-mini | 4348 | $0.0057485 | 2026-07-12T07:06:46.248Z |
| 13083 | openrouter | website_discovery_web_search | ok | 200 | openai/gpt-4o-mini | 3912 | $0.0056471 | 2026-07-12T07:06:46.991Z |
| 13084 | openrouter | website_discovery_web_search | ok | 200 | openai/gpt-4o-mini | 2681 | $0.00548315 | 2026-07-12T07:06:47.392Z |
| 13085 | openrouter | website_discovery_web_search | ok | 200 | openai/gpt-4o-mini | 2863 | $0.00550595 | 2026-07-12T07:06:47.501Z |
| 13086 | openrouter | website_discovery_web_search | ok | 200 | openai/gpt-4o-mini | 2431 | $0.0054299 | 2026-07-12T07:06:47.767Z |
| 13087 | openrouter | website_discovery_web_search | ok | 200 | openai/gpt-4o-mini | 3202 | $0.00554735 | 2026-07-12T07:06:48.333Z |
| 13088 | openrouter | website_discovery_web_search | ok | 200 | openai/gpt-4o-mini | 3973 | $0.005672 | 2026-07-12T07:06:48.604Z |
| 13089 | openrouter | website_discovery_web_search | ok | 200 | openai/gpt-4o-mini | 2795 | $0.0054791 | 2026-07-12T07:06:48.718Z |
| 13090 | openrouter | website_discovery_web_search | ok | 200 | openai/gpt-4o-mini | 3572 | $0.00559835 | 2026-07-12T07:06:49.180Z |
| 13091 | openrouter | website_discovery_web_search | ok | 200 | openai/gpt-4o-mini | 3596 | $0.0056204 | 2026-07-12T07:06:50.344Z |
| 13092 | openrouter | website_discovery_web_search | ok | 200 | openai/gpt-4o-mini | 3905 | $0.0056573 | 2026-07-12T07:06:50.706Z |
| 13093 | openrouter | website_discovery_web_search | ok | 200 | openai/gpt-4o-mini | 2580 | $0.00545045 | 2026-07-12T07:06:50.938Z |
| 13094 | openrouter | website_discovery_web_search | ok | 200 | openai/gpt-4o-mini | 3933 | $0.0056687 | 2026-07-12T07:06:51.674Z |
| 13095 | openrouter | website_discovery_web_search | ok | 200 | openai/gpt-4o-mini | 3711 | $0.0056426 | 2026-07-12T07:06:51.773Z |
| 13096 | openrouter | website_discovery_web_search | ok | 200 | openai/gpt-4o-mini | 4172 | $0.0056915 | 2026-07-12T07:06:51.853Z |
| 13097 | openrouter | website_discovery_web_search | ok | 200 | openai/gpt-4o-mini | 3399 | $0.00559175 | 2026-07-12T07:06:52.024Z |
| 13098 | openrouter | website_discovery_web_search | ok | 200 | openai/gpt-4o-mini | 2913 | $0.0055139 | 2026-07-12T07:06:52.025Z |
| 13099 | openrouter | website_discovery_web_search | ok | 200 | openai/gpt-4o-mini | 2917 | $0.00553115 | 2026-07-12T07:06:52.384Z |
| 13100 | openrouter | website_discovery_web_search | ok | 200 | openai/gpt-4o-mini | 3068 | $0.00552545 | 2026-07-12T07:06:52.434Z |
| 13101 | openrouter | website_discovery_web_search | ok | 200 | openai/gpt-4o-mini | 3700 | $0.0056162 | 2026-07-12T07:06:52.458Z |
| 13102 | openrouter | website_discovery_web_search | ok | 200 | openai/gpt-4o-mini | 3492 | $0.00559715 | 2026-07-12T07:06:52.652Z |
| 13103 | openrouter | website_discovery_web_search | ok | 200 | openai/gpt-4o-mini | 3930 | $0.00567725 | 2026-07-12T07:06:52.851Z |
| 13104 | openrouter | website_discovery_web_search | ok | 200 | openai/gpt-4o-mini | 3040 | $0.0055181 | 2026-07-12T07:06:53.365Z |
| 13105 | openrouter | website_discovery_web_search | ok | 200 | openai/gpt-4o-mini | 3837 | $0.00565565 | 2026-07-12T07:06:53.903Z |
| 13106 | openrouter | website_discovery_web_search | ok | 200 | openai/gpt-4o-mini | 3229 | $0.00555095 | 2026-07-12T07:06:54.015Z |
| 13107 | openrouter | website_discovery_web_search | ok | 200 | openai/gpt-4o-mini | 4637 | $0.00578735 | 2026-07-12T07:06:54.286Z |
| 13108 | openrouter | website_discovery_web_search | ok | 200 | openai/gpt-4o-mini | 2923 | $0.0055019 | 2026-07-12T07:06:55.552Z |
| 13109 | openrouter | website_discovery_web_search | ok | 200 | openai/gpt-4o-mini | 3633 | $0.0056102 | 2026-07-12T07:06:55.660Z |
| 13110 | openrouter | website_discovery_web_search | ok | 200 | openai/gpt-4o-mini | 3871 | $0.00567335 | 2026-07-12T07:06:56.939Z |
| 13111 | openrouter | website_discovery_web_search | ok | 200 | openai/gpt-4o-mini | 2916 | $0.00552785 | 2026-07-12T07:06:58.321Z |
| 13112 | openrouter | website_discovery_web_search | ok | 200 | openai/gpt-4o-mini | 3256 | $0.00556985 | 2026-07-12T07:06:58.624Z |
| 13113 | openrouter | website_discovery_web_search | ok | 200 | openai/gpt-4o-mini | 3738 | $0.00562415 | 2026-07-12T07:06:59.097Z |
| 13114 | openrouter | website_discovery_web_search | ok | 200 | openai/gpt-4o-mini | 3194 | $0.00553625 | 2026-07-12T07:06:59.743Z |
| 13115 | openrouter | website_discovery_web_search | ok | 200 | openai/gpt-4o-mini | 3468 | $0.0056012 | 2026-07-12T07:07:00.054Z |
| 13116 | openrouter | website_discovery_web_search | ok | 200 | openai/gpt-4o-mini | 3060 | $0.0055481 | 2026-07-12T07:07:00.142Z |
| 13117 | openrouter | website_discovery_web_search | ok | 200 | openai/gpt-4o-mini | 3118 | $0.00554465 | 2026-07-12T07:07:00.173Z |
| 13118 | openrouter | website_discovery_web_search | ok | 200 | openai/gpt-4o-mini | 3280 | $0.00556355 | 2026-07-12T07:07:00.483Z |
| 13119 | openrouter | website_discovery_web_search | ok | 200 | openai/gpt-4o-mini | 4110 | $0.00569615 | 2026-07-12T07:07:00.813Z |
| 13120 | openrouter | website_discovery_web_search | ok | 200 | openai/gpt-4o-mini | 3703 | $0.00562565 | 2026-07-12T07:07:00.896Z |
| 13121 | openrouter | website_discovery_web_search | ok | 200 | openai/gpt-4o-mini | 4036 | $0.0056702 | 2026-07-12T07:07:01.191Z |
| 13122 | openrouter | website_discovery_web_search | ok | 200 | openai/gpt-4o-mini | 4038 | $0.00567815 | 2026-07-12T07:07:01.551Z |
| 13123 | openrouter | website_discovery_web_search | ok | 200 | openai/gpt-4o-mini | 3579 | $0.00561695 | 2026-07-12T07:07:01.715Z |
| 13124 | openrouter | website_discovery_web_search | ok | 200 | openai/gpt-4o-mini | 3517 | $0.00560315 | 2026-07-12T07:07:03.011Z |
| 13125 | openrouter | website_discovery_web_search | ok | 200 | openai/gpt-4o-mini | 3165 | $0.0055391 | 2026-07-12T07:07:03.518Z |
| 13126 | openrouter | website_discovery_web_search | ok | 200 | openai/gpt-4o-mini | 3171 | $0.0055598 | 2026-07-12T07:07:04.524Z |
| 13127 | openrouter | website_discovery_web_search | ok | 200 | openai/gpt-4o-mini | 3557 | $0.00562085 | 2026-07-12T07:07:05.565Z |
| 13128 | openrouter | website_discovery_web_search | ok | 200 | openai/gpt-4o-mini | 3972 | $0.0057083 | 2026-07-12T07:07:06.121Z |
| 13129 | openrouter | website_discovery_web_search | ok | 200 | openai/gpt-4o-mini | 3664 | $0.005645 | 2026-07-12T07:07:06.496Z |
| 13130 | openrouter | website_discovery_web_search | ok | 200 | openai/gpt-4o-mini | 4236 | $0.00571595 | 2026-07-12T07:07:06.725Z |
| 13131 | openrouter | website_discovery_web_search | ok | 200 | openai/gpt-4o-mini | 4074 | $0.0056741 | 2026-07-12T07:07:06.770Z |
| 13132 | openrouter | website_discovery_web_search | ok | 200 | openai/gpt-4o-mini | 3921 | $0.00567365 | 2026-07-12T07:07:06.907Z |
| 13133 | openrouter | website_discovery_web_search | ok | 200 | openai/gpt-4o-mini | 3713 | $0.00562355 | 2026-07-12T07:07:07.332Z |
| 13134 | openrouter | website_discovery_web_search | ok | 200 | openai/gpt-4o-mini | 4270 | $0.0057116 | 2026-07-12T07:07:07.600Z |
| 13135 | openrouter | website_discovery_web_search | ok | 200 | openai/gpt-4o-mini | 3134 | $0.00553715 | 2026-07-12T07:07:07.914Z |
| 13136 | openrouter | website_discovery_web_search | ok | 200 | openai/gpt-4o-mini | 2575 | $0.0054533 | 2026-07-12T07:07:08.821Z |
| 13137 | openrouter | website_discovery_web_search | ok | 200 | openai/gpt-4o-mini | 3121 | $0.0055532 | 2026-07-12T07:11:42.069Z |
| 13138 | openrouter | website_discovery_web_search | ok | 200 | openai/gpt-4o-mini | 2986 | $0.0055181 | 2026-07-12T07:11:42.316Z |
| 13139 | openrouter | website_discovery_web_search | ok | 200 | openai/gpt-4o-mini | 3153 | $0.00554585 | 2026-07-12T07:11:42.486Z |
| 13140 | openrouter | website_discovery_web_search | ok | 200 | openai/gpt-4o-mini | 3513 | $0.005603 | 2026-07-12T07:11:42.748Z |
| 13141 | openrouter | website_discovery_web_search | ok | 200 | openai/gpt-4o-mini | 3823 | $0.0056549 | 2026-07-12T07:11:43.034Z |
| 13142 | openrouter | website_discovery_web_search | ok | 200 | openai/gpt-4o-mini | 3092 | $0.00553265 | 2026-07-12T07:11:43.347Z |
| 13143 | openrouter | website_discovery_web_search | ok | 200 | openai/gpt-4o-mini | 4489 | $0.00575075 | 2026-07-12T07:11:43.360Z |
| 13144 | openrouter | website_discovery_web_search | ok | 200 | openai/gpt-4o-mini | 2682 | $0.00546845 | 2026-07-12T07:11:43.659Z |
| 13145 | openrouter | website_discovery_web_search | ok | 200 | openai/gpt-4o-mini | 2939 | $0.0055133 | 2026-07-12T07:11:43.828Z |
| 13146 | openrouter | website_discovery_web_search | ok | 200 | openai/gpt-4o-mini | 3821 | $0.00565415 | 2026-07-12T07:11:43.863Z |
| 13147 | openrouter | website_discovery_web_search | ok | 200 | openai/gpt-4o-mini | 3804 | $0.0056462 | 2026-07-12T07:11:44.018Z |
| 13148 | openrouter | website_discovery_web_search | ok | 200 | openai/gpt-4o-mini | 3011 | $0.0055286 | 2026-07-12T07:11:44.082Z |
| 13149 | openrouter | website_discovery_web_search | ok | 200 | openai/gpt-4o-mini | 3026 | $0.0055484 | 2026-07-12T07:11:44.171Z |
| 13150 | openrouter | website_discovery_web_search | ok | 200 | openai/gpt-4o-mini | 3408 | $0.0055913 | 2026-07-12T07:11:44.732Z |
| 13151 | openrouter | website_discovery_web_search | ok | 200 | openai/gpt-4o-mini | 3724 | $0.00563015 | 2026-07-12T07:11:45.356Z |
| 13152 | openrouter | website_discovery_web_search | ok | 200 | openai/gpt-4o-mini | 3487 | $0.0056117 | 2026-07-12T07:11:45.407Z |
| 13153 | openrouter | website_discovery_web_search | ok | 200 | openai/gpt-4o-mini | 3033 | $0.0055661 | 2026-07-12T07:11:45.959Z |
| 13154 | openrouter | website_discovery_web_search | ok | 200 | openai/gpt-4o-mini | 3201 | $0.005558 | 2026-07-12T07:11:46.051Z |
| 13155 | openrouter | website_discovery_web_search | ok | 200 | openai/gpt-4o-mini | 3044 | $0.0055259 | 2026-07-12T07:11:46.119Z |
| 13156 | openrouter | website_discovery_web_search | ok | 200 | openai/gpt-4o-mini | 3119 | $0.0055601 | 2026-07-12T07:11:46.973Z |
| 13157 | openrouter | website_discovery_web_search | ok | 200 | openai/gpt-4o-mini | 4621 | $0.0057593 | 2026-07-12T07:11:47.052Z |
| 13158 | openrouter | website_discovery_web_search | ok | 200 | openai/gpt-4o-mini | 3805 | $0.00565355 | 2026-07-12T07:11:47.355Z |
| 13159 | openrouter | website_discovery_web_search | ok | 200 | openai/gpt-4o-mini | 3859 | $0.00568325 | 2026-07-12T07:11:47.793Z |
| 13160 | openrouter | website_discovery_web_search | ok | 200 | openai/gpt-4o-mini | 2680 | $0.00547085 | 2026-07-12T07:11:47.794Z |
| 13161 | openrouter | website_discovery_web_search | ok | 200 | openai/gpt-4o-mini | 2891 | $0.0055169 | 2026-07-12T07:11:47.888Z |
| 13162 | openrouter | website_discovery_web_search | ok | 200 | openai/gpt-4o-mini | 3022 | $0.00552305 | 2026-07-12T07:11:48.517Z |
| 13163 | openrouter | website_discovery_web_search | ok | 200 | openai/gpt-4o-mini | 5164 | $0.00585335 | 2026-07-12T07:11:48.605Z |
| 13164 | openrouter | website_discovery_web_search | ok | 200 | openai/gpt-4o-mini | 3613 | $0.00561215 | 2026-07-12T07:11:48.905Z |
| 13165 | openrouter | website_discovery_web_search | ok | 200 | openai/gpt-4o-mini | 3216 | $0.005549 | 2026-07-12T07:11:49.115Z |
| 13166 | openrouter | website_discovery_web_search | ok | 200 | openai/gpt-4o-mini | 3142 | $0.0055442 | 2026-07-12T07:11:49.406Z |
| 13167 | openrouter | website_discovery_web_search | ok | 200 | openai/gpt-4o-mini | 2947 | $0.00552215 | 2026-07-12T07:11:50.168Z |
| 13168 | openrouter | website_discovery_web_search | ok | 200 | openai/gpt-4o-mini | 3227 | $0.00556235 | 2026-07-12T07:11:50.734Z |
| 13169 | openrouter | website_discovery_web_search | ok | 200 | openai/gpt-4o-mini | 2997 | $0.00551435 | 2026-07-12T07:11:50.973Z |
| 13170 | openrouter | website_discovery_web_search | ok | 200 | openai/gpt-4o-mini | 4654 | $0.0057908 | 2026-07-12T07:11:52.079Z |
| 13171 | openrouter | website_discovery_web_search | ok | 200 | openai/gpt-4o-mini | 3142 | $0.00554195 | 2026-07-12T07:11:52.495Z |
| 13172 | openrouter | website_discovery_web_search | ok | 200 | openai/gpt-4o-mini | 2940 | $0.0055139 | 2026-07-12T07:11:52.591Z |
| 13173 | openrouter | website_discovery_web_search | ok | 200 | openai/gpt-4o-mini | 3051 | $0.005558 | 2026-07-12T07:11:53.042Z |
| 13174 | openrouter | website_discovery_web_search | ok | 200 | openai/gpt-4o-mini | 3203 | $0.0055502 | 2026-07-12T07:11:54.104Z |
| 13175 | openrouter | website_discovery_web_search | ok | 200 | openai/gpt-4o-mini | 2807 | $0.0055187 | 2026-07-12T07:11:54.212Z |
| 13176 | openrouter | website_discovery_web_search | ok | 200 | openai/gpt-4o-mini | 3094 | $0.0055487 | 2026-07-12T07:11:55.045Z |
| 13177 | openrouter | website_discovery_web_search | ok | 200 | openai/gpt-4o-mini | 4492 | $0.00575255 | 2026-07-12T07:11:56.354Z |
| 13178 | openrouter | website_discovery_web_search | ok | 200 | openai/gpt-4o-mini | 3766 | $0.00563735 | 2026-07-12T07:14:21.792Z |
| 13179 | openrouter | website_discovery_web_search | ok | 200 | openai/gpt-4o-mini | 4534 | $0.00577145 | 2026-07-12T07:15:05.325Z |
| 13180 | openrouter | website_discovery_web_search | ok | 200 | openai/gpt-4o-mini | 3549 | $0.00565565 | 2026-07-12T07:18:14.357Z |
| 13181 | openrouter | website_discovery_web_search | ok | 200 | openai/gpt-4o-mini | 3821 | $0.00564515 | 2026-07-12T07:18:15.853Z |
| 13182 | openrouter | website_discovery_web_search | ok | 200 | openai/gpt-4o-mini | 5280 | $0.00587975 | 2026-07-12T07:18:16.149Z |
| 13183 | openrouter | website_discovery_web_search | ok | 200 | openai/gpt-4o-mini | 3861 | $0.00565655 | 2026-07-12T07:18:16.447Z |
| 13184 | openrouter | website_discovery_web_search | ok | 200 | openai/gpt-4o-mini | 4779 | $0.00583205 | 2026-07-12T07:18:17.565Z |
| 13185 | openrouter | website_discovery_web_search | ok | 200 | openai/gpt-4o-mini | 3183 | $0.0055598 | 2026-07-12T07:18:20.302Z |
| 13186 | openrouter | website_discovery_web_search | ok | 200 | openai/gpt-4o-mini | 3494 | $0.00563435 | 2026-07-12T07:18:21.525Z |
| 13187 | openrouter | website_discovery_web_search | ok | 200 | openai/gpt-4o-mini | 3672 | $0.00562415 | 2026-07-12T07:18:22.224Z |
| 13188 | openrouter | website_discovery_web_search | ok | 200 | openai/gpt-4o-mini | 3388 | $0.0055991 | 2026-07-12T07:18:22.397Z |
| 13189 | openrouter | website_discovery_web_search | ok | 200 | openai/gpt-4o-mini | 3917 | $0.0057068 | 2026-07-12T07:18:24.321Z |
| 13190 | openrouter | website_discovery_web_search | ok | 200 | openai/gpt-4o-mini | 4220 | $0.00572165 | 2026-07-12T07:18:25.398Z |
| 13191 | openrouter | website_discovery_web_search | ok | 200 | openai/gpt-4o-mini | 3867 | $0.005675 | 2026-07-12T07:18:25.698Z |
| 13192 | openrouter | website_discovery_web_search | ok | 200 | openai/gpt-4o-mini | 4153 | $0.00573545 | 2026-07-12T07:18:25.910Z |
| 13193 | openrouter | website_discovery_web_search | ok | 200 | openai/gpt-4o-mini | 3422 | $0.00561995 | 2026-07-12T07:18:26.007Z |
| 13194 | openrouter | website_discovery_web_search | ok | 200 | openai/gpt-4o-mini | 4317 | $0.0057137 | 2026-07-12T07:18:26.556Z |
| 13195 | openrouter | website_discovery_web_search | ok | 200 | openai/gpt-4o-mini | 3781 | $0.0056621 | 2026-07-12T07:18:28.927Z |
| 13196 | openrouter | website_discovery_web_search | ok | 200 | openai/gpt-4o-mini | 3294 | $0.0055994 | 2026-07-12T07:18:30.659Z |
| 13197 | openrouter | website_discovery_web_search | ok | 200 | openai/gpt-4o-mini | 4365 | $0.00574295 | 2026-07-12T07:18:31.584Z |
| 13198 | openrouter | website_discovery_web_search | ok | 200 | openai/gpt-4o-mini | 3855 | $0.00571325 | 2026-07-12T07:18:35.579Z |
| 13199 | openrouter | website_discovery_web_search | ok | 200 | openai/gpt-4o-mini | 3898 | $0.0056954 | 2026-07-12T07:18:35.843Z |
| 13200 | openrouter | website_discovery_web_search | ok | 200 | openai/gpt-4o-mini | 4178 | $0.0056969 | 2026-07-12T07:18:39.446Z |
| 13201 | openrouter | website_discovery_web_search | ok | 200 | openai/gpt-4o-mini | 2999 | $0.00553985 | 2026-07-12T07:18:41.758Z |
| 13202 | openrouter | website_discovery_web_search | ok | 200 | openai/gpt-4o-mini | 3171 | $0.0055472 | 2026-07-12T07:18:42.100Z |
| 13203 | openrouter | website_discovery_web_search | ok | 200 | openai/gpt-4o-mini | 3482 | $0.00560915 | 2026-07-12T07:18:44.045Z |
| 13204 | openrouter | website_discovery_web_search | ok | 200 | openai/gpt-4o-mini | 4708 | $0.00579125 | 2026-07-12T07:18:45.081Z |
| 13205 | openrouter | website_discovery_web_search | ok | 200 | openai/gpt-4o-mini | 4642 | $0.00579035 | 2026-07-12T07:18:46.016Z |
| 13206 | openrouter | website_discovery_web_search | ok | 200 | openai/gpt-4o-mini | 3806 | $0.00566945 | 2026-07-12T07:18:47.974Z |
| 13207 | openrouter | website_discovery_web_search | ok | 200 | openai/gpt-4o-mini | 3192 | $0.0055787 | 2026-07-12T07:18:48.895Z |
| 13208 | openrouter | website_discovery_web_search | ok | 200 | openai/gpt-4o-mini | 4095 | $0.0056993 | 2026-07-12T07:18:49.708Z |
| 13209 | openrouter | website_discovery_web_search | ok | 200 | openai/gpt-4o-mini | 3766 | $0.00568235 | 2026-07-12T07:18:49.740Z |
| 13210 | openrouter | website_discovery_web_search | ok | 200 | openai/gpt-4o-mini | 3550 | $0.00562565 | 2026-07-12T07:18:49.808Z |
| 13211 | openrouter | website_discovery_web_search | ok | 200 | openai/gpt-4o-mini | 4438 | $0.0057386 | 2026-07-12T07:18:51.114Z |
| 13212 | openrouter | website_discovery_web_search | ok | 200 | openai/gpt-4o-mini | 3502 | $0.0056288 | 2026-07-12T07:18:53.256Z |
| 13213 | openrouter | website_discovery_web_search | ok | 200 | openai/gpt-4o-mini | 4563 | $0.00579245 | 2026-07-12T07:18:53.419Z |
| 13214 | openrouter | website_discovery_web_search | ok | 200 | openai/gpt-4o-mini | 3727 | $0.0056324 | 2026-07-12T07:18:55.225Z |
| 13215 | openrouter | website_discovery_web_search | ok | 200 | openai/gpt-4o-mini | 4003 | $0.00570215 | 2026-07-12T07:18:56.621Z |
| 13216 | openrouter | website_discovery_web_search | ok | 200 | openai/gpt-4o-mini | 3819 | $0.0056813 | 2026-07-12T07:18:56.896Z |
| 13217 | openrouter | website_discovery_web_search | ok | 200 | openai/gpt-4o-mini | 2603 | $0.00545615 | 2026-07-12T07:18:57.998Z |
| 13218 | openrouter | website_discovery_web_search | ok | 200 | openai/gpt-4o-mini | 3894 | $0.00564845 | 2026-07-12T07:19:02.095Z |
| 13219 | openrouter | website_discovery_web_search | ok | 200 | openai/gpt-4o-mini | 3155 | $0.00553445 | 2026-07-12T07:19:03.108Z |
| 13220 | openrouter | website_discovery_web_search | ok | 200 | openai/gpt-4o-mini | 4260 | $0.0057119 | 2026-07-12T07:19:04.861Z |
| 13221 | openrouter | website_discovery_web_search | ok | 200 | openai/gpt-4o-mini | 3074 | $0.0055556 | 2026-07-12T07:19:09.973Z |
| 13222 | openrouter | website_discovery_web_search | ok | 200 | openai/gpt-4o-mini | 3807 | $0.00565475 | 2026-07-12T07:19:10.777Z |
| 13223 | openrouter | website_discovery_web_search | ok | 200 | openai/gpt-4o-mini | 3292 | $0.00557075 | 2026-07-12T07:19:10.988Z |
| 13224 | openrouter | website_discovery_web_search | ok | 200 | openai/gpt-4o-mini | 4209 | $0.0057344 | 2026-07-12T07:19:11.304Z |
| 13225 | openrouter | website_discovery_web_search | ok | 200 | openai/gpt-4o-mini | 2923 | $0.00553115 | 2026-07-12T07:19:12.047Z |
| 13226 | openrouter | website_discovery_web_search | ok | 200 | openai/gpt-4o-mini | 5232 | $0.005864 | 2026-07-12T07:19:15.151Z |
| 13227 | openrouter | website_discovery_web_search | ok | 200 | openai/gpt-4o-mini | 3814 | $0.0056693 | 2026-07-12T07:19:16.943Z |
| 13228 | openrouter | website_discovery_web_search | ok | 200 | openai/gpt-4o-mini | 4696 | $0.00577775 | 2026-07-12T07:19:17.514Z |
| 13229 | openrouter | website_discovery_web_search | ok | 200 | openai/gpt-4o-mini | 3313 | $0.005573 | 2026-07-12T07:19:19.775Z |
| 13230 | openrouter | website_discovery_web_search | ok | 200 | openai/gpt-4o-mini | 4034 | $0.00571895 | 2026-07-12T07:19:19.856Z |
| 13231 | openrouter | website_discovery_web_search | ok | 200 | openai/gpt-4o-mini | 3966 | $0.0056651 | 2026-07-12T07:19:24.518Z |
| 13232 | openrouter | website_discovery_web_search | ok | 200 | openai/gpt-4o-mini | 5149 | $0.0058664 | 2026-07-12T07:19:26.111Z |
| 13233 | openrouter | website_discovery_web_search | ok | 200 | openai/gpt-4o-mini | 4753 | $0.00578855 | 2026-07-12T07:19:27.888Z |
| 13234 | openrouter | website_discovery_web_search | ok | 200 | openai/gpt-4o-mini | 4594 | $0.00575255 | 2026-07-12T07:19:31.429Z |
| 13235 | openrouter | website_discovery_web_search | ok | 200 | openai/gpt-4o-mini | 4590 | $0.0057767 | 2026-07-12T07:19:31.962Z |
| 13236 | openrouter | website_discovery_web_search | ok | 200 | openai/gpt-4o-mini | 4583 | $0.0058193 | 2026-07-12T07:19:32.367Z |
| 13237 | openrouter | website_discovery_web_search | ok | 200 | openai/gpt-4o-mini | 4533 | $0.0057875 | 2026-07-12T07:19:34.037Z |
| 13238 | openrouter | website_discovery_web_search | ok | 200 | openai/gpt-4o-mini | 4678 | $0.00583175 | 2026-07-12T07:19:35.346Z |
| 13239 | openrouter | website_discovery_web_search | ok | 200 | openai/gpt-4o-mini | 4627 | $0.00578675 | 2026-07-12T07:19:35.403Z |
| 13240 | openrouter | website_discovery_web_search | ok | 200 | openai/gpt-4o-mini | 5297 | $0.00587645 | 2026-07-12T07:19:39.185Z |
| 13241 | openrouter | website_discovery_web_search | ok | 200 | openai/gpt-4o-mini | 3682 | $0.0056333 | 2026-07-12T07:19:40.777Z |
| 13242 | openrouter | website_discovery_web_search | ok | 200 | openai/gpt-4o-mini | 4395 | $0.005738 | 2026-07-12T07:19:42.478Z |
| 13243 | openrouter | website_discovery_web_search | ok | 200 | openai/gpt-4o-mini | 3649 | $0.00565445 | 2026-07-12T07:19:53.918Z |
| 13244 | openrouter | website_discovery_web_search | ok | 200 | openai/gpt-4o-mini | 6319 | $0.00605405 | 2026-07-12T07:19:54.418Z |
| 13245 | openrouter | website_discovery_web_search | ok | 200 | openai/gpt-4o-mini | 2999 | $0.0055268 | 2026-07-12T07:19:58.662Z |
| 13246 | openrouter | website_discovery_web_search | ok | 200 | openai/gpt-4o-mini | 3414 | $0.0055994 | 2026-07-12T07:20:00.353Z |
| 13247 | openrouter | website_discovery_web_search | ok | 200 | openai/gpt-4o-mini | 4371 | $0.00573305 | 2026-07-12T07:20:19.287Z |
| 13248 | openrouter | website_discovery_web_search | ok | 200 | openai/gpt-4o-mini | 5028 | $0.00588425 | 2026-07-12T07:20:19.596Z |
| 13249 | openrouter | website_discovery_web_search | ok | 200 | openai/gpt-4o-mini | 5706 | $0.00594005 | 2026-07-12T07:20:21.995Z |
| 13250 | openrouter | website_discovery_web_search | ok | 200 | openai/gpt-4o-mini | 3913 | $0.00567515 | 2026-07-12T07:20:24.029Z |
| 13251 | openrouter | website_discovery_web_search | ok | 200 | openai/gpt-4o-mini | 3318 | $0.00559535 | 2026-07-12T07:20:24.402Z |
| 13252 | openrouter | website_discovery_web_search | ok | 200 | openai/gpt-4o-mini | 3538 | $0.00562925 | 2026-07-12T07:20:26.225Z |
| 13253 | openrouter | website_discovery_web_search | ok | 200 | openai/gpt-4o-mini | 4384 | $0.00573725 | 2026-07-12T07:20:26.953Z |
| 13254 | openrouter | website_discovery_web_search | ok | 200 | openai/gpt-4o-mini | 3914 | $0.00570365 | 2026-07-12T07:20:27.146Z |
| 13255 | openrouter | website_discovery_web_search | ok | 200 | openai/gpt-4o-mini | 3831 | $0.0056687 | 2026-07-12T07:20:27.561Z |
| 13256 | openrouter | website_discovery_web_search | ok | 200 | openai/gpt-4o-mini | 3975 | $0.00569255 | 2026-07-12T07:20:28.624Z |
| 13257 | openrouter | website_discovery_web_search | ok | 200 | openai/gpt-4o-mini | 4298 | $0.00574325 | 2026-07-12T07:20:29.513Z |
| 13258 | openrouter | website_discovery_web_search | ok | 200 | openai/gpt-4o-mini | 3826 | $0.0056477 | 2026-07-12T07:20:29.605Z |
| 13259 | openrouter | website_discovery_web_search | ok | 200 | openai/gpt-4o-mini | 3582 | $0.00561695 | 2026-07-12T07:20:30.001Z |
| 13260 | openrouter | website_discovery_web_search | ok | 200 | openai/gpt-4o-mini | 5389 | $0.00591635 | 2026-07-12T07:20:31.025Z |
| 13261 | openrouter | website_discovery_web_search | ok | 200 | openai/gpt-4o-mini | 4506 | $0.0057569 | 2026-07-12T07:20:31.201Z |
| 13262 | openrouter | website_discovery_web_search | ok | 200 | openai/gpt-4o-mini | 4162 | $0.00570125 | 2026-07-12T07:20:32.366Z |
| 13263 | openrouter | website_discovery_web_search | ok | 200 | openai/gpt-4o-mini | 4734 | $0.00580775 | 2026-07-12T07:20:33.106Z |
| 13264 | openrouter | website_discovery_web_search | ok | 200 | openai/gpt-4o-mini | 6022 | $0.00600995 | 2026-07-12T07:20:36.401Z |
| 13265 | openrouter | website_discovery_web_search | ok | 200 | openai/gpt-4o-mini | 3238 | $0.00555365 | 2026-07-12T07:20:36.611Z |
| 13266 | openrouter | website_discovery_web_search | ok | 200 | openai/gpt-4o-mini | 4736 | $0.0058247 | 2026-07-12T07:20:38.397Z |
| 13267 | openrouter | website_discovery_web_search | ok | 200 | openai/gpt-4o-mini | 4279 | $0.00572285 | 2026-07-12T07:20:42.484Z |
| 13268 | openrouter | website_discovery_web_search | ok | 200 | openai/gpt-4o-mini | 4719 | $0.0058154 | 2026-07-12T07:20:42.695Z |
| 13269 | openrouter | website_discovery_web_search | ok | 200 | openai/gpt-4o-mini | 3767 | $0.00566 | 2026-07-12T07:20:43.255Z |
| 13270 | openrouter | website_discovery_web_search | ok | 200 | openai/gpt-4o-mini | 4051 | $0.0056999 | 2026-07-12T07:20:43.565Z |
| 13271 | openrouter | website_discovery_web_search | ok | 200 | openai/gpt-4o-mini | 3611 | $0.0056249 | 2026-07-12T07:20:49.383Z |
| 13272 | openrouter | website_discovery_web_search | ok | 200 | openai/gpt-4o-mini | 3174 | $0.00555575 | 2026-07-12T07:20:49.798Z |
| 13273 | openrouter | website_discovery_web_search | ok | 200 | openai/gpt-4o-mini | 3252 | $0.005594 | 2026-07-12T07:20:50.339Z |
| 13274 | openrouter | website_discovery_web_search | ok | 200 | openai/gpt-4o-mini | 4632 | $0.00577625 | 2026-07-12T07:20:50.382Z |
| 13275 | openrouter | website_discovery_web_search | ok | 200 | openai/gpt-4o-mini | 4059 | $0.00570155 | 2026-07-12T07:20:51.049Z |
| 13276 | openrouter | website_discovery_web_search | ok | 200 | openai/gpt-4o-mini | 3572 | $0.00563345 | 2026-07-12T07:20:51.912Z |
| 13277 | openrouter | website_discovery_web_search | ok | 200 | openai/gpt-4o-mini | 5729 | $0.00595655 | 2026-07-12T07:20:53.237Z |
| 13278 | openrouter | website_discovery_web_search | ok | 200 | openai/gpt-4o-mini | 3463 | $0.00561125 | 2026-07-12T07:20:56.011Z |
| 13279 | openrouter | website_discovery_web_search | ok | 200 | openai/gpt-4o-mini | 3022 | $0.0055217 | 2026-07-12T07:20:56.316Z |
| 13280 | openrouter | website_discovery_web_search | ok | 200 | openai/gpt-4o-mini | 3650 | $0.00564785 | 2026-07-12T07:20:57.038Z |
| 13281 | openrouter | website_discovery_web_search | ok | 200 | openai/gpt-4o-mini | 4579 | $0.00576875 | 2026-07-12T07:20:57.852Z |
| 13282 | openrouter | website_discovery_web_search | ok | 200 | openai/gpt-4o-mini | 3741 | $0.0056453 | 2026-07-12T07:20:59.116Z |
| 13283 | openrouter | website_discovery_web_search | ok | 200 | openai/gpt-4o-mini | 3990 | $0.00567275 | 2026-07-12T07:21:01.283Z |
| 13284 | openrouter | website_discovery_web_search | ok | 200 | openai/gpt-4o-mini | 3697 | $0.00564725 | 2026-07-12T07:21:04.781Z |
| 13285 | openrouter | website_discovery_web_search | ok | 200 | openai/gpt-4o-mini | 3542 | $0.00559745 | 2026-07-12T07:21:10.857Z |
| 13286 | openrouter | website_discovery_web_search | ok | 200 | openai/gpt-4o-mini | 3244 | $0.0055775 | 2026-07-12T07:21:13.444Z |
| 13287 | openrouter | website_discovery_web_search | ok | 200 | openai/gpt-4o-mini | 3362 | $0.0055898 | 2026-07-12T07:21:13.985Z |
