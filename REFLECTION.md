# Reflection Report — Research Navigator

## Reflection

### How did the Spec evolve? What triggered each revision?

The spec began as a faithful translation of the assignment rubric into a
system architecture. The first draft was structurally sound but empirically
untested — I had built a machine that looked correct from the outside.

The first revision was triggered by a single observation: the citation graph
showed 1 node. Tracing backward, I found the root cause was not in the
visualization layer but two levels deeper — the collection pipeline never
called the citation API, so the database table was always empty. This
cascaded silently: the graph route queried an empty table, found no
neighbors, and returned the seed alone.

This forced a more honest framing of the spec: not "build the modules" but
"build modules that produce real output on real data." The second spec
treated API response times and data distributions as first-class constraints.
Every module got a verification step: what does the actual HTTP response
look like? What does the year distribution of collected papers look like?
Only then did the remaining bugs surface — the report persistence issue and
the empty institutions chart, both invisible from reading code alone.

### In which modules did AI exceed expectations?

The AI's output was strongest where the problem was well-scoped and
verification was cheap: the debate module (4 differentiated roles × 3 rounds
of genuine back-and-forth argumentation), the research proposal generator
(structured JSON → formal proposal text with novelty scoring), and the trend
narrative engine (statistical claims with p-values from corpus data). These
required no iteration — the first generation was production-quality.

The citation graph visualization was a genuine surprise. The force-directed
layout with opacity-encoded recency, hub glow effects, trajectory highlights,
and a minimal dark aesthetic emerged from one implementation pass. The report
HTML export — a typeset, dark-themed document with appendix tables — was
similarly complete without revision.

### Which parts required human intervention, and why?

I think there are two:

**Architectural diagnosis.** When the graph returned 1 node, the natural AI
response (if prompted naively to "fix the graph") would have been to modify
the frontend rendering logic. The actual bug was in the pipeline — a missing
API call three layers away. Tracing causality through a multi-service system
requires holding the whole architecture in working memory and reasoning about
what *should* be in the database versus what *is*. The AI assisted
effectively once I had identified and scoped the problem; it could not
surface the problem itself.

**Honest constraint acceptance.** For fast-moving topics, 2025 papers
represented only ~33% of the corpus because Semantic Scholar's index lags
preprint submissions by weeks. The correct response is transparency about
this constraint, not workarounds. That judgment — between apparent
completeness and actual accuracy — is not delegatable.

### If you did it again, what would you change?

**Stick with one main code gen tool.** In the begining, I used an end-to-end
app generation tool (whatever you call it), called "replit (https://replit.com)". 
I was intended to use it to generate a MVP version and modify it with more 
fine-grained claude code later. But I found it time-consuming to immigrate code 
from replit to my local machine and github. Barely you need to refract the project 
to deduplicate the code caused by replit configuration.
  

**Separate "does it run" from "does it work."** The AI-generated scaffolding
was impressive precisely because it ran — routes registered, tabs rendered,
queries returned. This creates a false sense of completion. The instinct to
ship something that *looks* done is amplified by AI tools because the gap
between a working skeleton and a working system is invisible until you
inject real data and observe real outputs.

**Invest earlier in data inspection.** The year-distribution bug and the
empty institutions chart were both detectable with two SQL queries. I found
them late because I was reading code, not querying data. With AI tools
accelerating implementation, the bottleneck shifts toward verification —
and verification requires looking at actual outputs, not plausible logic.

---

The deeper lesson: AI collapses the cost of generating plausible
implementations to near zero. What remains expensive — and compounds in
value as the generated surface area grows — is the judgment required to
distinguish *plausible* from *correct*.
