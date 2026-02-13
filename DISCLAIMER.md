# Legal Disclaimer

**READ THIS CAREFULLY BEFORE USING THIS SOFTWARE**

## Not Legal Advice

This software (the "Tool") is provided for **informational and research purposes only**. It does **NOT** constitute professional legal advice, and must not be relied upon as a substitute for professional legal counsel.

### What This Means

- **No Attorney-Client Relationship**: Use of this Tool does not create an attorney-client relationship
- **No Professional Responsibility**: The authors and contributors assume no professional responsibility for decisions made based on information from this Tool
- **Verification Required**: ALL legal information, citations, and conclusions must be independently verified with official sources and qualified legal professionals before being relied upon

## Professional Use Warnings

### For Legal Professionals

If you are a lawyer, legal researcher, or other legal professional:

- **Malpractice Risk**: Relying on unverified information from this Tool in professional legal work may constitute professional malpractice
- **Professional Obligations**: You remain solely responsible for verifying all citations, statutes, and legal positions before advising clients or filing documents
- **Bar Association Rules**: Nederlandse Orde van Advocaten members must comply with confidentiality rules when using AI tools (see [PRIVACY.md](PRIVACY.md))
- **Client Disclosure**: Consider whether professional ethics rules require disclosing AI tool use to clients

### Duty of Independent Verification

**YOU MUST VERIFY EVERYTHING.** Do not cite, quote, or rely on any provision, case law, or legal interpretation from this Tool without:

1. Checking the official source (wetten.overheid.nl, rechtspraak.nl, or commercial legal databases)
2. Verifying the provision is currently in force and has not been amended
3. Reading the full context of cited provisions
4. Consulting case law and preparatory works (kamerstukken) for interpretation
5. Considering how recent legal developments may affect the matter

## Data Authority and Limitations

### Source Authority

This Tool aggregates data from multiple sources with varying levels of authority:

| Source | Authority Level | Use Case |
|--------|----------------|----------|
| **wetten.overheid.nl** | Official government source | Statute text (authoritative) |
| **rechtspraak.nl** | Official judiciary source | Court decisions (authoritative) |
| **EUR-Lex** | Official EU legislation database | EU directives/regulations metadata (authoritative) |

### Data Coverage

The Tool includes:
- **12 major Dutch statutes** (Burgerlijk Wetboek, Wetboek van Strafrecht, etc.)
- **202,000+ court decisions** from rechtspraak.nl
- **948 EU documents** with Dutch implementation references

### Commercial Legal Databases

For professional legal work, **always cross-check with commercial legal databases** such as:

- **Navigator (Wolters Kluwer)** - editorially verified, with annotations and commentary
- **Kluwer Navigator** - comprehensive Dutch legal database
- **Sdu Wettenbundel** - official statute collections
- **Rechtspraak.nl** - official court decisions portal (free)

These services provide editorial oversight, comprehensive annotations, and professional-grade currency guarantees that this Tool **cannot** provide.

## Currency and Staleness

### No Real-Time Updates

- Database updates are **manual** and may lag official publications by **weeks or months**
- Dutch law changes continuously through new statutes, amendments, and court decisions
- **Last-updated timestamps** in tool responses indicate data age, but should be treated as unreliable

### Staleness Warnings

The Tool includes staleness warnings when data is >30 days old. **These warnings are not exhaustive**:

- Even "fresh" data may be outdated if recent amendments were published
- Staleness warnings do not guarantee completeness or accuracy
- Always check official sources for the current legal position

### Amendments and Repeals

- A provision marked "in force" may have been:
  - Amended after the last database update
  - Repealed but not yet removed from the database
  - Subject to transitional rules affecting its applicability
- The Tool does **NOT** automatically track amendments in real-time

## Coverage Gaps

### What's Missing

This Tool does **NOT** include:

1. **Full EU Law Text** — Only EU metadata included; full directive/regulation text not available
2. **CJEU Case Law** — Court of Justice of the European Union decisions are binding but not included
3. **Historical Statute Versions** — Limited availability of historical provision wording
4. **Legal Commentary** — No editorial annotations, academic commentary, or practice guides
5. **Lower Court Decisions** — Coverage focuses on higher courts; many lower court decisions absent
6. **Legislative History** — Limited coverage of preparatory works (kamerstukken)

### Impact on Professional Use

These gaps mean:

- **Incomplete Legal Research**: Tool results are inherently incomplete and may miss critical authorities
- **Context Missing**: Without commentary and preparatory works, interpretation may be incorrect
- **EU Law Blind Spots**: Cannot assess whether Dutch provision implements EU law or conflicts with CJEU precedent

## No Warranties

### "AS IS" — No Guarantees

Per the Apache 2.0 license (see [LICENSE](LICENSE)):

- **NO WARRANTY OF ACCURACY**: Data may contain errors, omissions, or outdated information
- **NO WARRANTY OF COMPLETENESS**: Searches may miss relevant provisions or cases
- **NO WARRANTY OF FITNESS**: Not warranted as fit for professional legal use
- **NO WARRANTY OF NON-INFRINGEMENT**: No guarantee that use complies with professional rules or regulations

### Limitation of Liability

- Authors and contributors are **NOT LIABLE** for damages arising from use of this Tool
- This includes but is not limited to:
  - Professional malpractice claims
  - Lost cases or adverse judgments
  - Client harm from erroneous advice
  - Regulatory sanctions
  - Reputational damage

## AI-Generated Content

This Tool uses **algorithmic search and ranking** that may:

- Return irrelevant or misleading results
- Miss critical provisions
- Rank less relevant provisions higher than more relevant ones
- Make errors in parsing, citation formatting, or cross-referencing

**Human review is MANDATORY** before relying on any AI-generated search results or analysis.

## EU AI Act Compliance

This Tool is a **general-purpose AI system** under the EU AI Act. It is NOT a high-risk "administration of justice" system (which applies to AI used by courts and prosecutors for case outcomes).

### Transparency Obligations (Article 50, 52)

- **AI Disclosure**: This Tool uses AI/algorithmic methods for search and ranking
- **User Awareness**: Users are notified that results are AI-generated and require verification
- **Transparency**: This documentation provides information about limitations and risks

### User Obligations

- **Verify AI Output**: Always verify AI-generated citations and search results
- **Human Oversight**: Do not use Tool output in professional legal work without human review
- **Professional Rules**: Comply with applicable professional ethics rules regarding AI tool use

## Professional Ethics Considerations

### Confidentiality

- See [PRIVACY.md](PRIVACY.md) for detailed confidentiality considerations
- **Query Data**: Queries made through Claude API may be logged by Anthropic (subject to their privacy policy)
- **Client Information**: Do not include client names, case-specific details, or confidential information in queries
- **Sensitive Matters**: For privileged legal matters, consider on-premise deployment (see [PRIVACY.md](PRIVACY.md#on-premise-deployment))

### Competence and Diligence

Using this Tool does not reduce your professional obligations to:

- Exercise independent legal judgment
- Conduct thorough legal research using authoritative sources
- Stay current with legal developments
- Provide competent representation

## Recommended Workflow for Professional Use

1. **Initial Research**: Use Tool for preliminary research and hypothesis generation
2. **Official Verification**: Cross-check ALL results with official sources (wetten.overheid.nl, rechtspraak.nl)
3. **Commercial Databases**: Use Navigator, Kluwer, or Sdu for authoritative, annotated versions
4. **Professional Judgment**: Apply independent legal analysis and professional judgment
5. **Document Sources**: Cite official sources in legal work, not this Tool
6. **Update Check**: Before finalizing legal work, check for recent amendments and decisions

## Data Sources and Government Policy

This Tool uses data from official Dutch government sources:

- **wetten.overheid.nl** (BWB - Basiswettenbestand)
- **rechtspraak.nl** (Open Data Rechtspraak)
- **EUR-Lex** (EU legislation)

All data is sourced in accordance with the Dutch Government's Open Data policy and the EU's Public Sector Information (PSI) Directive.

## Changes to This Disclaimer

This disclaimer may be updated as the Tool evolves or legal/regulatory requirements change. Check the [GitHub repository](https://github.com/Ansvar-Systems/Dutch-law-mcp) for the current version.

## Questions?

For questions about this disclaimer or the Tool's limitations, please open an issue on GitHub:
https://github.com/Ansvar-Systems/Dutch-law-mcp/issues

---

**Last Updated**: 2026-02-13
**Tool Version**: 1.0.0 (Production-Grade)

---

## Summary: What You Must Do

✅ **ALWAYS VERIFY** all legal information with official sources
✅ **NEVER RELY** on this Tool as sole basis for legal advice or professional work
✅ **UNDERSTAND** this is a research aid, not a substitute for professional legal databases
✅ **ACKNOWLEDGE** data may be incomplete, outdated, or incorrect
✅ **COMPLY** with professional ethics rules regarding AI tool use and client confidentiality
✅ **DISCLOSE** to clients if required by professional rules

❌ **DO NOT** cite this Tool as an authority in legal documents
❌ **DO NOT** use in professional legal work without independent verification
❌ **DO NOT** rely on staleness warnings as guarantee of currency
❌ **DO NOT** assume coverage is complete or comprehensive
❌ **DO NOT** include confidential client information in queries
