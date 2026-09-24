# Ambiguities — module TRV

Source: BRD v1.0 (`.brain/requirements/BRIEF.md`, transcribed from
`.brain/docs/ref/001-AI_Travel_Planner_BRD.pdf`). This is a greenfield build:
there is no running code, so none of these is settled "from the code".

Every question below appears word for word in the `ambiguities` list of each
requirement named under **Affects** in `trv.yaml`. The two lists must not diverge.

Where the project glossary (`.brain/glossary.md`) defines a term differently from
this BRD, the conflict is recorded here as a question rather than resolved.

---

## Privacy obligations

- **Affects:** REQ-TRV-008
- **The document says:** "Security: protect accounts, passwords, APIs and personal information." (BRD v1.0, §22)
- **Which could mean:**
  - (a) General good practice only, with no named law.
  - (b) A named law or policy (for example the Australian Privacy Act or GDPR), with rights such as account deletion and data export.
- **Question for the client:** Which privacy law or policy must the application follow, and must Travelers be able to delete their own account and data?
- **Why it matters:** (b) adds account deletion, possibly data export, and constraints on where data and AI requests may be processed.
- **Status:** Answered in `ANSWERS.md` (2026-09-23) and applied to REQ-TRV-001. Still open for REQ-TRV-008: the answer (account deletion, data export, privacy notice) adds no observable behaviour to "profile information is never returned to another Traveler". It needs a requirement of its own, or a decision that it does not apply to REQ-TRV-008.
