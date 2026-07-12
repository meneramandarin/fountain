# Pipeline Run 98

## Run summary

| Field | Value |
| --- | --- |
| Command | drain |
| Status | cancelled |
| Dry run | no |
| Started | 2026-07-12T09:08:38.274Z |
| Finished | 2026-07-12T09:10:04.659Z |
| Budget | $250.00 |
| Estimated spend | $6.75 |
| Notes | received_sigint |

## Arguments

```json
{
  "apply": true,
  "budget": "250",
  "concurrency": "32",
  "positional": [],
  "task": "reviews_fetch"
}
```

## Recorded counts

_None recorded._

## Task outcomes

| Status | Count |
| --- | ---: |
| pending | 1 |
| claimed | 23 |
| done | 20 |
| failed | 75 |
| **Total** | **119** |

## Current `reviews_fetch` backlog

| Status | Count |
| --- | ---: |
| pending | 5337 |
| claimed | 23 |
| done | 20 |
| failed | 75 |
| **Total** | **5455** |

## Entity change events

_No run-linked serving mutations were recorded._

## External call totals

| Metric | Value |
| --- | ---: |
| Calls | 348 |
| Input tokens | 0 |
| Output tokens | 0 |
| Total tokens | 0 |
| Estimated cost | $6.875 |

### By provider

| Provider | Calls | Estimated cost |
| --- | ---: | ---: |
| google_places | 348 | $6.875 |

### By call status

| Status | Calls |
| --- | ---: |
| error | 2 |
| ok | 346 |

## External calls

| ID | Provider | Type | Status | HTTP | Model | Tokens | Cost | Created |
| ---: | --- | --- | --- | ---: | --- | ---: | ---: | --- |
| 31131 | google_places | place_details | ok | 200 | — | 0 | $0.025 | 2026-07-12T09:08:39.781Z |
| 31132 | google_places | place_details | ok | 200 | — | 0 | $0.025 | 2026-07-12T09:08:39.786Z |
| 31133 | google_places | place_details | ok | 200 | — | 0 | $0.025 | 2026-07-12T09:08:39.798Z |
| 31134 | google_places | place_details | ok | 200 | — | 0 | $0.025 | 2026-07-12T09:08:39.804Z |
| 31135 | google_places | place_details | ok | 200 | — | 0 | $0.025 | 2026-07-12T09:08:39.810Z |
| 31136 | google_places | place_details | ok | 200 | — | 0 | $0.025 | 2026-07-12T09:08:39.812Z |
| 31137 | google_places | place_details | ok | 200 | — | 0 | $0.025 | 2026-07-12T09:08:39.825Z |
| 31139 | google_places | place_details | ok | 200 | — | 0 | $0.025 | 2026-07-12T09:08:39.861Z |
| 31138 | google_places | place_details | ok | 200 | — | 0 | $0.025 | 2026-07-12T09:08:39.862Z |
| 31141 | google_places | place_details | ok | 200 | — | 0 | $0.025 | 2026-07-12T09:08:39.873Z |
| 31140 | google_places | place_details | ok | 200 | — | 0 | $0.025 | 2026-07-12T09:08:39.873Z |
| 31142 | google_places | place_details | ok | 200 | — | 0 | $0.025 | 2026-07-12T09:08:39.886Z |
| 31143 | google_places | place_details | ok | 200 | — | 0 | $0.025 | 2026-07-12T09:08:39.891Z |
| 31144 | google_places | place_details | ok | 200 | — | 0 | $0.025 | 2026-07-12T09:08:39.895Z |
| 31145 | google_places | place_details | ok | 200 | — | 0 | $0.025 | 2026-07-12T09:08:39.900Z |
| 31146 | google_places | place_details | ok | 200 | — | 0 | $0.025 | 2026-07-12T09:08:39.903Z |
| 31147 | google_places | place_details | ok | 200 | — | 0 | $0.025 | 2026-07-12T09:08:39.910Z |
| 31148 | google_places | place_details | ok | 200 | — | 0 | $0.025 | 2026-07-12T09:08:39.944Z |
| 31149 | google_places | place_details | ok | 200 | — | 0 | $0.025 | 2026-07-12T09:08:39.952Z |
| 31150 | google_places | place_details | ok | 200 | — | 0 | $0.025 | 2026-07-12T09:08:39.970Z |
| 31151 | google_places | place_details | ok | 200 | — | 0 | $0.025 | 2026-07-12T09:08:39.985Z |
| 31152 | google_places | place_details | ok | 200 | — | 0 | $0.025 | 2026-07-12T09:08:39.987Z |
| 31153 | google_places | place_details | ok | 200 | — | 0 | $0.025 | 2026-07-12T09:08:40.026Z |
| 31154 | google_places | place_details | ok | 200 | — | 0 | $0.025 | 2026-07-12T09:08:40.053Z |
| 31155 | google_places | place_details | ok | 200 | — | 0 | $0.025 | 2026-07-12T09:08:40.069Z |
| 31156 | google_places | place_details | ok | 200 | — | 0 | $0.025 | 2026-07-12T09:08:40.138Z |
| 31157 | google_places | place_details | ok | 200 | — | 0 | $0.025 | 2026-07-12T09:08:41.448Z |
| 31158 | google_places | place_details | ok | 200 | — | 0 | $0.025 | 2026-07-12T09:08:41.527Z |
| 31159 | google_places | place_details | ok | 200 | — | 0 | $0.025 | 2026-07-12T09:08:41.961Z |
| 31160 | google_places | place_details | ok | 200 | — | 0 | $0.025 | 2026-07-12T09:08:42.736Z |
| 31161 | google_places | place_details | ok | 200 | — | 0 | $0.025 | 2026-07-12T09:08:42.963Z |
| 31162 | google_places | place_details | ok | 200 | — | 0 | $0.025 | 2026-07-12T09:08:44.736Z |
| 31163 | google_places | search_text | ok | 200 | — | 0 | $0.00 | 2026-07-12T09:08:45.254Z |
| 31164 | google_places | search_text | ok | 200 | — | 0 | $0.00 | 2026-07-12T09:08:45.339Z |
| 31165 | google_places | place_details | ok | 200 | — | 0 | $0.025 | 2026-07-12T09:08:48.196Z |
| 31166 | google_places | place_details | ok | 200 | — | 0 | $0.025 | 2026-07-12T09:08:50.044Z |
| 31167 | google_places | place_details | ok | 200 | — | 0 | $0.025 | 2026-07-12T09:08:50.120Z |
| 31168 | google_places | place_details | ok | 200 | — | 0 | $0.025 | 2026-07-12T09:08:50.126Z |
| 31169 | google_places | place_details | ok | 200 | — | 0 | $0.025 | 2026-07-12T09:08:50.129Z |
| 31170 | google_places | place_details | ok | 200 | — | 0 | $0.025 | 2026-07-12T09:08:50.136Z |
| 31171 | google_places | place_details | ok | 200 | — | 0 | $0.025 | 2026-07-12T09:08:50.138Z |
| 31172 | google_places | place_details | ok | 200 | — | 0 | $0.025 | 2026-07-12T09:08:50.200Z |
| 31173 | google_places | place_details | ok | 200 | — | 0 | $0.025 | 2026-07-12T09:08:50.202Z |
| 31174 | google_places | place_details | ok | 200 | — | 0 | $0.025 | 2026-07-12T09:08:50.208Z |
| 31175 | google_places | place_details | ok | 200 | — | 0 | $0.025 | 2026-07-12T09:08:50.211Z |
| 31176 | google_places | place_details | ok | 200 | — | 0 | $0.025 | 2026-07-12T09:08:50.218Z |
| 31177 | google_places | place_details | ok | 200 | — | 0 | $0.025 | 2026-07-12T09:08:50.303Z |
| 31178 | google_places | place_details | ok | 200 | — | 0 | $0.025 | 2026-07-12T09:08:50.308Z |
| 31179 | google_places | place_details | ok | 200 | — | 0 | $0.025 | 2026-07-12T09:08:50.309Z |
| 31180 | google_places | place_details | ok | 200 | — | 0 | $0.025 | 2026-07-12T09:08:50.311Z |
| 31181 | google_places | place_details | ok | 200 | — | 0 | $0.025 | 2026-07-12T09:08:50.398Z |
| 31182 | google_places | place_details | ok | 200 | — | 0 | $0.025 | 2026-07-12T09:08:50.400Z |
| 31183 | google_places | place_details | ok | 200 | — | 0 | $0.025 | 2026-07-12T09:08:50.403Z |
| 31184 | google_places | place_details | ok | 200 | — | 0 | $0.025 | 2026-07-12T09:08:50.474Z |
| 31185 | google_places | place_details | ok | 200 | — | 0 | $0.025 | 2026-07-12T09:08:50.488Z |
| 31186 | google_places | place_details | ok | 200 | — | 0 | $0.025 | 2026-07-12T09:08:52.298Z |
| 31187 | google_places | place_details | ok | 200 | — | 0 | $0.025 | 2026-07-12T09:08:52.473Z |
| 31188 | google_places | place_details | ok | 200 | — | 0 | $0.025 | 2026-07-12T09:08:53.405Z |
| 31189 | google_places | place_details | ok | 200 | — | 0 | $0.025 | 2026-07-12T09:08:53.486Z |
| 31190 | google_places | place_details | ok | 200 | — | 0 | $0.025 | 2026-07-12T09:08:54.704Z |
| 31191 | google_places | place_details | ok | 200 | — | 0 | $0.025 | 2026-07-12T09:08:55.280Z |
| 31192 | google_places | place_details | ok | 200 | — | 0 | $0.025 | 2026-07-12T09:08:55.363Z |
| 31193 | google_places | place_details | ok | 200 | — | 0 | $0.025 | 2026-07-12T09:08:56.036Z |
| 31194 | google_places | place_details | ok | 200 | — | 0 | $0.025 | 2026-07-12T09:08:57.277Z |
| 31195 | google_places | place_details | ok | 200 | — | 0 | $0.025 | 2026-07-12T09:08:58.935Z |
| 31196 | google_places | place_details | ok | 200 | — | 0 | $0.025 | 2026-07-12T09:08:59.659Z |
| 31197 | google_places | place_details | ok | 200 | — | 0 | $0.025 | 2026-07-12T09:09:00.750Z |
| 31198 | google_places | place_details | ok | 200 | — | 0 | $0.025 | 2026-07-12T09:09:01.151Z |
| 31199 | google_places | place_details | ok | 200 | — | 0 | $0.025 | 2026-07-12T09:09:01.192Z |
| 31200 | google_places | place_details | ok | 200 | — | 0 | $0.025 | 2026-07-12T09:09:01.282Z |
| 31201 | google_places | place_details | ok | 200 | — | 0 | $0.025 | 2026-07-12T09:09:01.322Z |
| 31202 | google_places | place_details | ok | 200 | — | 0 | $0.025 | 2026-07-12T09:09:01.348Z |
| 31203 | google_places | place_details | ok | 200 | — | 0 | $0.025 | 2026-07-12T09:09:01.361Z |
| 31204 | google_places | place_details | ok | 200 | — | 0 | $0.025 | 2026-07-12T09:09:01.428Z |
| 31205 | google_places | place_details | ok | 200 | — | 0 | $0.025 | 2026-07-12T09:09:01.448Z |
| 31206 | google_places | place_details | ok | 200 | — | 0 | $0.025 | 2026-07-12T09:09:01.465Z |
| 31207 | google_places | place_details | ok | 200 | — | 0 | $0.025 | 2026-07-12T09:09:01.551Z |
| 31208 | google_places | place_details | ok | 200 | — | 0 | $0.025 | 2026-07-12T09:09:01.573Z |
| 31209 | google_places | place_details | ok | 200 | — | 0 | $0.025 | 2026-07-12T09:09:01.638Z |
| 31210 | google_places | place_details | ok | 200 | — | 0 | $0.025 | 2026-07-12T09:09:01.653Z |
| 31211 | google_places | place_details | ok | 200 | — | 0 | $0.025 | 2026-07-12T09:09:01.721Z |
| 31212 | google_places | place_details | ok | 200 | — | 0 | $0.025 | 2026-07-12T09:09:01.861Z |
| 31213 | google_places | place_details | ok | 200 | — | 0 | $0.025 | 2026-07-12T09:09:02.734Z |
| 31214 | google_places | place_details | ok | 200 | — | 0 | $0.025 | 2026-07-12T09:09:02.989Z |
| 31215 | google_places | place_details | ok | 200 | — | 0 | $0.025 | 2026-07-12T09:09:04.061Z |
| 31216 | google_places | place_details | ok | 200 | — | 0 | $0.025 | 2026-07-12T09:09:05.084Z |
| 31217 | google_places | place_details | ok | 200 | — | 0 | $0.025 | 2026-07-12T09:09:05.453Z |
| 31218 | google_places | place_details | ok | 200 | — | 0 | $0.025 | 2026-07-12T09:09:06.341Z |
| 31219 | google_places | place_details | ok | 200 | — | 0 | $0.025 | 2026-07-12T09:09:06.610Z |
| 31220 | google_places | place_details | ok | 200 | — | 0 | $0.025 | 2026-07-12T09:09:06.999Z |
| 31221 | google_places | place_details | ok | 200 | — | 0 | $0.025 | 2026-07-12T09:09:07.740Z |
| 31222 | google_places | place_details | ok | 200 | — | 0 | $0.025 | 2026-07-12T09:09:08.265Z |
| 31223 | google_places | place_details | ok | 200 | — | 0 | $0.025 | 2026-07-12T09:09:08.620Z |
| 31224 | google_places | place_details | ok | 200 | — | 0 | $0.025 | 2026-07-12T09:09:09.486Z |
| 31225 | google_places | place_details | ok | 200 | — | 0 | $0.025 | 2026-07-12T09:09:09.834Z |
| 31226 | google_places | place_details | ok | 200 | — | 0 | $0.025 | 2026-07-12T09:09:10.257Z |
| 31227 | google_places | place_details | ok | 200 | — | 0 | $0.025 | 2026-07-12T09:09:10.433Z |
| 31228 | google_places | place_details | ok | 200 | — | 0 | $0.025 | 2026-07-12T09:09:10.636Z |
| 31229 | google_places | place_details | ok | 200 | — | 0 | $0.025 | 2026-07-12T09:09:10.654Z |
| 31230 | google_places | place_details | ok | 200 | — | 0 | $0.025 | 2026-07-12T09:09:10.668Z |
| 31231 | google_places | place_details | ok | 200 | — | 0 | $0.025 | 2026-07-12T09:09:10.734Z |
| 31232 | google_places | place_details | ok | 200 | — | 0 | $0.025 | 2026-07-12T09:09:10.761Z |
| 31233 | google_places | place_details | ok | 200 | — | 0 | $0.025 | 2026-07-12T09:09:10.795Z |
| 31234 | google_places | place_details | ok | 200 | — | 0 | $0.025 | 2026-07-12T09:09:10.853Z |
| 31235 | google_places | place_details | ok | 200 | — | 0 | $0.025 | 2026-07-12T09:09:10.872Z |
| 31236 | google_places | place_details | ok | 200 | — | 0 | $0.025 | 2026-07-12T09:09:10.925Z |
| 31237 | google_places | place_details | ok | 200 | — | 0 | $0.025 | 2026-07-12T09:09:10.955Z |
| 31238 | google_places | place_details | ok | 200 | — | 0 | $0.025 | 2026-07-12T09:09:10.956Z |
| 31239 | google_places | place_details | ok | 200 | — | 0 | $0.025 | 2026-07-12T09:09:11.008Z |
| 31240 | google_places | place_details | ok | 200 | — | 0 | $0.025 | 2026-07-12T09:09:11.220Z |
| 31241 | google_places | place_details | ok | 200 | — | 0 | $0.025 | 2026-07-12T09:09:11.610Z |
| 31242 | google_places | place_details | ok | 200 | — | 0 | $0.025 | 2026-07-12T09:09:13.515Z |
| 31243 | google_places | search_text | ok | 200 | — | 0 | $0.00 | 2026-07-12T09:09:15.319Z |
| 31244 | google_places | place_details | ok | 200 | — | 0 | $0.025 | 2026-07-12T09:09:15.396Z |
| 31245 | google_places | place_details | ok | 200 | — | 0 | $0.025 | 2026-07-12T09:09:15.478Z |
| 31246 | google_places | place_details | ok | 200 | — | 0 | $0.025 | 2026-07-12T09:09:16.254Z |
| 31247 | google_places | place_details | ok | 200 | — | 0 | $0.025 | 2026-07-12T09:09:16.401Z |
| 31248 | google_places | place_details | ok | 200 | — | 0 | $0.025 | 2026-07-12T09:09:16.830Z |
| 31249 | google_places | place_details | ok | 200 | — | 0 | $0.025 | 2026-07-12T09:09:17.602Z |
| 31250 | google_places | place_details | ok | 200 | — | 0 | $0.025 | 2026-07-12T09:09:18.408Z |
| 31251 | google_places | place_details | error | 404 | — | 0 | $0.00 | 2026-07-12T09:09:18.754Z |
| 31252 | google_places | place_details | ok | 200 | — | 0 | $0.025 | 2026-07-12T09:09:18.927Z |
| 31253 | google_places | search_text | ok | 200 | — | 0 | $0.00 | 2026-07-12T09:09:19.703Z |
| 31254 | google_places | place_details | ok | 200 | — | 0 | $0.025 | 2026-07-12T09:09:19.720Z |
| 31255 | google_places | place_details | ok | 200 | — | 0 | $0.025 | 2026-07-12T09:09:20.090Z |
| 31256 | google_places | place_details | ok | 200 | — | 0 | $0.025 | 2026-07-12T09:09:20.101Z |
| 31257 | google_places | place_details | ok | 200 | — | 0 | $0.025 | 2026-07-12T09:09:20.140Z |
| 31258 | google_places | place_details | ok | 200 | — | 0 | $0.025 | 2026-07-12T09:09:20.220Z |
| 31259 | google_places | place_details | ok | 200 | — | 0 | $0.025 | 2026-07-12T09:09:20.271Z |
| 31260 | google_places | place_details | ok | 200 | — | 0 | $0.025 | 2026-07-12T09:09:20.276Z |
| 31261 | google_places | place_details | ok | 200 | — | 0 | $0.025 | 2026-07-12T09:09:20.349Z |
| 31262 | google_places | place_details | ok | 200 | — | 0 | $0.025 | 2026-07-12T09:09:20.435Z |
| 31263 | google_places | place_details | ok | 200 | — | 0 | $0.025 | 2026-07-12T09:09:20.447Z |
| 31264 | google_places | place_details | ok | 200 | — | 0 | $0.025 | 2026-07-12T09:09:20.448Z |
| 31265 | google_places | place_details | ok | 200 | — | 0 | $0.025 | 2026-07-12T09:09:20.539Z |
| 31266 | google_places | place_details | ok | 200 | — | 0 | $0.025 | 2026-07-12T09:09:20.541Z |
| 31267 | google_places | place_details | ok | 200 | — | 0 | $0.025 | 2026-07-12T09:09:20.623Z |
| 31268 | google_places | place_details | ok | 200 | — | 0 | $0.025 | 2026-07-12T09:09:20.625Z |
| 31269 | google_places | place_details | ok | 200 | — | 0 | $0.025 | 2026-07-12T09:09:20.660Z |
| 31270 | google_places | place_details | ok | 200 | — | 0 | $0.025 | 2026-07-12T09:09:22.368Z |
| 31271 | google_places | place_details | ok | 200 | — | 0 | $0.025 | 2026-07-12T09:09:22.926Z |
| 31272 | google_places | place_details | ok | 200 | — | 0 | $0.025 | 2026-07-12T09:09:23.669Z |
| 31273 | google_places | place_details | ok | 200 | — | 0 | $0.025 | 2026-07-12T09:09:23.924Z |
| 31274 | google_places | place_details | ok | 200 | — | 0 | $0.025 | 2026-07-12T09:09:24.097Z |
| 31275 | google_places | place_details | ok | 200 | — | 0 | $0.025 | 2026-07-12T09:09:24.184Z |
| 31276 | google_places | place_details | ok | 200 | — | 0 | $0.025 | 2026-07-12T09:09:24.365Z |
| 31277 | google_places | place_details | ok | 200 | — | 0 | $0.025 | 2026-07-12T09:09:24.964Z |
| 31278 | google_places | place_details | ok | 200 | — | 0 | $0.025 | 2026-07-12T09:09:25.988Z |
| 31279 | google_places | place_details | ok | 200 | — | 0 | $0.025 | 2026-07-12T09:09:26.501Z |
| 31280 | google_places | place_details | ok | 200 | — | 0 | $0.025 | 2026-07-12T09:09:27.295Z |
| 31281 | google_places | place_details | ok | 200 | — | 0 | $0.025 | 2026-07-12T09:09:27.380Z |
| 31282 | google_places | place_details | ok | 200 | — | 0 | $0.025 | 2026-07-12T09:09:27.960Z |
| 31283 | google_places | place_details | ok | 200 | — | 0 | $0.025 | 2026-07-12T09:09:28.144Z |
| 31284 | google_places | place_details | ok | 200 | — | 0 | $0.025 | 2026-07-12T09:09:28.702Z |
| 31285 | google_places | place_details | ok | 200 | — | 0 | $0.025 | 2026-07-12T09:09:28.923Z |
| 31286 | google_places | place_details | ok | 200 | — | 0 | $0.025 | 2026-07-12T09:09:29.053Z |
| 31287 | google_places | place_details | ok | 200 | — | 0 | $0.025 | 2026-07-12T09:09:29.083Z |
| 31288 | google_places | place_details | ok | 200 | — | 0 | $0.025 | 2026-07-12T09:09:29.166Z |
| 31289 | google_places | place_details | ok | 200 | — | 0 | $0.025 | 2026-07-12T09:09:29.191Z |
| 31290 | google_places | place_details | ok | 200 | — | 0 | $0.025 | 2026-07-12T09:09:29.272Z |
| 31291 | google_places | place_details | ok | 200 | — | 0 | $0.025 | 2026-07-12T09:09:29.462Z |
| 31292 | google_places | place_details | ok | 200 | — | 0 | $0.025 | 2026-07-12T09:09:29.571Z |
| 31293 | google_places | place_details | ok | 200 | — | 0 | $0.025 | 2026-07-12T09:09:29.628Z |
| 31294 | google_places | place_details | ok | 200 | — | 0 | $0.025 | 2026-07-12T09:09:29.801Z |
| 31295 | google_places | place_details | ok | 200 | — | 0 | $0.025 | 2026-07-12T09:09:29.814Z |
| 31296 | google_places | place_details | ok | 200 | — | 0 | $0.025 | 2026-07-12T09:09:29.899Z |
| 31297 | google_places | place_details | ok | 200 | — | 0 | $0.025 | 2026-07-12T09:09:31.334Z |
| 31298 | google_places | place_details | ok | 200 | — | 0 | $0.025 | 2026-07-12T09:09:31.541Z |
| 31299 | google_places | place_details | ok | 200 | — | 0 | $0.025 | 2026-07-12T09:09:31.660Z |
| 31300 | google_places | place_details | ok | 200 | — | 0 | $0.025 | 2026-07-12T09:09:32.184Z |
| 31301 | google_places | place_details | ok | 200 | — | 0 | $0.025 | 2026-07-12T09:09:32.613Z |
| 31302 | google_places | place_details | ok | 200 | — | 0 | $0.025 | 2026-07-12T09:09:32.744Z |
| 31303 | google_places | place_details | ok | 200 | — | 0 | $0.025 | 2026-07-12T09:09:34.092Z |
| 31304 | google_places | place_details | ok | 200 | — | 0 | $0.025 | 2026-07-12T09:09:34.611Z |
| 31305 | google_places | place_details | ok | 200 | — | 0 | $0.025 | 2026-07-12T09:09:34.687Z |
| 31306 | google_places | place_details | ok | 200 | — | 0 | $0.025 | 2026-07-12T09:09:34.910Z |
| 31307 | google_places | place_details | ok | 200 | — | 0 | $0.025 | 2026-07-12T09:09:35.161Z |
| 31308 | google_places | place_details | ok | 200 | — | 0 | $0.025 | 2026-07-12T09:09:35.536Z |
| 31309 | google_places | place_details | ok | 200 | — | 0 | $0.025 | 2026-07-12T09:09:35.787Z |
| 31310 | google_places | search_text | ok | 200 | — | 0 | $0.00 | 2026-07-12T09:09:36.213Z |
| 31311 | google_places | place_details | ok | 200 | — | 0 | $0.025 | 2026-07-12T09:09:36.537Z |
| 31312 | google_places | place_details | error | 404 | — | 0 | $0.00 | 2026-07-12T09:09:36.688Z |
| 31313 | google_places | place_details | ok | 200 | — | 0 | $0.025 | 2026-07-12T09:09:36.859Z |
| 31314 | google_places | place_details | ok | 200 | — | 0 | $0.025 | 2026-07-12T09:09:36.941Z |
| 31315 | google_places | place_details | ok | 200 | — | 0 | $0.025 | 2026-07-12T09:09:37.012Z |
| 31316 | google_places | place_details | ok | 200 | — | 0 | $0.025 | 2026-07-12T09:09:37.068Z |
| 31317 | google_places | place_details | ok | 200 | — | 0 | $0.025 | 2026-07-12T09:09:37.131Z |
| 31318 | google_places | place_details | ok | 200 | — | 0 | $0.025 | 2026-07-12T09:09:37.219Z |
| 31319 | google_places | place_details | ok | 200 | — | 0 | $0.025 | 2026-07-12T09:09:37.272Z |
| 31320 | google_places | place_details | ok | 200 | — | 0 | $0.025 | 2026-07-12T09:09:37.435Z |
| 31321 | google_places | place_details | ok | 200 | — | 0 | $0.025 | 2026-07-12T09:09:37.653Z |
| 31322 | google_places | search_text | ok | 200 | — | 0 | $0.00 | 2026-07-12T09:09:38.069Z |
| 31323 | google_places | search_text | ok | 200 | — | 0 | $0.00 | 2026-07-12T09:09:38.281Z |
| 31324 | google_places | place_details | ok | 200 | — | 0 | $0.025 | 2026-07-12T09:09:38.742Z |
| 31325 | google_places | place_details | ok | 200 | — | 0 | $0.025 | 2026-07-12T09:09:38.804Z |
| 31326 | google_places | place_details | ok | 200 | — | 0 | $0.025 | 2026-07-12T09:09:38.888Z |
| 31327 | google_places | place_details | ok | 200 | — | 0 | $0.025 | 2026-07-12T09:09:39.319Z |
| 31328 | google_places | search_text | ok | 200 | — | 0 | $0.00 | 2026-07-12T09:09:39.404Z |
| 31329 | google_places | place_details | ok | 200 | — | 0 | $0.025 | 2026-07-12T09:09:39.560Z |
| 31330 | google_places | search_text | ok | 200 | — | 0 | $0.00 | 2026-07-12T09:09:39.644Z |
| 31331 | google_places | search_text | ok | 200 | — | 0 | $0.00 | 2026-07-12T09:09:40.226Z |
| 31332 | google_places | place_details | ok | 200 | — | 0 | $0.025 | 2026-07-12T09:09:40.282Z |
| 31333 | google_places | search_text | ok | 200 | — | 0 | $0.00 | 2026-07-12T09:09:40.285Z |
| 31334 | google_places | place_details | ok | 200 | — | 0 | $0.025 | 2026-07-12T09:09:40.471Z |
| 31335 | google_places | place_details | ok | 200 | — | 0 | $0.025 | 2026-07-12T09:09:40.730Z |
| 31336 | google_places | place_details | ok | 200 | — | 0 | $0.025 | 2026-07-12T09:09:40.845Z |
| 31337 | google_places | place_details | ok | 200 | — | 0 | $0.025 | 2026-07-12T09:09:41.001Z |
| 31338 | google_places | search_text | ok | 200 | — | 0 | $0.00 | 2026-07-12T09:09:41.017Z |
| 31339 | google_places | place_details | ok | 200 | — | 0 | $0.025 | 2026-07-12T09:09:41.034Z |
| 31340 | google_places | search_text | ok | 200 | — | 0 | $0.00 | 2026-07-12T09:09:41.082Z |
| 31341 | google_places | place_details | ok | 200 | — | 0 | $0.025 | 2026-07-12T09:09:41.428Z |
| 31342 | google_places | place_details | ok | 200 | — | 0 | $0.025 | 2026-07-12T09:09:41.521Z |
| 31343 | google_places | place_details | ok | 200 | — | 0 | $0.025 | 2026-07-12T09:09:41.665Z |
| 31344 | google_places | place_details | ok | 200 | — | 0 | $0.025 | 2026-07-12T09:09:41.753Z |
| 31345 | google_places | place_details | ok | 200 | — | 0 | $0.025 | 2026-07-12T09:09:41.912Z |
| 31346 | google_places | place_details | ok | 200 | — | 0 | $0.025 | 2026-07-12T09:09:42.434Z |
| 31347 | google_places | place_details | ok | 200 | — | 0 | $0.025 | 2026-07-12T09:09:42.980Z |
| 31348 | google_places | place_details | ok | 200 | — | 0 | $0.025 | 2026-07-12T09:09:43.299Z |
| 31349 | google_places | place_details | ok | 200 | — | 0 | $0.025 | 2026-07-12T09:09:43.457Z |
| 31350 | google_places | place_details | ok | 200 | — | 0 | $0.025 | 2026-07-12T09:09:43.934Z |
| 31351 | google_places | place_details | ok | 200 | — | 0 | $0.025 | 2026-07-12T09:09:44.188Z |
| 31352 | google_places | place_details | ok | 200 | — | 0 | $0.025 | 2026-07-12T09:09:44.286Z |
| 31353 | google_places | place_details | ok | 200 | — | 0 | $0.025 | 2026-07-12T09:09:44.329Z |
| 31354 | google_places | search_text | ok | 200 | — | 0 | $0.00 | 2026-07-12T09:09:44.772Z |
| 31355 | google_places | search_text | ok | 200 | — | 0 | $0.00 | 2026-07-12T09:09:44.939Z |
| 31356 | google_places | place_details | ok | 200 | — | 0 | $0.025 | 2026-07-12T09:09:45.021Z |
| 31357 | google_places | search_text | ok | 200 | — | 0 | $0.00 | 2026-07-12T09:09:45.113Z |
| 31358 | google_places | search_text | ok | 200 | — | 0 | $0.00 | 2026-07-12T09:09:45.506Z |
| 31359 | google_places | place_details | ok | 200 | — | 0 | $0.025 | 2026-07-12T09:09:45.705Z |
| 31360 | google_places | place_details | ok | 200 | — | 0 | $0.025 | 2026-07-12T09:09:45.783Z |
| 31361 | google_places | search_text | ok | 200 | — | 0 | $0.00 | 2026-07-12T09:09:45.865Z |
| 31362 | google_places | place_details | ok | 200 | — | 0 | $0.025 | 2026-07-12T09:09:45.915Z |
| 31363 | google_places | place_details | ok | 200 | — | 0 | $0.025 | 2026-07-12T09:09:45.994Z |
| 31364 | google_places | search_text | ok | 200 | — | 0 | $0.00 | 2026-07-12T09:09:46.187Z |
| 31365 | google_places | place_details | ok | 200 | — | 0 | $0.025 | 2026-07-12T09:09:46.359Z |
| 31366 | google_places | search_text | ok | 200 | — | 0 | $0.00 | 2026-07-12T09:09:46.424Z |
| 31367 | google_places | place_details | ok | 200 | — | 0 | $0.025 | 2026-07-12T09:09:46.442Z |
| 31368 | google_places | place_details | ok | 200 | — | 0 | $0.025 | 2026-07-12T09:09:46.694Z |
| 31369 | google_places | place_details | ok | 200 | — | 0 | $0.025 | 2026-07-12T09:09:46.870Z |
| 31370 | google_places | place_details | ok | 200 | — | 0 | $0.025 | 2026-07-12T09:09:47.034Z |
| 31371 | google_places | search_text | ok | 200 | — | 0 | $0.00 | 2026-07-12T09:09:47.209Z |
| 31372 | google_places | place_details | ok | 200 | — | 0 | $0.025 | 2026-07-12T09:09:47.221Z |
| 31373 | google_places | place_details | ok | 200 | — | 0 | $0.025 | 2026-07-12T09:09:47.383Z |
| 31374 | google_places | place_details | ok | 200 | — | 0 | $0.025 | 2026-07-12T09:09:47.629Z |
| 31375 | google_places | search_text | ok | 200 | — | 0 | $0.00 | 2026-07-12T09:09:47.992Z |
| 31376 | google_places | place_details | ok | 200 | — | 0 | $0.025 | 2026-07-12T09:09:48.158Z |
| 31377 | google_places | place_details | ok | 200 | — | 0 | $0.025 | 2026-07-12T09:09:48.372Z |
| 31378 | google_places | place_details | ok | 200 | — | 0 | $0.025 | 2026-07-12T09:09:48.891Z |
| 31379 | google_places | place_details | ok | 200 | — | 0 | $0.025 | 2026-07-12T09:09:48.975Z |
| 31380 | google_places | search_text | ok | 200 | — | 0 | $0.00 | 2026-07-12T09:09:49.114Z |
| 31381 | google_places | search_text | ok | 200 | — | 0 | $0.00 | 2026-07-12T09:09:49.440Z |
| 31382 | google_places | place_details | ok | 200 | — | 0 | $0.025 | 2026-07-12T09:09:49.615Z |
| 31383 | google_places | place_details | ok | 200 | — | 0 | $0.025 | 2026-07-12T09:09:49.783Z |
| 31384 | google_places | place_details | ok | 200 | — | 0 | $0.025 | 2026-07-12T09:09:49.984Z |
| 31385 | google_places | place_details | ok | 200 | — | 0 | $0.025 | 2026-07-12T09:09:50.246Z |
| 31386 | google_places | search_text | ok | 200 | — | 0 | $0.00 | 2026-07-12T09:09:50.323Z |
| 31387 | google_places | place_details | ok | 200 | — | 0 | $0.025 | 2026-07-12T09:09:50.486Z |
| 31388 | google_places | place_details | ok | 200 | — | 0 | $0.025 | 2026-07-12T09:09:50.913Z |
| 31389 | google_places | search_text | ok | 200 | — | 0 | $0.00 | 2026-07-12T09:09:51.006Z |
| 31390 | google_places | place_details | ok | 200 | — | 0 | $0.025 | 2026-07-12T09:09:51.362Z |
| 31391 | google_places | place_details | ok | 200 | — | 0 | $0.025 | 2026-07-12T09:09:51.784Z |
| 31392 | google_places | place_details | ok | 200 | — | 0 | $0.025 | 2026-07-12T09:09:51.909Z |
| 31393 | google_places | place_details | ok | 200 | — | 0 | $0.025 | 2026-07-12T09:09:52.439Z |
| 31394 | google_places | place_details | ok | 200 | — | 0 | $0.025 | 2026-07-12T09:09:52.501Z |
| 31395 | google_places | place_details | ok | 200 | — | 0 | $0.025 | 2026-07-12T09:09:52.668Z |
| 31396 | google_places | search_text | ok | 200 | — | 0 | $0.00 | 2026-07-12T09:09:52.936Z |
| 31397 | google_places | search_text | ok | 200 | — | 0 | $0.00 | 2026-07-12T09:09:52.984Z |
| 31398 | google_places | search_text | ok | 200 | — | 0 | $0.00 | 2026-07-12T09:09:54.212Z |
| 31399 | google_places | place_details | ok | 200 | — | 0 | $0.025 | 2026-07-12T09:09:54.377Z |
| 31400 | google_places | place_details | ok | 200 | — | 0 | $0.025 | 2026-07-12T09:09:54.468Z |
| 31401 | google_places | place_details | ok | 200 | — | 0 | $0.025 | 2026-07-12T09:09:54.548Z |
| 31402 | google_places | search_text | ok | 200 | — | 0 | $0.00 | 2026-07-12T09:09:54.614Z |
| 31403 | google_places | search_text | ok | 200 | — | 0 | $0.00 | 2026-07-12T09:09:54.886Z |
| 31404 | google_places | search_text | ok | 200 | — | 0 | $0.00 | 2026-07-12T09:09:55.344Z |
| 31405 | google_places | place_details | ok | 200 | — | 0 | $0.025 | 2026-07-12T09:09:55.412Z |
| 31406 | google_places | place_details | ok | 200 | — | 0 | $0.025 | 2026-07-12T09:09:55.897Z |
| 31407 | google_places | search_text | ok | 200 | — | 0 | $0.00 | 2026-07-12T09:09:55.926Z |
| 31408 | google_places | search_text | ok | 200 | — | 0 | $0.00 | 2026-07-12T09:09:55.974Z |
| 31409 | google_places | search_text | ok | 200 | — | 0 | $0.00 | 2026-07-12T09:09:56.003Z |
| 31410 | google_places | place_details | ok | 200 | — | 0 | $0.025 | 2026-07-12T09:09:56.084Z |
| 31411 | google_places | search_text | ok | 200 | — | 0 | $0.00 | 2026-07-12T09:09:56.242Z |
| 31412 | google_places | search_text | ok | 200 | — | 0 | $0.00 | 2026-07-12T09:09:56.398Z |
| 31413 | google_places | place_details | ok | 200 | — | 0 | $0.025 | 2026-07-12T09:09:56.423Z |
| 31414 | google_places | place_details | ok | 200 | — | 0 | $0.025 | 2026-07-12T09:09:56.469Z |
| 31415 | google_places | place_details | ok | 200 | — | 0 | $0.025 | 2026-07-12T09:09:56.481Z |
| 31416 | google_places | search_text | ok | 200 | — | 0 | $0.00 | 2026-07-12T09:09:56.505Z |
| 31417 | google_places | place_details | ok | 200 | — | 0 | $0.025 | 2026-07-12T09:09:56.723Z |
| 31418 | google_places | search_text | ok | 200 | — | 0 | $0.00 | 2026-07-12T09:09:56.858Z |
| 31419 | google_places | place_details | ok | 200 | — | 0 | $0.025 | 2026-07-12T09:09:57.150Z |
| 31420 | google_places | search_text | ok | 200 | — | 0 | $0.00 | 2026-07-12T09:09:57.187Z |
| 31421 | google_places | place_details | ok | 200 | — | 0 | $0.025 | 2026-07-12T09:09:57.360Z |
| 31422 | google_places | search_text | ok | 200 | — | 0 | $0.00 | 2026-07-12T09:09:57.508Z |
| 31423 | google_places | place_details | ok | 200 | — | 0 | $0.025 | 2026-07-12T09:09:57.618Z |
| 31424 | google_places | search_text | ok | 200 | — | 0 | $0.00 | 2026-07-12T09:09:57.699Z |
| 31425 | google_places | place_details | ok | 200 | — | 0 | $0.025 | 2026-07-12T09:09:57.787Z |
| 31426 | google_places | search_text | ok | 200 | — | 0 | $0.00 | 2026-07-12T09:09:58.022Z |
| 31427 | google_places | place_details | ok | 200 | — | 0 | $0.025 | 2026-07-12T09:09:58.039Z |
| 31428 | google_places | search_text | ok | 200 | — | 0 | $0.00 | 2026-07-12T09:09:58.294Z |
| 31429 | google_places | search_text | ok | 200 | — | 0 | $0.00 | 2026-07-12T09:09:58.350Z |
| 31430 | google_places | place_details | ok | 200 | — | 0 | $0.025 | 2026-07-12T09:09:58.397Z |
| 31431 | google_places | place_details | ok | 200 | — | 0 | $0.025 | 2026-07-12T09:09:58.431Z |
| 31432 | google_places | search_text | ok | 200 | — | 0 | $0.00 | 2026-07-12T09:09:58.510Z |
| 31433 | google_places | place_details | ok | 200 | — | 0 | $0.025 | 2026-07-12T09:09:59.119Z |
| 31434 | google_places | search_text | ok | 200 | — | 0 | $0.00 | 2026-07-12T09:09:59.253Z |
| 31435 | google_places | search_text | ok | 200 | — | 0 | $0.00 | 2026-07-12T09:09:59.332Z |
| 31436 | google_places | place_details | ok | 200 | — | 0 | $0.025 | 2026-07-12T09:09:59.415Z |
| 31437 | google_places | place_details | ok | 200 | — | 0 | $0.025 | 2026-07-12T09:09:59.490Z |
| 31438 | google_places | search_text | ok | 200 | — | 0 | $0.00 | 2026-07-12T09:09:59.574Z |
| 31439 | google_places | search_text | ok | 200 | — | 0 | $0.00 | 2026-07-12T09:09:59.661Z |
| 31440 | google_places | search_text | ok | 200 | — | 0 | $0.00 | 2026-07-12T09:09:59.890Z |
| 31441 | google_places | search_text | ok | 200 | — | 0 | $0.00 | 2026-07-12T09:09:59.973Z |
| 31442 | google_places | place_details | ok | 200 | — | 0 | $0.025 | 2026-07-12T09:10:00.449Z |
| 31443 | google_places | search_text | ok | 200 | — | 0 | $0.00 | 2026-07-12T09:10:00.527Z |
| 31444 | google_places | place_details | ok | 200 | — | 0 | $0.025 | 2026-07-12T09:10:00.574Z |
| 31445 | google_places | search_text | ok | 200 | — | 0 | $0.00 | 2026-07-12T09:10:00.800Z |
| 31446 | google_places | place_details | ok | 200 | — | 0 | $0.025 | 2026-07-12T09:10:00.947Z |
| 31447 | google_places | place_details | ok | 200 | — | 0 | $0.025 | 2026-07-12T09:10:01.053Z |
| 31448 | google_places | place_details | ok | 200 | — | 0 | $0.025 | 2026-07-12T09:10:01.119Z |
| 31449 | google_places | search_text | ok | 200 | — | 0 | $0.00 | 2026-07-12T09:10:01.132Z |
| 31450 | google_places | place_details | ok | 200 | — | 0 | $0.025 | 2026-07-12T09:10:01.353Z |
| 31451 | google_places | place_details | ok | 200 | — | 0 | $0.025 | 2026-07-12T09:10:01.459Z |
| 31452 | google_places | place_details | ok | 200 | — | 0 | $0.025 | 2026-07-12T09:10:02.024Z |
| 31453 | google_places | search_text | ok | 200 | — | 0 | $0.00 | 2026-07-12T09:10:02.318Z |
| 31454 | google_places | search_text | ok | 200 | — | 0 | $0.00 | 2026-07-12T09:10:02.889Z |
| 31455 | google_places | search_text | ok | 200 | — | 0 | $0.00 | 2026-07-12T09:10:02.971Z |
| 31456 | google_places | search_text | ok | 200 | — | 0 | $0.00 | 2026-07-12T09:10:03.058Z |
| 31457 | google_places | search_text | ok | 200 | — | 0 | $0.00 | 2026-07-12T09:10:03.218Z |
| 31458 | google_places | place_details | ok | 200 | — | 0 | $0.025 | 2026-07-12T09:10:03.295Z |
| 31459 | google_places | place_details | ok | 200 | — | 0 | $0.025 | 2026-07-12T09:10:03.559Z |
| 31460 | google_places | place_details | ok | 200 | — | 0 | $0.025 | 2026-07-12T09:10:03.636Z |
| 31461 | google_places | place_details | ok | 200 | — | 0 | $0.025 | 2026-07-12T09:10:03.733Z |
| 31462 | google_places | search_text | ok | 200 | — | 0 | $0.00 | 2026-07-12T09:10:04.067Z |
| 31463 | google_places | place_details | ok | 200 | — | 0 | $0.025 | 2026-07-12T09:10:04.076Z |
| 31464 | google_places | search_text | ok | 200 | — | 0 | $0.00 | 2026-07-12T09:10:04.242Z |
| 31465 | google_places | search_text | ok | 200 | — | 0 | $0.00 | 2026-07-12T09:10:04.575Z |
| 31466 | google_places | search_text | ok | 200 | — | 0 | $0.00 | 2026-07-12T09:10:04.576Z |
| 31467 | google_places | search_text | ok | 200 | — | 0 | $0.00 | 2026-07-12T09:10:04.737Z |
| 31468 | google_places | search_text | ok | 200 | — | 0 | $0.00 | 2026-07-12T09:10:04.742Z |
| 31469 | google_places | place_details | ok | 200 | — | 0 | $0.025 | 2026-07-12T09:10:05.461Z |
| 31470 | google_places | place_details | ok | 200 | — | 0 | $0.025 | 2026-07-12T09:10:05.544Z |
| 31471 | google_places | search_text | ok | 200 | — | 0 | $0.00 | 2026-07-12T09:10:05.545Z |
| 31472 | google_places | place_details | ok | 200 | — | 0 | $0.025 | 2026-07-12T09:10:05.712Z |
| 31473 | google_places | search_text | ok | 200 | — | 0 | $0.00 | 2026-07-12T09:10:06.559Z |
| 31474 | google_places | search_text | ok | 200 | — | 0 | $0.00 | 2026-07-12T09:10:06.610Z |
| 31475 | google_places | place_details | ok | 200 | — | 0 | $0.025 | 2026-07-12T09:10:06.685Z |
| 31476 | google_places | place_details | ok | 200 | — | 0 | $0.025 | 2026-07-12T09:10:06.732Z |
| 31477 | google_places | search_text | ok | 200 | — | 0 | $0.00 | 2026-07-12T09:10:06.794Z |
| 31478 | google_places | search_text | ok | 200 | — | 0 | $0.00 | 2026-07-12T09:10:06.850Z |
