# Risk persistence model

Current OpenDay risk scores/warnings are **derived risks** calculated from canonical facts. There is no operational risk table with owner/status/due-date/closure lifecycle. Contractor-declared risks remain source report fields and immutable report evidence.

Sprint 4 does not create a hybrid lifecycle table or persist calculated scores. If operational risks are introduced later, they require a stable natural key `(project, rule, source)`, explicit acknowledgement/closure/reopening semantics and audited transitions. Derived condition disappearance must not silently delete an acknowledged operational record.

