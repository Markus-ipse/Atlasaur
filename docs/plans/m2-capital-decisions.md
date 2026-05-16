# M2 — Capital + notabilityTier decisions

Resolves the "Hand-curated data worth a second pair of eyes" section
that was open in `m2-followups.md`. Documents per-row decisions so a
future reviewer doesn't have to re-litigate.

## Multi-capital schema

For administrative-split countries (constitutional capital is one city,
seat of government is another), we now keep **both** instead of picking
one. The primary `capital` field stays the constitutional/de jure pick
(preserving the existing roadmap policy); a new optional
`capitalAlternates: string[]` field holds the de facto / commercial /
legislative seat(s). The miss-reveal renders
`Capitals: primary, ...alternates` (plural label, comma-separated) when
`capitalAlternates` is non-empty.

Pulled this slice of work forward from M3 because keeping a single
"correct" capital was the most common reviewer complaint on M2. The
matcher side (accepting either name as a typed answer in a
country-to-capital mode) is still M3 work — there's no capital-typing
mode today.

### Rows updated

| iso3 | Primary       | Alternates                       | Rationale |
|------|---------------|----------------------------------|-----------|
| BOL  | Sucre         | La Paz                           | Sucre is constitutional; La Paz is the seat of government. |
| LKA  | Colombo       | Sri Jayawardenepura Kotte        | **Exception to "primary = constitutional"**: SJK is the legislative/ceremonial capital but the name is unwieldy; Colombo (commercial/common-use) reads more naturally as the primary. |
| CIV  | Yamoussoukro  | Abidjan                          | Yamoussoukro is the official capital; Abidjan is the de facto economic seat. |
| BEN  | Porto-Novo    | Cotonou                          | Porto-Novo is the official capital; Cotonou is the de facto economic seat. |
| ZAF  | Pretoria      | Cape Town, Bloemfontein          | Pretoria = executive, Cape Town = legislative, Bloemfontein = judicial. Three on one line wraps acceptably. |
| SWZ  | Mbabane       | Lobamba                          | Mbabane is administrative; Lobamba is the royal/legislative capital. |
| NLD  | Amsterdam     | The Hague                        | Amsterdam is constitutional; The Hague is the seat of government and home to most ministries. |

### Deferred: political disputes (ISR, PSE)

Israel (Jerusalem) and Palestine (Ramallah) stay **single-capital**.
"Multi-capital" here describes administrative splits — constitutional
vs. seat-of-government — not territorial disputes. Adding "Tel Aviv"
or "East Jerusalem" as alternates would embed a policy stance in app
data we don't want to take on lightly. Revisit only if the issue is
raised by users.

## notabilityTier verdicts

The `notabilityTier` is a soft 0/1/2 scheduling hint that M5 will use
for introduction order — no tests pin specific values. The m2-followups
doc flagged several borderline rows; verdicts below.

Tier definitions:
- **2** = named unaided by a non-geography-buff adult.
- **1** = named by someone with moderate geographic awareness.
- **0** = needs prompting.

| Country               | Was | Now | Verdict |
|-----------------------|-----|-----|---------|
| Botswana              | 1   | 1   | KEEP — known for Okavango / safari press, but not unaided name-recall. |
| Madagascar            | 1   | **2** | BUMP — animated film franchise + large island + biodiversity press push it into unaided recall territory. |
| Kazakhstan            | 1   | 1   | KEEP — size is famous, country name less so to casual learner. |
| Algeria               | 1   | 1   | KEEP — geography-aware adults; not unaided global. |
| Bhutan                | 1   | 1   | KEEP — cultural press, Himalayan presence (note: was already at 1, not 0 as m2-followups suggested). |
| Bahamas               | 1   | 1   | KEEP — already at 1 (the m2-followups doc proposing 0→1 was outdated). |
| Trinidad and Tobago   | 0   | 0   | KEEP. |
| Brunei                | 0   | 0   | KEEP. |

Only Madagascar moves. The rest stay where they were — re-tunable in
one column edit + rebuild if M5 surfaces a real ordering problem.
