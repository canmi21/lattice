# Which binary runs, and what is recorded of it

The local agents a request is handed to, what happens when one is throttled or out of allowance,
which model each job gets, and the provenance stored beside every answer.

## Five binaries, one task

Every runner is a local agent rather than an API client: a binary taking one prompt
non-interactively and returning one answer. There is no key here and no request to assemble.
`Runner` chooses among assistants that can all do the same jobs. A capability that exists
for only one provider is not a runner choice; see [twitter.md](../twitter.md).
`--model claude` uses `claude`; `--model gemini` and `--model gpt-oss` use `agy`; `--model
codex` uses `codex exec`; `--model cursor` uses `cursor-agent` in read-only ask mode; and
`--model grok` uses `grok` with an explicit model id, the same shape as Codex and Cursor.

Codex has three translation tiers: `gpt-5.6-luna-medium`, `gpt-5.6-terra-medium`, and
`gpt-5.6-terra-high`. Cursor has one, `composer-2.5`, so every tier maps to it. Grok has two:
`grok-4.5` for structural work and `grok-4.6` for prose and for a retry. There is no third
model to escalate to. A visual Codex request attaches the image to the invocation; Claude,
Gemini, and Cursor read the path named in the prompt. Grok takes the image as ACP content
blocks on `--prompt-json`, with `data` and `mimeType` at the top of the block -- the help
text names the flag but not that shape, and the Anthropic-style
`{"source":{"type":"base64",...}}` nesting is rejected. Vision uses `grok-4.6`, the prose
model: both tiers can see, measured, so this is the same quality judgement as the text
split, not a capability gate.

`--model` continues to name the runner. For an intentional comparison rather than ordinary
routing, the article commands `cms summary`, `cms tn`, `cms i18n`, and `cms locale` additionally
accept a concrete `--model-id` under the runners whose CLIs take one -- Codex, with an optional
`--effort`, and Claude, model name alone. The `locale` override also covers
summary translations that share its queue with tags and image descriptions. That pair pins every
request and retry in the run to one tier, bypassing structural routing and failure escalation; it
is opt-in because the normal translation default remains the open-weight model. Model and effort
stay separate at the command line because that is how Codex accepts them, while the provenance
record joins them into the project's existing tier-shaped name.

Grok's CLI is a coding agent by default: it discovers `Agents.md`, skills, hooks, memories and
repository tools even when `-p` asks one text question. Ordinary runner work needs none of that.
Summary, translation, classification and vision calls therefore replace its system prompt with a
stateless text-transform contract, expose no tools, disable search and subagents, and allow one
turn. Twitter lookup is the deliberate exception: it uses the agent path and its own bounded flags
because finding a tweet is the task rather than transforming bytes already present in the prompt.

Article translation runs at four requests in flight by default. `cms i18n --parallel N` overrides
that limit for an intentional run and requires a positive integer. Completion order owns queue
progress: the first request to finish is persisted and immediately replaced, so one long segment
cannot leave otherwise available slots idle. The flag controls simultaneous paid requests, not
the number of locales; a fresh segment still asks for all eight locales in one request, while a
repair asks only for the missing subset.

`gpt-oss` records `openai` as its provider even though `agy` delivers it. The weights are
OpenAI's; the binary is only the road it arrived by. Grok records `xai` the same way: the
weights are xAI's, and `grok` is only the road they arrive by.

They differ in what they report. Claude's envelope names the model that actually ran, so that
is what gets recorded. The other runners do not, so what was _asked for_ is stored instead --
a weaker fact, and the code says which kind it is rather than letting both look alike. Codex's
JSONL reports tokens; Cursor's and Grok's text output does not. None of `agy`, Codex, Cursor,
or Grok reports a cost, so `usd` stays zero rather than being estimated: a run's cost is
either measured or visibly absent.

Gemini spells reasoning effort into the model id (`-medium`, `-high`) rather than taking it as
a separate flag, so one string names both the model and the tier and there is no second
setting to keep in step.

## Congestion is waited out; a spent allowance stops

Two refusals look alike -- exit code 1, status `ERROR`, a sentence about capacity -- and only
the reset time separates them. `Resets in 0s` is the runner asking to be asked again;
`Resets in 167h29m42s` is the account being out until it is not.

Congestion is retried with an exponential wait and does **not** consume an attempt: nothing
was wrong with the request, the runner was busy. The only limit on waiting is the allowance
itself, so a run rides out throttling and stops only when there is genuinely nothing left.

Getting this wrong costs in both directions: treating congestion as exhaustion abandons a run
a minute before it would have worked, and treating exhaustion as congestion hammers a dead
account for a week.

## A spent allowance is a stopping point, not a failure

`agy` exits 1 when the quota is gone and still prints a full envelope explaining it, reset
time included. Reading the exit status first and bailing threw that away: one real run
reported a hundred and one identical empty errors, having fired a hundred and one requests
that could not have succeeded.

So the envelope is read before the exit code is consulted, and exhaustion is a distinct
outcome from failure. It stops the run, keeps everything already written, and prints what the
runner said. Exit status is zero, because nothing went wrong -- the allowance simply ran out.

Running again after the reset resumes exactly where it stopped, since only missing segments
are ever requested.

`cms i18n --frontmatter` narrows paid requests to the allowlisted title, subtitle and
description values. The complete article still participates in layout and orphan validation;
the flag changes request selection only, so asking for metadata cannot silently make body
segments look stale or complete.

## Text and vision have separate defaults

A pure text translation given no `--model` uses `gpt-oss` through `agy`. It does not need the
strongest model available, and a default that spends a scarcer allowance would be overridden
every time it is used.

A task that has to inspect an image uses `gpt-5.6-terra-medium` through Codex. Vision needs a
model that can actually receive the image, and the balanced Terra tier is the default rather
than either the light Luna route or the high-effort escalation route.

`cms summary` is the third case, and the only text task that does not take the cheap default.
It asks for a summary that withholds the article's conclusion, which is a constraint the model
has to hold against what summarising normally means, and the open-weight model measurably does
not hold it: it handed over an entire proposed design and then appended "reaches a surprising
conclusion", and it gave the author of a first-person essay a pronoun the article never uses.
Both are worse than a clumsy sentence -- one spends the article, the other invents a fact about
a person. Translation carries no comparable trap, which is why it stays cheap.

## Models are chosen by structure, not by a difficulty score

Headings and directive attributes go to the light model. Prose and quotations go to the
standard one. That split rests on what a block _is_, not on an estimate of how hard it is.

Scoring content for difficulty is tempting and unfounded. Length, punctuation density and
script mixing are all weak proxies, and the things that actually make a passage hard -- a pun,
a register, a cultural reference -- are exactly what cannot be counted. Worse, the failure is
silent: nothing tells you the light model flattened a joke.

The one signal worth acting on is one that happened. Two failed validations escalate to the
strong model, because a failure is an event and a score never was.

## What is recorded, and what only a person may write

Per segment and locale: the text, the provider, the model, the timestamp the request was sent,
the seconds it took, the tokens it cost, and `review`.

`review` is false until a person reads the translation and says otherwise. A machine may write
a translation; only a person may vouch for one.

The model is read from the response envelope where one is reported. What ran is a runtime
fact, and a model's account of itself is not. A runner that reports no resolved model records
what was requested instead. `model::anonymous` remains the route for a future provider that
can only identify itself inside the answer.

## Model names

The families order their parts differently and none is normalised into another's shape. Dots
become hyphens, everything is lower case, and the provider is its own field rather than a
prefix. An OpenAI runner that includes reasoning effort in the requested id keeps it there.

| provider    | shape                                  | examples                                             |
| ----------- | -------------------------------------- | ---------------------------------------------------- |
| `anthropic` | `claude-{variant}-{version}`           | `claude-sonnet-5`, `claude-haiku-4-5`                |
| `openai`    | `gpt-{version}[-{variant}][-{effort}]` | `gpt-5`, `gpt-5-6-terra-medium`, `gpt-5-6-sol-xhigh` |
| `alibaba`   | `qwen-{version}[-{variant}]`           | `qwen-3`, `qwen-2-5-max`, `qwen-3-235b-a22b`         |
| `deepseek`  | `deepseek-{variant}`                   | `deepseek-v3`, `deepseek-r1`, `deepseek-coder-v2`    |
| `cursor`    | `composer-{version}`                   | `composer-2-5`                                       |
| `xai`       | `grok-{version}`                       | `grok-4-5`, `grok-4-6`                               |

A self-report is believed only as far as it agrees with itself: `openai/claude-sonnet-5` is
discarded, because recording it would read as a fact and is not one.

Runners pin a build and report it that way -- `claude-haiku-4-5-20251001`. The date is removed
before recording, because keeping it would make two runs of one model look like two models,
which is the question this field exists to answer. The ids above are enumerated rather than
matched by pattern: no pattern covers both part orders without also accepting nonsense. An id
absent from the list is still recorded exactly as it arrived; recognition is not a gate, and
inventing a name for an unfamiliar model would be worse than storing an unfamiliar one.
