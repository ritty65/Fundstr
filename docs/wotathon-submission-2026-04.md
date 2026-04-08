# Wotathon Submission 2026-04

## Goal

Position Fundstr as a credible `NIP-85 Excellence` entry for Wotathon by framing it as a trust-aware creator discovery and patronage client on Nostr.

## Submission angle

Fundstr uses portable, provider-signed NIP-85 trust metrics to help supporters discover creators, evaluate trust context, and make better patronage decisions before they message, donate, or subscribe.

This is the strongest story because Fundstr is already a real creator-support product. Instead of treating trust as an abstract score, Fundstr applies trust where economic decisions happen.

## Best prize target

- `NIP-85 Excellence (Trusted Assertions)`

This is the most realistic target because the current work is consumer-side NIP-85 integration, not a new trust-scoring engine or provider.

## Current Fundstr NIP-85 use-cases

Live on production:

1. Trusted-rank chip on public creator profiles
2. Trust explainer popover with links to NIP-85 and provider resources
3. Trusted-rank sort on `Find Creators`
4. Trusted-rank chips on creator discovery cards

## Why Fundstr fits Wotathon

Wotathon is explicitly about building open source libraries, relays, and applications that advance Web of Trust and integrate portable trust metrics into Nostr clients.

Fundstr fits as an application/client because it demonstrates that NIP-85 is useful in real creator discovery and patronage flows.

Strong points:

- live production deployment
- real user-facing client use-cases
- clear business model sustainability
- real creator economy context
- portable external trust consumption rather than private scoring

Weak point:

- Fundstr is not open source yet

This is likely not an automatic disqualifier, but it does weaken the `Documentation & Openness` scoring category.

## Open-source / openness note

Fundstr is not fully open source today.

Submission guidance:

- do not claim full open-source status if it is not true
- publish strong public documentation
- publish screenshots and a demo video
- publish a public technical explanation of the NIP-85 integration
- if possible, publish a small standalone public example or helper module for the NIP-85 reader logic

Recommended wording:

> Fundstr is not yet fully open source. For this submission, we are publishing public documentation, demo assets, and technical details for our NIP-85 integration, and we plan to open more of this work over time.

## Suggested submission title

`Fundstr: Portable Trust for Creator Discovery and Patronage on Nostr`

## Suggested one-paragraph submission summary

Fundstr is a Nostr-native creator support client that applies NIP-85 Trusted Assertions to creator discovery and patronage decisions. Instead of keeping trust as an abstract score, Fundstr uses portable, provider-signed NIP-85 metrics to improve creator discovery, profile context, and supporter decision-making before messaging, donating, or subscribing. This demonstrates a practical, user-facing NIP-85 application with clear product value and a sustainable business model.

## Judging criteria mapping

### Functional Readiness

- shipped to production
- profile and discovery UX are live

### Depth & Innovation

- multiple consumer-side NIP-85 use-cases
- trust applied directly to creator support decisions

### Interoperability

- consumes external provider-signed assertions
- does not replace trust with a private opaque score

### Decentralizing Ecosystem Impact

- adds one more real trust-aware Nostr client
- makes NIP-85 useful in a creator economy context

### Documentation & Openness

- must be strengthened with public-facing writeups and demo materials

### Business Model Sustainability

- strong fit because Fundstr is already a real creator-support product

## Submission checklist

Before submission, make sure all of these exist:

1. Live product URL
2. Demo video
3. Screenshots
4. Public technical writeup
5. Feature list of NIP-85 use-cases
6. Honest openness note
7. Contact / submission text ready for Formstr

## Demo flow

1. Open `Find Creators`
2. Switch sort mode to `Trusted rank`
3. Show trusted-rank chips on creator cards
4. Open a creator profile
5. Show trusted-rank chip and info popover
6. Show the user can inspect both the NIP-85 spec and provider resource
7. End on the donate / message / subscribe context

## Evidence

Current local evidence paths on this machine:

- Discovery screenshots:
  - `/home/ai_dev/Desktop/AI-Apps/Websites/Fundstr-main-wotathon-nip85-20260407/artifacts/wotathon-nip85-verification-2026-04-07/find-creators-trusted-rank.png`
  - `/home/ai_dev/Desktop/AI-Apps/Websites/Fundstr-main-wotathon-nip85-20260407/artifacts/wotathon-nip85-verification-2026-04-07/find-creators-trusted-rank-hero.png`
  - `/home/ai_dev/Desktop/AI-Apps/Websites/Fundstr-main-wotathon-nip85-20260407/artifacts/wotathon-nip85-verification-2026-04-07/find-creators-trusted-rank-card-focus.png`
- Profile screenshot:
  - `/home/ai_dev/Desktop/AI-Apps/Websites/Fundstr-main-wotathon-nip85-20260407/artifacts/wotathon-nip85-verification-2026-04-07/public-profile-trusted-rank.png`
- Live production discovery screenshots:
  - `/home/ai_dev/Desktop/AI-Apps/Websites/Fundstr-main-wotathon-nip85-20260407/artifacts/wotathon-live-evidence-2026-04-07-postmerge/live-find-creators-trusted-rank-query.png`
  - `/home/ai_dev/Desktop/AI-Apps/Websites/Fundstr-main-wotathon-nip85-20260407/artifacts/wotathon-live-evidence-2026-04-07-postmerge/live-public-profile-trusted-rank.png`

## Immediate next steps

1. Merge this documentation PR
2. Produce a short public demo video
3. Prepare the submission text in Formstr
4. Publish or share public-facing screenshots and writeup
5. Decide whether any part of the NIP-85 integration can be opened publicly before submission
