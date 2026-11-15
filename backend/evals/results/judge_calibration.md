# Judge calibration: baseline run (2026-11-15)
Reviewer: Claude (acting as domain expert, checked against data/corpus)
Judge: deepseek-flash · Metrics reviewed: correctness + groundedness on all 18 cases (36 verdicts)

| Agreement | Borderline | Disagree |
|---|---|---|
| 36/36 (100%) | 1 | 0 |

- **seismo_approval / correctness ✗**: answer says "the Director" but omits "Director of Exploration, Halima Sato". The question asks *who*, so the strict FAIL is defensible. Borderline.
- **launch_order / groundedness ✗**: answer claims "ODY-04 launched in 2239"; the corpus only says it *landed* in 2239. A real, subtle unsupported inference. Judge correct.

Caveat: 36 verdicts from 1 run is a small sample. Re-calibrate when prompts or judge model change.
