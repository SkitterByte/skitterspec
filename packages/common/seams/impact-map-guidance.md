<!--
Injected into the `## Impact` section of every skill that writes a spec
(/spec, /spec-bug, /spec-hotfix). Those three carried this paragraph verbatim —
measured at 91-92% identical, the rest being a per-type caveat and the example
table rows, both of which stay local to each skill.
-->
<The concrete surfaces this spec touches — the scannable blast radius, so a
reader can eyeball where the spec got something wrong without reading prose.
`Change` is `add` · `update` · `remove`. `Surface` is guided-but-open: use
values like Endpoint, Route/UI, Schema/model, DB table/migration, Domain object,
Service, CLI command, Config key, Skill/rule, Business rule — or whatever fits
this project (skitterspec itself is a CLI with no HTTP surface). Keep `Detail`
terse — names/signatures, not sentences. List **only** surfaces that actually
change; the heading is always present, but if nothing external changes write the
single line below instead of an empty table.>
