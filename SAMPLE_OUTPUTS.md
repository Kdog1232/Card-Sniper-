# Card Sniper Sample Outputs

These examples document expected UX/output behavior after the premium-insert and low-comp updates.

## Downtown insert

```text
Card: Baker Mayfield • 2018 • Panini Donruss Optic • Downtown • #DT-BM
🔴 Market Data Weak
Only 2 sold comps found.
Price estimate may be unreliable.
Estimated Range: $540.00 - $715.00
Confidence: LOW (25/100)
Premium Insert: Downtown
Predicted Grade: PSA 9
Gem Score: 78
PSA 9 Value: $620.00
PSA 10 Value: $1,250.00
Grading Recommendation: Consider grading only if corners, edges, and surface are clean in HD photos.
```

Premium Downtown comps must include `Downtown` in the sold listing title. Generic Donruss Optic Baker Mayfield results are not allowed to set the value.

## Kaboom insert

```text
Card: Patrick Mahomes • 2020 • Panini Absolute • Kaboom
Estimated Value: $1,150.00
Confidence: HIGH (85/100)
Premium Insert: Kaboom
Predicted Grade: PSA 9
Gem Score: 82
PSA 9 Value: $1,275.00
PSA 10 Value: $2,350.00
Grading Recommendation: Grade if surface and corners pass deep-photo review.
```

Kaboom results prioritize exact `Kaboom` matches over generic Absolute set matches.

## Common base card

```text
Card: Jalen Hurts • 2023 • Panini Prizm • Base • #112
Estimated Value: $4.50
Confidence: MEDIUM (60/100)
Predicted Grade: PSA 9
Gem Score: 70
PSA 9 Value: $18.00
PSA 10 Value: $42.00
Grading Recommendation: Do not grade unless the card has exceptional centering and surface quality.
```

Base cards can use broader player/year/set/card-number sold comps when no premium insert is detected.

## Card with only 1 sold comp

```text
Card: Unknown Player • 2022 • Select • Zebra • #199
🔴 Market Data Weak
Only 1 sold comps found.
Price estimate may be unreliable.
Estimated Range: $135.00 - $187.00
Confidence: LOW (25/100)
Premium Insert: Zebra
Predicted Grade: Unknown
Gem Score: 55
PSA 9 Value: $0.00
PSA 10 Value: $0.00
Grading Recommendation: Low comp depth; do not rely on a precise value. Run deep grading before paying a premium.
```

When fewer than 3 reliable sold comps exist, Card Sniper displays a range instead of a single value and shows the market-data warning banner.
