# Pipeline Run 86

## Run summary

| Field | Value |
| --- | --- |
| Command | drain |
| Status | completed |
| Dry run | no |
| Started | 2026-07-12T08:10:32.741Z |
| Finished | 2026-07-12T08:13:41.807Z |
| Budget | $394.91 |
| Estimated spend | $0.87828 |

## Arguments

```json
{
  "apply": true,
  "budget": "394.91",
  "concurrency": "32",
  "positional": [],
  "task": "image_classify"
}
```

## Recorded counts

| Metric | Value |
| --- | --- |
| backlog | {"done":6632,"failed":66} |
| budgetExhausted | false |
| deferred | 0 |
| dispatched | 66 |
| done | 66 |
| failed | 0 |
| failureRate | 0 |
| failureRateHalted | false |
| failureRateWindowFailures | 0 |
| failureRateWindowTasks | 66 |
| queue | {"done":66} |
| queueDrained | true |
| retried | 0 |
| retryPending | 0 |
| spendUsd | 0.87827955 |

## Task outcomes

| Status | Count |
| --- | ---: |
| done | 66 |
| **Total** | **66** |

## Current `image_classify` backlog

| Status | Count |
| --- | ---: |
| done | 6632 |
| failed | 66 |
| **Total** | **6698** |

## Entity change events

| Entity type | Action | Reason | Count |
| --- | --- | --- | ---: |
| images | update | image_classify | 379 |
| **Total** |  |  | **379** |

## External call totals

| Metric | Value |
| --- | ---: |
| Calls | 377 |
| Input tokens | 5791281 |
| Output tokens | 15979 |
| Total tokens | 5807260 |
| Estimated cost | $0.87828 |

### By provider

| Provider | Calls | Estimated cost |
| --- | ---: | ---: |
| openrouter | 377 | $0.87828 |

### By call status

| Status | Calls |
| --- | ---: |
| ok | 377 |

## External calls

| ID | Provider | Type | Status | HTTP | Model | Tokens | Cost | Created |
| ---: | --- | --- | --- | ---: | --- | ---: | ---: | --- |
| 26015 | openrouter | image_classify | ok | 200 | openai/gpt-4o-mini | 25869 | $0.00389925 | 2026-07-12T08:10:35.914Z |
| 26016 | openrouter | image_classify | ok | 200 | openai/gpt-4o-mini | 37192 | $0.0055959 | 2026-07-12T08:10:36.976Z |
| 26017 | openrouter | image_classify | ok | 200 | openai/gpt-4o-mini | 37194 | $0.00559665 | 2026-07-12T08:10:37.571Z |
| 26018 | openrouter | image_classify | ok | 200 | openai/gpt-4o-mini | 37192 | $0.0055959 | 2026-07-12T08:10:37.607Z |
| 26019 | openrouter | image_classify | ok | 200 | openai/gpt-4o-mini | 37192 | $0.0055959 | 2026-07-12T08:10:37.712Z |
| 26020 | openrouter | image_classify | ok | 200 | openai/gpt-4o-mini | 37192 | $0.0055959 | 2026-07-12T08:10:37.860Z |
| 26021 | openrouter | image_classify | ok | 200 | openai/gpt-4o-mini | 37192 | $0.0055959 | 2026-07-12T08:10:38.028Z |
| 26022 | openrouter | image_classify | ok | 200 | openai/gpt-4o-mini | 37192 | $0.0055959 | 2026-07-12T08:10:38.033Z |
| 26023 | openrouter | image_classify | ok | 200 | openai/gpt-4o-mini | 37201 | $0.00559905 | 2026-07-12T08:10:38.132Z |
| 26024 | openrouter | image_classify | ok | 200 | openai/gpt-4o-mini | 37192 | $0.0055959 | 2026-07-12T08:10:38.246Z |
| 26025 | openrouter | image_classify | ok | 200 | openai/gpt-4o-mini | 25876 | $0.003903 | 2026-07-12T08:10:38.786Z |
| 26026 | openrouter | image_classify | ok | 200 | openai/gpt-4o-mini | 37193 | $0.0055965 | 2026-07-12T08:10:38.945Z |
| 26027 | openrouter | image_classify | ok | 200 | openai/gpt-4o-mini | 37192 | $0.0055959 | 2026-07-12T08:10:39.213Z |
| 26028 | openrouter | image_classify | ok | 200 | openai/gpt-4o-mini | 48553 | $0.00730365 | 2026-07-12T08:10:39.215Z |
| 26029 | openrouter | image_classify | ok | 200 | openai/gpt-4o-mini | 37192 | $0.0055959 | 2026-07-12T08:10:39.409Z |
| 26030 | openrouter | image_classify | ok | 200 | openai/gpt-4o-mini | 37202 | $0.00559875 | 2026-07-12T08:10:39.636Z |
| 26031 | openrouter | image_classify | ok | 200 | openai/gpt-4o-mini | 37193 | $0.0055965 | 2026-07-12T08:10:39.694Z |
| 26032 | openrouter | image_classify | ok | 200 | openai/gpt-4o-mini | 37193 | $0.0055965 | 2026-07-12T08:10:39.946Z |
| 26033 | openrouter | image_classify | ok | 200 | openai/gpt-4o-mini | 37193 | $0.0055965 | 2026-07-12T08:10:39.985Z |
| 26034 | openrouter | image_classify | ok | 200 | openai/gpt-4o-mini | 37203 | $0.0055989 | 2026-07-12T08:10:40.114Z |
| 26036 | openrouter | image_classify | ok | 200 | openai/gpt-4o-mini | 37203 | $0.0055989 | 2026-07-12T08:10:40.165Z |
| 26035 | openrouter | image_classify | ok | 200 | openai/gpt-4o-mini | 37193 | $0.0055965 | 2026-07-12T08:10:40.165Z |
| 26037 | openrouter | image_classify | ok | 200 | openai/gpt-4o-mini | 37193 | $0.0055965 | 2026-07-12T08:10:40.296Z |
| 26038 | openrouter | image_classify | ok | 200 | openai/gpt-4o-mini | 37193 | $0.0055965 | 2026-07-12T08:10:40.413Z |
| 26039 | openrouter | image_classify | ok | 200 | openai/gpt-4o-mini | 37193 | $0.0055965 | 2026-07-12T08:10:40.506Z |
| 26040 | openrouter | image_classify | ok | 200 | openai/gpt-4o-mini | 37192 | $0.0055959 | 2026-07-12T08:10:40.586Z |
| 26041 | openrouter | image_classify | ok | 200 | openai/gpt-4o-mini | 37193 | $0.0055965 | 2026-07-12T08:10:40.750Z |
| 26042 | openrouter | image_classify | ok | 200 | openai/gpt-4o-mini | 37158 | $0.0055908 | 2026-07-12T08:10:41.332Z |
| 26043 | openrouter | image_classify | ok | 200 | openai/gpt-4o-mini | 37181 | $0.0055992 | 2026-07-12T08:10:41.554Z |
| 26044 | openrouter | image_classify | ok | 200 | openai/gpt-4o-mini | 37192 | $0.0055959 | 2026-07-12T08:10:41.680Z |
| 26045 | openrouter | image_classify | ok | 200 | openai/gpt-4o-mini | 8897 | $0.001353 | 2026-07-12T08:10:41.739Z |
| 26046 | openrouter | image_classify | ok | 200 | openai/gpt-4o-mini | 37173 | $0.0055926 | 2026-07-12T08:10:41.798Z |
| 26047 | openrouter | image_classify | ok | 200 | openai/gpt-4o-mini | 8887 | $0.0013506 | 2026-07-12T08:10:42.294Z |
| 26048 | openrouter | image_classify | ok | 200 | openai/gpt-4o-mini | 37192 | $0.0055959 | 2026-07-12T08:10:42.356Z |
| 26049 | openrouter | image_classify | ok | 200 | openai/gpt-4o-mini | 37192 | $0.0055959 | 2026-07-12T08:10:42.441Z |
| 26050 | openrouter | image_classify | ok | 200 | openai/gpt-4o-mini | 37203 | $0.0056025 | 2026-07-12T08:10:42.443Z |
| 26051 | openrouter | image_classify | ok | 200 | openai/gpt-4o-mini | 37193 | $0.0055965 | 2026-07-12T08:10:42.618Z |
| 26052 | openrouter | image_classify | ok | 200 | openai/gpt-4o-mini | 25859 | $0.0038991 | 2026-07-12T08:10:42.657Z |
| 26053 | openrouter | image_classify | ok | 200 | openai/gpt-4o-mini | 8891 | $0.00135435 | 2026-07-12T08:10:42.723Z |
| 26054 | openrouter | image_classify | ok | 200 | openai/gpt-4o-mini | 25871 | $0.0038991 | 2026-07-12T08:10:42.799Z |
| 26055 | openrouter | image_classify | ok | 200 | openai/gpt-4o-mini | 37175 | $0.0055947 | 2026-07-12T08:10:43.732Z |
| 26056 | openrouter | image_classify | ok | 200 | openai/gpt-4o-mini | 8825 | $0.00134445 | 2026-07-12T08:10:43.733Z |
| 26057 | openrouter | image_classify | ok | 200 | openai/gpt-4o-mini | 37185 | $0.00559935 | 2026-07-12T08:10:43.816Z |
| 26058 | openrouter | image_classify | ok | 200 | openai/gpt-4o-mini | 8833 | $0.00134745 | 2026-07-12T08:10:43.894Z |
| 26059 | openrouter | image_classify | ok | 200 | openai/gpt-4o-mini | 8827 | $0.00134475 | 2026-07-12T08:10:43.897Z |
| 26060 | openrouter | image_classify | ok | 200 | openai/gpt-4o-mini | 8836 | $0.00134925 | 2026-07-12T08:10:43.963Z |
| 26061 | openrouter | image_classify | ok | 200 | openai/gpt-4o-mini | 8833 | $0.0013479 | 2026-07-12T08:10:44.065Z |
| 26062 | openrouter | image_classify | ok | 200 | openai/gpt-4o-mini | 8821 | $0.00134205 | 2026-07-12T08:10:44.557Z |
| 26063 | openrouter | image_classify | ok | 200 | openai/gpt-4o-mini | 8831 | $0.0013476 | 2026-07-12T08:10:44.826Z |
| 26064 | openrouter | image_classify | ok | 200 | openai/gpt-4o-mini | 37193 | $0.0055965 | 2026-07-12T08:10:44.998Z |
| 26065 | openrouter | image_classify | ok | 200 | openai/gpt-4o-mini | 8829 | $0.0013446 | 2026-07-12T08:10:45.004Z |
| 26066 | openrouter | image_classify | ok | 200 | openai/gpt-4o-mini | 8822 | $0.00134085 | 2026-07-12T08:10:45.250Z |
| 26067 | openrouter | image_classify | ok | 200 | openai/gpt-4o-mini | 8832 | $0.00134325 | 2026-07-12T08:10:45.482Z |
| 26068 | openrouter | image_classify | ok | 200 | openai/gpt-4o-mini | 8890 | $0.00135465 | 2026-07-12T08:10:45.589Z |
| 26069 | openrouter | image_classify | ok | 200 | openai/gpt-4o-mini | 8835 | $0.00134595 | 2026-07-12T08:10:45.657Z |
| 26070 | openrouter | image_classify | ok | 200 | openai/gpt-4o-mini | 8824 | $0.00134385 | 2026-07-12T08:10:45.940Z |
| 26071 | openrouter | image_classify | ok | 200 | openai/gpt-4o-mini | 37189 | $0.00559545 | 2026-07-12T08:10:46.540Z |
| 26072 | openrouter | image_classify | ok | 200 | openai/gpt-4o-mini | 8884 | $0.0013515 | 2026-07-12T08:10:46.634Z |
| 26073 | openrouter | image_classify | ok | 200 | openai/gpt-4o-mini | 8854 | $0.0013461 | 2026-07-12T08:10:46.671Z |
| 26074 | openrouter | image_classify | ok | 200 | openai/gpt-4o-mini | 8828 | $0.00134355 | 2026-07-12T08:10:46.758Z |
| 26075 | openrouter | image_classify | ok | 200 | openai/gpt-4o-mini | 8834 | $0.0013467 | 2026-07-12T08:10:46.971Z |
| 26076 | openrouter | image_classify | ok | 200 | openai/gpt-4o-mini | 8829 | $0.00134415 | 2026-07-12T08:10:47.003Z |
| 26077 | openrouter | image_classify | ok | 200 | openai/gpt-4o-mini | 8834 | $0.001344 | 2026-07-12T08:10:47.026Z |
| 26078 | openrouter | image_classify | ok | 200 | openai/gpt-4o-mini | 8828 | $0.00134265 | 2026-07-12T08:10:47.030Z |
| 26079 | openrouter | image_classify | ok | 200 | openai/gpt-4o-mini | 8834 | $0.0013458 | 2026-07-12T08:10:47.088Z |
| 26080 | openrouter | image_classify | ok | 200 | openai/gpt-4o-mini | 8835 | $0.00134775 | 2026-07-12T08:10:47.168Z |
| 26081 | openrouter | image_classify | ok | 200 | openai/gpt-4o-mini | 8847 | $0.00134595 | 2026-07-12T08:10:47.521Z |
| 26082 | openrouter | image_classify | ok | 200 | openai/gpt-4o-mini | 8851 | $0.001347 | 2026-07-12T08:10:47.575Z |
| 26083 | openrouter | image_classify | ok | 200 | openai/gpt-4o-mini | 8829 | $0.0013446 | 2026-07-12T08:10:47.752Z |
| 26084 | openrouter | image_classify | ok | 200 | openai/gpt-4o-mini | 48501 | $0.0072954 | 2026-07-12T08:10:47.870Z |
| 26085 | openrouter | image_classify | ok | 200 | openai/gpt-4o-mini | 8836 | $0.0013425 | 2026-07-12T08:10:47.903Z |
| 26086 | openrouter | image_classify | ok | 200 | openai/gpt-4o-mini | 8825 | $0.00134085 | 2026-07-12T08:10:47.964Z |
| 26087 | openrouter | image_classify | ok | 200 | openai/gpt-4o-mini | 37193 | $0.00559605 | 2026-07-12T08:10:48.105Z |
| 26088 | openrouter | image_classify | ok | 200 | openai/gpt-4o-mini | 8856 | $0.0013491 | 2026-07-12T08:10:48.308Z |
| 26089 | openrouter | image_classify | ok | 200 | openai/gpt-4o-mini | 37200 | $0.00560115 | 2026-07-12T08:10:48.473Z |
| 26090 | openrouter | image_classify | ok | 200 | openai/gpt-4o-mini | 8849 | $0.00134265 | 2026-07-12T08:10:48.499Z |
| 26091 | openrouter | image_classify | ok | 200 | openai/gpt-4o-mini | 8832 | $0.00134505 | 2026-07-12T08:10:48.873Z |
| 26092 | openrouter | image_classify | ok | 200 | openai/gpt-4o-mini | 37181 | $0.00559785 | 2026-07-12T08:10:48.902Z |
| 26093 | openrouter | image_classify | ok | 200 | openai/gpt-4o-mini | 8888 | $0.00135345 | 2026-07-12T08:10:49.002Z |
| 26094 | openrouter | image_classify | ok | 200 | openai/gpt-4o-mini | 8873 | $0.0013521 | 2026-07-12T08:10:49.081Z |
| 26095 | openrouter | image_classify | ok | 200 | openai/gpt-4o-mini | 8852 | $0.00134355 | 2026-07-12T08:10:49.114Z |
| 26096 | openrouter | image_classify | ok | 200 | openai/gpt-4o-mini | 8847 | $0.0013455 | 2026-07-12T08:10:49.299Z |
| 26097 | openrouter | image_classify | ok | 200 | openai/gpt-4o-mini | 8863 | $0.0013506 | 2026-07-12T08:10:49.420Z |
| 26098 | openrouter | image_classify | ok | 200 | openai/gpt-4o-mini | 8854 | $0.00134655 | 2026-07-12T08:10:49.530Z |
| 26099 | openrouter | image_classify | ok | 200 | openai/gpt-4o-mini | 8837 | $0.00134805 | 2026-07-12T08:10:50.272Z |
| 26100 | openrouter | image_classify | ok | 200 | openai/gpt-4o-mini | 8833 | $0.00134565 | 2026-07-12T08:10:50.274Z |
| 26101 | openrouter | image_classify | ok | 200 | openai/gpt-4o-mini | 8845 | $0.00134475 | 2026-07-12T08:10:50.316Z |
| 26102 | openrouter | image_classify | ok | 200 | openai/gpt-4o-mini | 8858 | $0.00134985 | 2026-07-12T08:10:50.394Z |
| 26103 | openrouter | image_classify | ok | 200 | openai/gpt-4o-mini | 8850 | $0.0013464 | 2026-07-12T08:10:50.508Z |
| 26104 | openrouter | image_classify | ok | 200 | openai/gpt-4o-mini | 8855 | $0.00134805 | 2026-07-12T08:10:50.672Z |
| 26105 | openrouter | image_classify | ok | 200 | openai/gpt-4o-mini | 8848 | $0.0013452 | 2026-07-12T08:10:50.768Z |
| 26106 | openrouter | image_classify | ok | 200 | openai/gpt-4o-mini | 8850 | $0.00134505 | 2026-07-12T08:10:50.836Z |
| 26107 | openrouter | image_classify | ok | 200 | openai/gpt-4o-mini | 8833 | $0.00134655 | 2026-07-12T08:10:50.875Z |
| 26108 | openrouter | image_classify | ok | 200 | openai/gpt-4o-mini | 8829 | $0.0013428 | 2026-07-12T08:10:50.990Z |
| 26109 | openrouter | image_classify | ok | 200 | openai/gpt-4o-mini | 8848 | $0.00134565 | 2026-07-12T08:10:51.333Z |
| 26110 | openrouter | image_classify | ok | 200 | openai/gpt-4o-mini | 8858 | $0.00134715 | 2026-07-12T08:10:51.391Z |
| 26111 | openrouter | image_classify | ok | 200 | openai/gpt-4o-mini | 8863 | $0.0013497 | 2026-07-12T08:10:51.672Z |
| 26112 | openrouter | image_classify | ok | 200 | openai/gpt-4o-mini | 37200 | $0.0056025 | 2026-07-12T08:10:51.725Z |
| 26113 | openrouter | image_classify | ok | 200 | openai/gpt-4o-mini | 8892 | $0.0013527 | 2026-07-12T08:10:51.802Z |
| 26114 | openrouter | image_classify | ok | 200 | openai/gpt-4o-mini | 8859 | $0.00134775 | 2026-07-12T08:10:51.922Z |
| 26115 | openrouter | image_classify | ok | 200 | openai/gpt-4o-mini | 8859 | $0.0013491 | 2026-07-12T08:10:51.982Z |
| 26116 | openrouter | image_classify | ok | 200 | openai/gpt-4o-mini | 8851 | $0.0013452 | 2026-07-12T08:10:52.293Z |
| 26117 | openrouter | image_classify | ok | 200 | openai/gpt-4o-mini | 8885 | $0.00135255 | 2026-07-12T08:10:52.389Z |
| 26118 | openrouter | image_classify | ok | 200 | openai/gpt-4o-mini | 8851 | $0.0013461 | 2026-07-12T08:10:52.612Z |
| 26119 | openrouter | image_classify | ok | 200 | openai/gpt-4o-mini | 37184 | $0.00559425 | 2026-07-12T08:10:52.648Z |
| 26120 | openrouter | image_classify | ok | 200 | openai/gpt-4o-mini | 8864 | $0.0013503 | 2026-07-12T08:10:52.671Z |
| 26121 | openrouter | image_classify | ok | 200 | openai/gpt-4o-mini | 8854 | $0.0013479 | 2026-07-12T08:10:52.677Z |
| 26122 | openrouter | image_classify | ok | 200 | openai/gpt-4o-mini | 8844 | $0.00134415 | 2026-07-12T08:10:52.815Z |
| 26123 | openrouter | image_classify | ok | 200 | openai/gpt-4o-mini | 8865 | $0.00135 | 2026-07-12T08:10:52.884Z |
| 26124 | openrouter | image_classify | ok | 200 | openai/gpt-4o-mini | 8842 | $0.0013425 | 2026-07-12T08:10:52.927Z |
| 26125 | openrouter | image_classify | ok | 200 | openai/gpt-4o-mini | 8847 | $0.00134415 | 2026-07-12T08:10:53.032Z |
| 26126 | openrouter | image_classify | ok | 200 | openai/gpt-4o-mini | 8826 | $0.0013401 | 2026-07-12T08:10:53.418Z |
| 26127 | openrouter | image_classify | ok | 200 | openai/gpt-4o-mini | 8849 | $0.0013449 | 2026-07-12T08:10:54.014Z |
| 26128 | openrouter | image_classify | ok | 200 | openai/gpt-4o-mini | 8840 | $0.00134985 | 2026-07-12T08:10:54.048Z |
| 26129 | openrouter | image_classify | ok | 200 | openai/gpt-4o-mini | 8851 | $0.0013434 | 2026-07-12T08:10:54.059Z |
| 26130 | openrouter | image_classify | ok | 200 | openai/gpt-4o-mini | 8851 | $0.0013443 | 2026-07-12T08:10:54.188Z |
| 26131 | openrouter | image_classify | ok | 200 | openai/gpt-4o-mini | 8825 | $0.0013422 | 2026-07-12T08:10:54.240Z |
| 26132 | openrouter | image_classify | ok | 200 | openai/gpt-4o-mini | 8847 | $0.00134415 | 2026-07-12T08:10:54.350Z |
| 26133 | openrouter | image_classify | ok | 200 | openai/gpt-4o-mini | 8855 | $0.0013467 | 2026-07-12T08:10:54.455Z |
| 26134 | openrouter | image_classify | ok | 200 | openai/gpt-4o-mini | 8845 | $0.0013425 | 2026-07-12T08:10:54.799Z |
| 26135 | openrouter | image_classify | ok | 200 | openai/gpt-4o-mini | 8830 | $0.00134475 | 2026-07-12T08:10:54.955Z |
| 26136 | openrouter | image_classify | ok | 200 | openai/gpt-4o-mini | 8852 | $0.00134895 | 2026-07-12T08:10:55.075Z |
| 26137 | openrouter | image_classify | ok | 200 | openai/gpt-4o-mini | 8888 | $0.00135345 | 2026-07-12T08:10:55.389Z |
| 26138 | openrouter | image_classify | ok | 200 | openai/gpt-4o-mini | 8860 | $0.00134655 | 2026-07-12T08:10:55.462Z |
| 26139 | openrouter | image_classify | ok | 200 | openai/gpt-4o-mini | 37194 | $0.00560115 | 2026-07-12T08:10:55.499Z |
| 26140 | openrouter | image_classify | ok | 200 | openai/gpt-4o-mini | 8860 | $0.00135015 | 2026-07-12T08:10:55.708Z |
| 26141 | openrouter | image_classify | ok | 200 | openai/gpt-4o-mini | 8884 | $0.0013515 | 2026-07-12T08:10:55.837Z |
| 26142 | openrouter | image_classify | ok | 200 | openai/gpt-4o-mini | 8866 | $0.0013479 | 2026-07-12T08:10:55.885Z |
| 26143 | openrouter | image_classify | ok | 200 | openai/gpt-4o-mini | 8844 | $0.0013437 | 2026-07-12T08:10:55.900Z |
| 26144 | openrouter | image_classify | ok | 200 | openai/gpt-4o-mini | 8855 | $0.00134715 | 2026-07-12T08:10:56.167Z |
| 26145 | openrouter | image_classify | ok | 200 | openai/gpt-4o-mini | 8853 | $0.0013473 | 2026-07-12T08:10:56.383Z |
| 26146 | openrouter | image_classify | ok | 200 | openai/gpt-4o-mini | 8857 | $0.00134655 | 2026-07-12T08:10:56.396Z |
| 26147 | openrouter | image_classify | ok | 200 | openai/gpt-4o-mini | 8851 | $0.00134475 | 2026-07-12T08:10:56.463Z |
| 26148 | openrouter | image_classify | ok | 200 | openai/gpt-4o-mini | 8832 | $0.00134505 | 2026-07-12T08:10:56.580Z |
| 26149 | openrouter | image_classify | ok | 200 | openai/gpt-4o-mini | 8837 | $0.00134895 | 2026-07-12T08:10:56.637Z |
| 26150 | openrouter | image_classify | ok | 200 | openai/gpt-4o-mini | 8851 | $0.00134475 | 2026-07-12T08:10:56.969Z |
| 26151 | openrouter | image_classify | ok | 200 | openai/gpt-4o-mini | 8833 | $0.00134745 | 2026-07-12T08:10:57.093Z |
| 26152 | openrouter | image_classify | ok | 200 | openai/gpt-4o-mini | 8855 | $0.0013503 | 2026-07-12T08:10:57.148Z |
| 26153 | openrouter | image_classify | ok | 200 | openai/gpt-4o-mini | 8854 | $0.00134835 | 2026-07-12T08:10:57.193Z |
| 26154 | openrouter | image_classify | ok | 200 | openai/gpt-4o-mini | 8858 | $0.0013494 | 2026-07-12T08:10:57.487Z |
| 26155 | openrouter | image_classify | ok | 200 | openai/gpt-4o-mini | 8853 | $0.00134955 | 2026-07-12T08:10:57.591Z |
| 26156 | openrouter | image_classify | ok | 200 | openai/gpt-4o-mini | 8851 | $0.0013461 | 2026-07-12T08:10:57.803Z |
| 26157 | openrouter | image_classify | ok | 200 | openai/gpt-4o-mini | 8826 | $0.00134235 | 2026-07-12T08:10:57.966Z |
| 26158 | openrouter | image_classify | ok | 200 | openai/gpt-4o-mini | 8882 | $0.00135075 | 2026-07-12T08:10:58.168Z |
| 26159 | openrouter | image_classify | ok | 200 | openai/gpt-4o-mini | 8859 | $0.00134685 | 2026-07-12T08:10:58.237Z |
| 26160 | openrouter | image_classify | ok | 200 | openai/gpt-4o-mini | 8858 | $0.00134625 | 2026-07-12T08:10:58.423Z |
| 26161 | openrouter | image_classify | ok | 200 | openai/gpt-4o-mini | 8849 | $0.00134445 | 2026-07-12T08:10:59.136Z |
| 26162 | openrouter | image_classify | ok | 200 | openai/gpt-4o-mini | 8848 | $0.0013434 | 2026-07-12T08:10:59.136Z |
| 26163 | openrouter | image_classify | ok | 200 | openai/gpt-4o-mini | 8848 | $0.00134295 | 2026-07-12T08:10:59.142Z |
| 26164 | openrouter | image_classify | ok | 200 | openai/gpt-4o-mini | 8841 | $0.0013446 | 2026-07-12T08:10:59.337Z |
| 26165 | openrouter | image_classify | ok | 200 | openai/gpt-4o-mini | 8830 | $0.00134475 | 2026-07-12T08:10:59.440Z |
| 26166 | openrouter | image_classify | ok | 200 | openai/gpt-4o-mini | 8861 | $0.0013494 | 2026-07-12T08:10:59.529Z |
| 26167 | openrouter | image_classify | ok | 200 | openai/gpt-4o-mini | 8846 | $0.00134265 | 2026-07-12T08:10:59.536Z |
| 26168 | openrouter | image_classify | ok | 200 | openai/gpt-4o-mini | 37190 | $0.00559695 | 2026-07-12T08:10:59.645Z |
| 26169 | openrouter | image_classify | ok | 200 | openai/gpt-4o-mini | 37193 | $0.00559785 | 2026-07-12T08:10:59.830Z |
| 26170 | openrouter | image_classify | ok | 200 | openai/gpt-4o-mini | 8833 | $0.00134475 | 2026-07-12T08:10:59.945Z |
| 26171 | openrouter | image_classify | ok | 200 | openai/gpt-4o-mini | 8857 | $0.0013461 | 2026-07-12T08:11:00.035Z |
| 26172 | openrouter | image_classify | ok | 200 | openai/gpt-4o-mini | 8826 | $0.00134235 | 2026-07-12T08:11:00.121Z |
| 26173 | openrouter | image_classify | ok | 200 | openai/gpt-4o-mini | 8842 | $0.0013416 | 2026-07-12T08:11:00.204Z |
| 26174 | openrouter | image_classify | ok | 200 | openai/gpt-4o-mini | 8851 | $0.00134565 | 2026-07-12T08:11:00.410Z |
| 26175 | openrouter | image_classify | ok | 200 | openai/gpt-4o-mini | 8851 | $0.0013434 | 2026-07-12T08:11:00.510Z |
| 26176 | openrouter | image_classify | ok | 200 | openai/gpt-4o-mini | 8878 | $0.0013488 | 2026-07-12T08:11:00.833Z |
| 26177 | openrouter | image_classify | ok | 200 | openai/gpt-4o-mini | 8855 | $0.0013494 | 2026-07-12T08:11:01.034Z |
| 26178 | openrouter | image_classify | ok | 200 | openai/gpt-4o-mini | 8847 | $0.00134595 | 2026-07-12T08:11:01.475Z |
| 26179 | openrouter | image_classify | ok | 200 | openai/gpt-4o-mini | 8859 | $0.0013473 | 2026-07-12T08:11:01.569Z |
| 26180 | openrouter | image_classify | ok | 200 | openai/gpt-4o-mini | 8853 | $0.00134775 | 2026-07-12T08:11:01.747Z |
| 26181 | openrouter | image_classify | ok | 200 | openai/gpt-4o-mini | 8846 | $0.00134625 | 2026-07-12T08:11:01.900Z |
| 26182 | openrouter | image_classify | ok | 200 | openai/gpt-4o-mini | 8828 | $0.00134355 | 2026-07-12T08:11:01.957Z |
| 26183 | openrouter | image_classify | ok | 200 | openai/gpt-4o-mini | 37193 | $0.0055992 | 2026-07-12T08:11:02.134Z |
| 26184 | openrouter | image_classify | ok | 200 | openai/gpt-4o-mini | 8845 | $0.0013425 | 2026-07-12T08:11:02.212Z |
| 26185 | openrouter | image_classify | ok | 200 | openai/gpt-4o-mini | 8852 | $0.00134625 | 2026-07-12T08:11:02.307Z |
| 26186 | openrouter | image_classify | ok | 200 | openai/gpt-4o-mini | 8856 | $0.0013473 | 2026-07-12T08:11:02.509Z |
| 26187 | openrouter | image_classify | ok | 200 | openai/gpt-4o-mini | 8866 | $0.00135105 | 2026-07-12T08:11:02.521Z |
| 26188 | openrouter | image_classify | ok | 200 | openai/gpt-4o-mini | 8823 | $0.001341 | 2026-07-12T08:11:03.061Z |
| 26189 | openrouter | image_classify | ok | 200 | openai/gpt-4o-mini | 8848 | $0.001347 | 2026-07-12T08:11:03.064Z |
| 26190 | openrouter | image_classify | ok | 200 | openai/gpt-4o-mini | 8855 | $0.0013476 | 2026-07-12T08:11:03.116Z |
| 26191 | openrouter | image_classify | ok | 200 | openai/gpt-4o-mini | 8835 | $0.00134595 | 2026-07-12T08:11:03.472Z |
| 26192 | openrouter | image_classify | ok | 200 | openai/gpt-4o-mini | 8855 | $0.00134805 | 2026-07-12T08:11:03.727Z |
| 26193 | openrouter | image_classify | ok | 200 | openai/gpt-4o-mini | 8828 | $0.00134355 | 2026-07-12T08:11:03.820Z |
| 26194 | openrouter | image_classify | ok | 200 | openai/gpt-4o-mini | 8844 | $0.0013437 | 2026-07-12T08:11:03.970Z |
| 26195 | openrouter | image_classify | ok | 200 | openai/gpt-4o-mini | 8859 | $0.0013482 | 2026-07-12T08:11:04.011Z |
| 26196 | openrouter | image_classify | ok | 200 | openai/gpt-4o-mini | 8848 | $0.0013452 | 2026-07-12T08:11:04.355Z |
| 26197 | openrouter | image_classify | ok | 200 | openai/gpt-4o-mini | 8852 | $0.0013476 | 2026-07-12T08:11:04.533Z |
| 26198 | openrouter | image_classify | ok | 200 | openai/gpt-4o-mini | 8845 | $0.00134385 | 2026-07-12T08:11:04.551Z |
| 26199 | openrouter | image_classify | ok | 200 | openai/gpt-4o-mini | 8885 | $0.00135075 | 2026-07-12T08:11:04.657Z |
| 26200 | openrouter | image_classify | ok | 200 | openai/gpt-4o-mini | 8858 | $0.00134895 | 2026-07-12T08:11:04.707Z |
| 26201 | openrouter | image_classify | ok | 200 | openai/gpt-4o-mini | 37190 | $0.0055974 | 2026-07-12T08:11:04.774Z |
| 26202 | openrouter | image_classify | ok | 200 | openai/gpt-4o-mini | 8859 | $0.00134955 | 2026-07-12T08:11:04.897Z |
| 26203 | openrouter | image_classify | ok | 200 | openai/gpt-4o-mini | 8847 | $0.00134595 | 2026-07-12T08:11:04.991Z |
| 26204 | openrouter | image_classify | ok | 200 | openai/gpt-4o-mini | 37189 | $0.00559725 | 2026-07-12T08:11:05.208Z |
| 26205 | openrouter | image_classify | ok | 200 | openai/gpt-4o-mini | 8851 | $0.0013479 | 2026-07-12T08:11:05.305Z |
| 26206 | openrouter | image_classify | ok | 200 | openai/gpt-4o-mini | 8852 | $0.00134715 | 2026-07-12T08:11:05.521Z |
| 26207 | openrouter | image_classify | ok | 200 | openai/gpt-4o-mini | 8857 | $0.00134745 | 2026-07-12T08:11:05.632Z |
| 26208 | openrouter | image_classify | ok | 200 | openai/gpt-4o-mini | 8830 | $0.00134475 | 2026-07-12T08:11:05.658Z |
| 26209 | openrouter | image_classify | ok | 200 | openai/gpt-4o-mini | 8839 | $0.00134385 | 2026-07-12T08:11:06.731Z |
| 26210 | openrouter | image_classify | ok | 200 | openai/gpt-4o-mini | 8846 | $0.00134355 | 2026-07-12T08:11:06.732Z |
| 26211 | openrouter | image_classify | ok | 200 | openai/gpt-4o-mini | 8824 | $0.00134115 | 2026-07-12T08:11:06.770Z |
| 26212 | openrouter | image_classify | ok | 200 | openai/gpt-4o-mini | 8828 | $0.00134265 | 2026-07-12T08:11:06.839Z |
| 26213 | openrouter | image_classify | ok | 200 | openai/gpt-4o-mini | 37193 | $0.0055992 | 2026-07-12T08:11:06.841Z |
| 26214 | openrouter | image_classify | ok | 200 | openai/gpt-4o-mini | 8841 | $0.00134145 | 2026-07-12T08:11:06.970Z |
| 26215 | openrouter | image_classify | ok | 200 | openai/gpt-4o-mini | 8884 | $0.00135195 | 2026-07-12T08:11:07.005Z |
| 26216 | openrouter | image_classify | ok | 200 | openai/gpt-4o-mini | 8856 | $0.00134685 | 2026-07-12T08:11:07.138Z |
| 26217 | openrouter | image_classify | ok | 200 | openai/gpt-4o-mini | 8855 | $0.00134805 | 2026-07-12T08:11:07.204Z |
| 26218 | openrouter | image_classify | ok | 200 | openai/gpt-4o-mini | 8857 | $0.0013452 | 2026-07-12T08:11:07.274Z |
| 26219 | openrouter | image_classify | ok | 200 | openai/gpt-4o-mini | 8860 | $0.00134745 | 2026-07-12T08:11:07.641Z |
| 26220 | openrouter | image_classify | ok | 200 | openai/gpt-4o-mini | 8841 | $0.0013428 | 2026-07-12T08:11:07.670Z |
| 26221 | openrouter | image_classify | ok | 200 | openai/gpt-4o-mini | 8858 | $0.0013512 | 2026-07-12T08:11:07.758Z |
| 26222 | openrouter | image_classify | ok | 200 | openai/gpt-4o-mini | 8849 | $0.00134535 | 2026-07-12T08:11:07.767Z |
| 26223 | openrouter | image_classify | ok | 200 | openai/gpt-4o-mini | 8854 | $0.00135015 | 2026-07-12T08:11:07.942Z |
| 26224 | openrouter | image_classify | ok | 200 | openai/gpt-4o-mini | 8843 | $0.0013422 | 2026-07-12T08:11:08.563Z |
| 26225 | openrouter | image_classify | ok | 200 | openai/gpt-4o-mini | 8856 | $0.0013509 | 2026-07-12T08:11:08.647Z |
| 26226 | openrouter | image_classify | ok | 200 | openai/gpt-4o-mini | 37190 | $0.00559785 | 2026-07-12T08:11:08.833Z |
| 26227 | openrouter | image_classify | ok | 200 | openai/gpt-4o-mini | 8906 | $0.00135255 | 2026-07-12T08:11:08.897Z |
| 26228 | openrouter | image_classify | ok | 200 | openai/gpt-4o-mini | 37191 | $0.0055962 | 2026-07-12T08:11:08.919Z |
| 26229 | openrouter | image_classify | ok | 200 | openai/gpt-4o-mini | 8835 | $0.00134685 | 2026-07-12T08:11:09.108Z |
| 26230 | openrouter | image_classify | ok | 200 | openai/gpt-4o-mini | 8881 | $0.00134925 | 2026-07-12T08:11:09.331Z |
| 26231 | openrouter | image_classify | ok | 200 | openai/gpt-4o-mini | 8836 | $0.00134925 | 2026-07-12T08:11:09.414Z |
| 26232 | openrouter | image_classify | ok | 200 | openai/gpt-4o-mini | 8834 | $0.00134715 | 2026-07-12T08:11:09.735Z |
| 26233 | openrouter | image_classify | ok | 200 | openai/gpt-4o-mini | 8846 | $0.0013431 | 2026-07-12T08:11:09.917Z |
| 26234 | openrouter | image_classify | ok | 200 | openai/gpt-4o-mini | 8841 | $0.0013437 | 2026-07-12T08:11:10.044Z |
| 26235 | openrouter | image_classify | ok | 200 | openai/gpt-4o-mini | 8854 | $0.0013488 | 2026-07-12T08:11:10.182Z |
| 26236 | openrouter | image_classify | ok | 200 | openai/gpt-4o-mini | 8847 | $0.0013455 | 2026-07-12T08:11:10.549Z |
| 26237 | openrouter | image_classify | ok | 200 | openai/gpt-4o-mini | 8849 | $0.00134535 | 2026-07-12T08:11:10.669Z |
| 26238 | openrouter | image_classify | ok | 200 | openai/gpt-4o-mini | 8837 | $0.0013494 | 2026-07-12T08:11:10.833Z |
| 26239 | openrouter | image_classify | ok | 200 | openai/gpt-4o-mini | 8864 | $0.0013485 | 2026-07-12T08:11:10.940Z |
| 26240 | openrouter | image_classify | ok | 200 | openai/gpt-4o-mini | 8854 | $0.00134655 | 2026-07-12T08:11:11.062Z |
| 26241 | openrouter | image_classify | ok | 200 | openai/gpt-4o-mini | 8835 | $0.0013482 | 2026-07-12T08:11:11.416Z |
| 26242 | openrouter | image_classify | ok | 200 | openai/gpt-4o-mini | 8836 | $0.00134925 | 2026-07-12T08:11:11.991Z |
| 26243 | openrouter | image_classify | ok | 200 | openai/gpt-4o-mini | 37193 | $0.00559875 | 2026-07-12T08:11:12.058Z |
| 26244 | openrouter | image_classify | ok | 200 | openai/gpt-4o-mini | 8845 | $0.0013461 | 2026-07-12T08:11:12.202Z |
| 26245 | openrouter | image_classify | ok | 200 | openai/gpt-4o-mini | 8864 | $0.00134805 | 2026-07-12T08:11:12.245Z |
| 26246 | openrouter | image_classify | ok | 200 | openai/gpt-4o-mini | 8860 | $0.00135105 | 2026-07-12T08:11:12.458Z |
| 26247 | openrouter | image_classify | ok | 200 | openai/gpt-4o-mini | 37188 | $0.0055971 | 2026-07-12T08:11:12.592Z |
| 26248 | openrouter | image_classify | ok | 200 | openai/gpt-4o-mini | 8823 | $0.00134055 | 2026-07-12T08:11:12.625Z |
| 26249 | openrouter | image_classify | ok | 200 | openai/gpt-4o-mini | 8856 | $0.0013482 | 2026-07-12T08:11:12.702Z |
| 26250 | openrouter | image_classify | ok | 200 | openai/gpt-4o-mini | 8843 | $0.00134265 | 2026-07-12T08:11:12.867Z |
| 26251 | openrouter | image_classify | ok | 200 | openai/gpt-4o-mini | 37198 | $0.0056013 | 2026-07-12T08:11:13.000Z |
| 26252 | openrouter | image_classify | ok | 200 | openai/gpt-4o-mini | 8833 | $0.0013479 | 2026-07-12T08:11:13.142Z |
| 26253 | openrouter | image_classify | ok | 200 | openai/gpt-4o-mini | 8847 | $0.00134325 | 2026-07-12T08:11:13.328Z |
| 26254 | openrouter | image_classify | ok | 200 | openai/gpt-4o-mini | 8821 | $0.0013389 | 2026-07-12T08:11:14.163Z |
| 26255 | openrouter | image_classify | ok | 200 | openai/gpt-4o-mini | 8859 | $0.0013473 | 2026-07-12T08:11:14.393Z |
| 26256 | openrouter | image_classify | ok | 200 | openai/gpt-4o-mini | 8846 | $0.00135075 | 2026-07-12T08:11:14.627Z |
| 26257 | openrouter | image_classify | ok | 200 | openai/gpt-4o-mini | 8857 | $0.0013488 | 2026-07-12T08:11:14.703Z |
| 26258 | openrouter | image_classify | ok | 200 | openai/gpt-4o-mini | 8833 | $0.00134745 | 2026-07-12T08:11:14.873Z |
| 26259 | openrouter | image_classify | ok | 200 | openai/gpt-4o-mini | 8851 | $0.0013488 | 2026-07-12T08:11:15.226Z |
| 26260 | openrouter | image_classify | ok | 200 | openai/gpt-4o-mini | 8828 | $0.00134355 | 2026-07-12T08:11:15.521Z |
| 26261 | openrouter | image_classify | ok | 200 | openai/gpt-4o-mini | 8863 | $0.00135195 | 2026-07-12T08:11:15.558Z |
| 26262 | openrouter | image_classify | ok | 200 | openai/gpt-4o-mini | 8846 | $0.00134355 | 2026-07-12T08:11:15.813Z |
| 26263 | openrouter | image_classify | ok | 200 | openai/gpt-4o-mini | 8867 | $0.0013494 | 2026-07-12T08:11:15.887Z |
| 26264 | openrouter | image_classify | ok | 200 | openai/gpt-4o-mini | 8853 | $0.00134685 | 2026-07-12T08:11:16.537Z |
| 26265 | openrouter | image_classify | ok | 200 | openai/gpt-4o-mini | 8824 | $0.00134025 | 2026-07-12T08:11:16.541Z |
| 26266 | openrouter | image_classify | ok | 200 | openai/gpt-4o-mini | 8837 | $0.00134805 | 2026-07-12T08:11:16.772Z |
| 26267 | openrouter | image_classify | ok | 200 | openai/gpt-4o-mini | 25860 | $0.00390105 | 2026-07-12T08:11:17.093Z |
| 26268 | openrouter | image_classify | ok | 200 | openai/gpt-4o-mini | 8865 | $0.0013482 | 2026-07-12T08:11:17.315Z |
| 26269 | openrouter | image_classify | ok | 200 | openai/gpt-4o-mini | 8855 | $0.00134895 | 2026-07-12T08:11:17.425Z |
| 26270 | openrouter | image_classify | ok | 200 | openai/gpt-4o-mini | 8836 | $0.00134115 | 2026-07-12T08:11:17.741Z |
| 26271 | openrouter | image_classify | ok | 200 | openai/gpt-4o-mini | 37190 | $0.00559695 | 2026-07-12T08:11:17.818Z |
| 26272 | openrouter | image_classify | ok | 200 | openai/gpt-4o-mini | 8856 | $0.0013482 | 2026-07-12T08:11:17.906Z |
| 26273 | openrouter | image_classify | ok | 200 | openai/gpt-4o-mini | 8847 | $0.0013464 | 2026-07-12T08:11:17.916Z |
| 26274 | openrouter | image_classify | ok | 200 | openai/gpt-4o-mini | 8848 | $0.00134565 | 2026-07-12T08:11:18.027Z |
| 26275 | openrouter | image_classify | ok | 200 | openai/gpt-4o-mini | 8843 | $0.00134535 | 2026-07-12T08:11:18.069Z |
| 26276 | openrouter | image_classify | ok | 200 | openai/gpt-4o-mini | 8859 | $0.00134685 | 2026-07-12T08:11:18.182Z |
| 26277 | openrouter | image_classify | ok | 200 | openai/gpt-4o-mini | 37189 | $0.00559725 | 2026-07-12T08:11:18.706Z |
| 26278 | openrouter | image_classify | ok | 200 | openai/gpt-4o-mini | 8835 | $0.0013473 | 2026-07-12T08:11:19.300Z |
| 26279 | openrouter | image_classify | ok | 200 | openai/gpt-4o-mini | 8825 | $0.00134175 | 2026-07-12T08:11:19.310Z |
| 26280 | openrouter | image_classify | ok | 200 | openai/gpt-4o-mini | 8840 | $0.00134535 | 2026-07-12T08:11:20.013Z |
| 26281 | openrouter | image_classify | ok | 200 | openai/gpt-4o-mini | 8842 | $0.00134205 | 2026-07-12T08:11:20.283Z |
| 26282 | openrouter | image_classify | ok | 200 | openai/gpt-4o-mini | 8834 | $0.0013476 | 2026-07-12T08:11:20.356Z |
| 26283 | openrouter | image_classify | ok | 200 | openai/gpt-4o-mini | 8835 | $0.0013428 | 2026-07-12T08:11:20.669Z |
| 26284 | openrouter | image_classify | ok | 200 | openai/gpt-4o-mini | 8875 | $0.0013524 | 2026-07-12T08:11:20.850Z |
| 26285 | openrouter | image_classify | ok | 200 | openai/gpt-4o-mini | 8852 | $0.0013458 | 2026-07-12T08:11:20.937Z |
| 26286 | openrouter | image_classify | ok | 200 | openai/gpt-4o-mini | 25849 | $0.00389625 | 2026-07-12T08:11:22.558Z |
| 26287 | openrouter | image_classify | ok | 200 | openai/gpt-4o-mini | 8832 | $0.0013473 | 2026-07-12T08:11:22.916Z |
| 26288 | openrouter | image_classify | ok | 200 | openai/gpt-4o-mini | 8842 | $0.00134565 | 2026-07-12T08:11:22.985Z |
| 26289 | openrouter | image_classify | ok | 200 | openai/gpt-4o-mini | 8837 | $0.0013431 | 2026-07-12T08:11:23.333Z |
| 26290 | openrouter | image_classify | ok | 200 | openai/gpt-4o-mini | 8841 | $0.00134505 | 2026-07-12T08:11:23.529Z |
| 26291 | openrouter | image_classify | ok | 200 | openai/gpt-4o-mini | 8830 | $0.00134385 | 2026-07-12T08:11:23.920Z |
| 26292 | openrouter | image_classify | ok | 200 | openai/gpt-4o-mini | 8830 | $0.00134565 | 2026-07-12T08:11:23.947Z |
| 26293 | openrouter | image_classify | ok | 200 | openai/gpt-4o-mini | 37191 | $0.00559935 | 2026-07-12T08:11:23.949Z |
| 26294 | openrouter | image_classify | ok | 200 | openai/gpt-4o-mini | 8850 | $0.00134505 | 2026-07-12T08:11:24.758Z |
| 26295 | openrouter | image_classify | ok | 200 | openai/gpt-4o-mini | 37185 | $0.0055962 | 2026-07-12T08:11:24.912Z |
| 26296 | openrouter | image_classify | ok | 200 | openai/gpt-4o-mini | 8837 | $0.0013413 | 2026-07-12T08:11:25.484Z |
| 26297 | openrouter | image_classify | ok | 200 | openai/gpt-4o-mini | 25866 | $0.00390375 | 2026-07-12T08:11:25.686Z |
| 26298 | openrouter | image_classify | ok | 200 | openai/gpt-4o-mini | 8847 | $0.00135225 | 2026-07-12T08:11:25.787Z |
| 26299 | openrouter | image_classify | ok | 200 | openai/gpt-4o-mini | 8837 | $0.0013485 | 2026-07-12T08:11:26.901Z |
| 26300 | openrouter | image_classify | ok | 200 | openai/gpt-4o-mini | 8837 | $0.0013485 | 2026-07-12T08:11:26.981Z |
| 26301 | openrouter | image_classify | ok | 200 | openai/gpt-4o-mini | 8839 | $0.0013461 | 2026-07-12T08:11:27.500Z |
| 26302 | openrouter | image_classify | ok | 200 | openai/gpt-4o-mini | 25859 | $0.0039 | 2026-07-12T08:11:27.944Z |
| 26303 | openrouter | image_classify | ok | 200 | openai/gpt-4o-mini | 8846 | $0.00134265 | 2026-07-12T08:11:28.123Z |
| 26304 | openrouter | image_classify | ok | 200 | openai/gpt-4o-mini | 8839 | $0.00135015 | 2026-07-12T08:11:28.337Z |
| 26305 | openrouter | image_classify | ok | 200 | openai/gpt-4o-mini | 8851 | $0.0013497 | 2026-07-12T08:11:29.804Z |
| 26306 | openrouter | image_classify | ok | 200 | openai/gpt-4o-mini | 8838 | $0.0013446 | 2026-07-12T08:11:30.010Z |
| 26307 | openrouter | image_classify | ok | 200 | openai/gpt-4o-mini | 8828 | $0.00133995 | 2026-07-12T08:11:30.301Z |
| 26308 | openrouter | image_classify | ok | 200 | openai/gpt-4o-mini | 37182 | $0.00559575 | 2026-07-12T08:11:30.426Z |
| 26309 | openrouter | image_classify | ok | 200 | openai/gpt-4o-mini | 37185 | $0.00559665 | 2026-07-12T08:11:30.588Z |
| 26310 | openrouter | image_classify | ok | 200 | openai/gpt-4o-mini | 8824 | $0.0013416 | 2026-07-12T08:11:30.914Z |
| 26311 | openrouter | image_classify | ok | 200 | openai/gpt-4o-mini | 8835 | $0.0013437 | 2026-07-12T08:11:31.213Z |
| 26312 | openrouter | image_classify | ok | 200 | openai/gpt-4o-mini | 37183 | $0.005595 | 2026-07-12T08:11:32.103Z |
| 26313 | openrouter | image_classify | ok | 200 | openai/gpt-4o-mini | 8830 | $0.0013416 | 2026-07-12T08:11:32.863Z |
| 26314 | openrouter | image_classify | ok | 200 | openai/gpt-4o-mini | 8838 | $0.0013419 | 2026-07-12T08:11:33.194Z |
| 26315 | openrouter | image_classify | ok | 200 | openai/gpt-4o-mini | 25853 | $0.0038973 | 2026-07-12T08:11:33.671Z |
| 26316 | openrouter | image_classify | ok | 200 | openai/gpt-4o-mini | 8832 | $0.00134055 | 2026-07-12T08:11:33.700Z |
| 26317 | openrouter | image_classify | ok | 200 | openai/gpt-4o-mini | 8829 | $0.0013428 | 2026-07-12T08:11:34.122Z |
| 26318 | openrouter | image_classify | ok | 200 | openai/gpt-4o-mini | 37189 | $0.0055977 | 2026-07-12T08:11:34.444Z |
| 26319 | openrouter | image_classify | ok | 200 | openai/gpt-4o-mini | 8828 | $0.00134175 | 2026-07-12T08:11:35.496Z |
| 26320 | openrouter | image_classify | ok | 200 | openai/gpt-4o-mini | 25856 | $0.0038991 | 2026-07-12T08:11:35.530Z |
| 26321 | openrouter | image_classify | ok | 200 | openai/gpt-4o-mini | 8842 | $0.0013425 | 2026-07-12T08:11:36.056Z |
| 26322 | openrouter | image_classify | ok | 200 | openai/gpt-4o-mini | 8830 | $0.00134295 | 2026-07-12T08:11:36.921Z |
| 26323 | openrouter | image_classify | ok | 200 | openai/gpt-4o-mini | 25855 | $0.0038985 | 2026-07-12T08:11:37.211Z |
| 26324 | openrouter | image_classify | ok | 200 | openai/gpt-4o-mini | 25857 | $0.00390105 | 2026-07-12T08:11:37.473Z |
| 26325 | openrouter | image_classify | ok | 200 | openai/gpt-4o-mini | 8831 | $0.0013404 | 2026-07-12T08:11:37.848Z |
| 26326 | openrouter | image_classify | ok | 200 | openai/gpt-4o-mini | 8837 | $0.0013413 | 2026-07-12T08:11:38.850Z |
| 26327 | openrouter | image_classify | ok | 200 | openai/gpt-4o-mini | 25863 | $0.00390195 | 2026-07-12T08:11:39.381Z |
| 26328 | openrouter | image_classify | ok | 200 | openai/gpt-4o-mini | 8829 | $0.00134235 | 2026-07-12T08:11:39.475Z |
| 26329 | openrouter | image_classify | ok | 200 | openai/gpt-4o-mini | 8857 | $0.0013461 | 2026-07-12T08:11:40.596Z |
| 26330 | openrouter | image_classify | ok | 200 | openai/gpt-4o-mini | 25857 | $0.0038997 | 2026-07-12T08:11:42.486Z |
| 26331 | openrouter | image_classify | ok | 200 | openai/gpt-4o-mini | 25859 | $0.00390135 | 2026-07-12T08:11:42.753Z |
| 26332 | openrouter | image_classify | ok | 200 | openai/gpt-4o-mini | 8844 | $0.0013419 | 2026-07-12T08:11:42.897Z |
| 26333 | openrouter | image_classify | ok | 200 | openai/gpt-4o-mini | 8843 | $0.00135075 | 2026-07-12T08:11:43.739Z |
| 26334 | openrouter | image_classify | ok | 200 | openai/gpt-4o-mini | 25854 | $0.00389925 | 2026-07-12T08:11:43.744Z |
| 26335 | openrouter | image_classify | ok | 200 | openai/gpt-4o-mini | 8846 | $0.00134265 | 2026-07-12T08:11:44.948Z |
| 26336 | openrouter | image_classify | ok | 200 | openai/gpt-4o-mini | 25855 | $0.00389985 | 2026-07-12T08:11:46.458Z |
| 26337 | openrouter | image_classify | ok | 200 | openai/gpt-4o-mini | 25856 | $0.00389865 | 2026-07-12T08:11:46.569Z |
| 26338 | openrouter | image_classify | ok | 200 | openai/gpt-4o-mini | 8836 | $0.00134655 | 2026-07-12T08:11:47.809Z |
| 26339 | openrouter | image_classify | ok | 200 | openai/gpt-4o-mini | 37187 | $0.0055983 | 2026-07-12T08:11:48.128Z |
| 26340 | openrouter | image_classify | ok | 200 | openai/gpt-4o-mini | 37179 | $0.00559665 | 2026-07-12T08:11:49.991Z |
| 26341 | openrouter | image_classify | ok | 200 | openai/gpt-4o-mini | 25851 | $0.003897 | 2026-07-12T08:11:50.324Z |
| 26342 | openrouter | image_classify | ok | 200 | openai/gpt-4o-mini | 8831 | $0.00134355 | 2026-07-12T08:11:50.421Z |
| 26343 | openrouter | image_classify | ok | 200 | openai/gpt-4o-mini | 25857 | $0.0038979 | 2026-07-12T08:11:51.174Z |
| 26344 | openrouter | image_classify | ok | 200 | openai/gpt-4o-mini | 37193 | $0.0056001 | 2026-07-12T08:11:51.898Z |
| 26345 | openrouter | image_classify | ok | 200 | openai/gpt-4o-mini | 8825 | $0.0013431 | 2026-07-12T08:11:53.417Z |
| 26346 | openrouter | image_classify | ok | 200 | openai/gpt-4o-mini | 25855 | $0.00389715 | 2026-07-12T08:11:54.121Z |
| 26347 | openrouter | image_classify | ok | 200 | openai/gpt-4o-mini | 37184 | $0.00559695 | 2026-07-12T08:11:55.604Z |
| 26348 | openrouter | image_classify | ok | 200 | openai/gpt-4o-mini | 25872 | $0.00390195 | 2026-07-12T08:11:56.432Z |
| 26349 | openrouter | image_classify | ok | 200 | openai/gpt-4o-mini | 37177 | $0.00559545 | 2026-07-12T08:11:56.647Z |
| 26350 | openrouter | image_classify | ok | 200 | openai/gpt-4o-mini | 8854 | $0.00134925 | 2026-07-12T08:11:59.335Z |
| 26351 | openrouter | image_classify | ok | 200 | openai/gpt-4o-mini | 25878 | $0.0039069 | 2026-07-12T08:11:59.551Z |
| 26352 | openrouter | image_classify | ok | 200 | openai/gpt-4o-mini | 8865 | $0.00135 | 2026-07-12T08:12:00.346Z |
| 26353 | openrouter | image_classify | ok | 200 | openai/gpt-4o-mini | 8863 | $0.0013461 | 2026-07-12T08:12:02.850Z |
| 26354 | openrouter | image_classify | ok | 200 | openai/gpt-4o-mini | 37187 | $0.0055983 | 2026-07-12T08:12:03.975Z |
| 26355 | openrouter | image_classify | ok | 200 | openai/gpt-4o-mini | 8863 | $0.001347 | 2026-07-12T08:12:06.409Z |
| 26356 | openrouter | image_classify | ok | 200 | openai/gpt-4o-mini | 8861 | $0.0013476 | 2026-07-12T08:12:08.688Z |
| 26357 | openrouter | image_classify | ok | 200 | openai/gpt-4o-mini | 37190 | $0.00559875 | 2026-07-12T08:12:08.928Z |
| 26358 | openrouter | image_classify | ok | 200 | openai/gpt-4o-mini | 8860 | $0.0013479 | 2026-07-12T08:12:11.837Z |
| 26359 | openrouter | image_classify | ok | 200 | openai/gpt-4o-mini | 25869 | $0.0039033 | 2026-07-12T08:12:13.922Z |
| 26360 | openrouter | image_classify | ok | 200 | openai/gpt-4o-mini | 8861 | $0.0013476 | 2026-07-12T08:12:14.628Z |
| 26361 | openrouter | image_classify | ok | 200 | openai/gpt-4o-mini | 8861 | $0.0013458 | 2026-07-12T08:12:16.787Z |
| 26362 | openrouter | image_classify | ok | 200 | openai/gpt-4o-mini | 8866 | $0.0013488 | 2026-07-12T08:12:19.069Z |
| 26363 | openrouter | image_classify | ok | 200 | openai/gpt-4o-mini | 8866 | $0.0013497 | 2026-07-12T08:12:21.359Z |
| 26364 | openrouter | image_classify | ok | 200 | openai/gpt-4o-mini | 8857 | $0.0013452 | 2026-07-12T08:12:24.283Z |
| 26365 | openrouter | image_classify | ok | 200 | openai/gpt-4o-mini | 8833 | $0.00134745 | 2026-07-12T08:12:26.986Z |
| 26366 | openrouter | image_classify | ok | 200 | openai/gpt-4o-mini | 8832 | $0.0013455 | 2026-07-12T08:12:29.146Z |
| 26367 | openrouter | image_classify | ok | 200 | openai/gpt-4o-mini | 8829 | $0.0013401 | 2026-07-12T08:12:32.113Z |
| 26368 | openrouter | image_classify | ok | 200 | openai/gpt-4o-mini | 8835 | $0.00134235 | 2026-07-12T08:12:34.768Z |
| 26369 | openrouter | image_classify | ok | 200 | openai/gpt-4o-mini | 8830 | $0.0013398 | 2026-07-12T08:12:37.735Z |
| 26370 | openrouter | image_classify | ok | 200 | openai/gpt-4o-mini | 8853 | $0.0013437 | 2026-07-12T08:12:40.291Z |
| 26371 | openrouter | image_classify | ok | 200 | openai/gpt-4o-mini | 8849 | $0.0013449 | 2026-07-12T08:12:43.279Z |
| 26372 | openrouter | image_classify | ok | 200 | openai/gpt-4o-mini | 8846 | $0.00134265 | 2026-07-12T08:12:46.470Z |
| 26373 | openrouter | image_classify | ok | 200 | openai/gpt-4o-mini | 37188 | $0.00559845 | 2026-07-12T08:12:50.169Z |
| 26374 | openrouter | image_classify | ok | 200 | openai/gpt-4o-mini | 8834 | $0.0013485 | 2026-07-12T08:12:52.434Z |
| 26375 | openrouter | image_classify | ok | 200 | openai/gpt-4o-mini | 37171 | $0.00559185 | 2026-07-12T08:12:55.424Z |
| 26376 | openrouter | image_classify | ok | 200 | openai/gpt-4o-mini | 8879 | $0.0013512 | 2026-07-12T08:12:58.455Z |
| 26377 | openrouter | image_classify | ok | 200 | openai/gpt-4o-mini | 8867 | $0.00134805 | 2026-07-12T08:13:01.404Z |
| 26378 | openrouter | image_classify | ok | 200 | openai/gpt-4o-mini | 8884 | $0.0013533 | 2026-07-12T08:13:04.772Z |
| 26379 | openrouter | image_classify | ok | 200 | openai/gpt-4o-mini | 8878 | $0.0013497 | 2026-07-12T08:13:07.630Z |
| 26380 | openrouter | image_classify | ok | 200 | openai/gpt-4o-mini | 8879 | $0.001353 | 2026-07-12T08:13:10.506Z |
| 26381 | openrouter | image_classify | ok | 200 | openai/gpt-4o-mini | 8882 | $0.0013521 | 2026-07-12T08:13:13.417Z |
| 26382 | openrouter | image_classify | ok | 200 | openai/gpt-4o-mini | 8879 | $0.0013503 | 2026-07-12T08:13:15.707Z |
| 26383 | openrouter | image_classify | ok | 200 | openai/gpt-4o-mini | 8877 | $0.0013491 | 2026-07-12T08:13:18.811Z |
| 26384 | openrouter | image_classify | ok | 200 | openai/gpt-4o-mini | 8826 | $0.00134325 | 2026-07-12T08:13:22.065Z |
| 26385 | openrouter | image_classify | ok | 200 | openai/gpt-4o-mini | 8831 | $0.0013449 | 2026-07-12T08:13:24.504Z |
| 26386 | openrouter | image_classify | ok | 200 | openai/gpt-4o-mini | 8828 | $0.0013395 | 2026-07-12T08:13:26.887Z |
| 26387 | openrouter | image_classify | ok | 200 | openai/gpt-4o-mini | 8833 | $0.00134115 | 2026-07-12T08:13:29.107Z |
| 26388 | openrouter | image_classify | ok | 200 | openai/gpt-4o-mini | 8836 | $0.0013434 | 2026-07-12T08:13:32.386Z |
| 26389 | openrouter | image_classify | ok | 200 | openai/gpt-4o-mini | 8853 | $0.0013437 | 2026-07-12T08:13:34.991Z |
| 26390 | openrouter | image_classify | ok | 200 | openai/gpt-4o-mini | 8848 | $0.0013443 | 2026-07-12T08:13:37.104Z |
| 26391 | openrouter | image_classify | ok | 200 | openai/gpt-4o-mini | 8847 | $0.00134325 | 2026-07-12T08:13:39.676Z |
