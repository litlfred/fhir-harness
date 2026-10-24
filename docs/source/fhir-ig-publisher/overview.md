The **FHIR IG Publisher** is HL7's tool for turning an implementation guide's
sources into a published site. In this knowledge graph it is a *mechanical
actor* — something a process hands work to, with declared inputs and outputs —
rather than a command that happens to appear in a workflow file.

Writing it down matters because of how it is usually encountered here: as a
`java -jar` line in a skill, and as a Docker image name in somebody else's
workflow. Neither says what it consumes, what it produces, what it resolves on
your behalf, or what it **cannot** be asked for. A reader who knows only the
invocation will reach for it to answer questions it has no way to answer, and
will credit it with work done by the steps around it.

That last mistake is the common one. An IG build that adds pre- and
post-processing makes the Publisher **one step** among many. Much of what a
reader sees on such a published IG (API sidecars, JSON Schemas, JSON-LD
vocabularies) is produced *after* the Publisher exits, by scripts, and is not
the Publisher's work at all.
