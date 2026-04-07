# Fundstr NIP-85 Use Cases 2026-04

## Overview

Fundstr currently consumes NIP-85 trusted assertions from a pinned `nostr.band` provider and uses them in real creator discovery and profile flows.

The goal is not to change payment truth or subscription entitlement. The goal is to make trust useful before supporters take action.

## Provider configuration

- Provider label: `nostr.band`
- Relay: `wss://nip85.nostr.band`
- Current metric surfaced: `rank`
- Supported assertion kind: `30382`

## User-facing NIP-85 use-cases

### 1. Public creator profile trust chip

What it does:

- shows `Trusted rank <n>` on public creator profiles when a valid provider assertion exists

Why it matters:

- gives supporters a visible trust signal before they message, donate, or subscribe

Current implementation files:

- `src/stores/nostr.ts`
- `src/pages/PublicCreatorProfilePage.vue`

### 2. Public creator profile trust explainer

What it does:

- adds a compact info popover next to trusted rank
- explains that the score is provider-signed
- links to the NIP-85 spec and provider resource

Why it matters:

- makes the trust signal inspectable and explainable

Current implementation files:

- `src/pages/PublicCreatorProfilePage.vue`

### 3. Discovery sort by trusted rank

What it does:

- adds a `Trusted rank` sort mode to `Find Creators`
- ranks creators by provider-signed trust score when available

Why it matters:

- makes NIP-85 useful before a profile click
- turns trust into a discovery primitive

Current implementation files:

- `src/stores/nostr.ts`
- `src/stores/creators.ts`
- `src/pages/FindCreators.vue`

### 4. Trusted-rank chips on creator cards

What it does:

- shows `Trusted rank <n>` directly on discovery cards

Why it matters:

- keeps the trust signal visible inside creator search/discovery grids

Current implementation files:

- `src/components/CreatorCard.vue`
- `src/stores/creators.ts`

## Data flow

1. Resolve creator pubkeys
2. Read NIP-85 rank assertions from the pinned provider relay
3. Normalize and validate rank values
4. Attach trusted metrics in parallel to creator rows
5. Use the metrics in:
   - profile chips
   - profile popover context
   - discovery sorting
   - creator-card chips

## Guardrails

Fundstr does not currently use NIP-85 for:

- payment verification
- subscription entitlement
- unlock rules
- wallet balances
- creator ownership/authentication

This is intentional. NIP-85 is being used as a discovery and trust-context layer only.

## Acceptance criteria achieved

### Product behavior

- trusted-rank visible on public creator profiles
- explainer popover opens and links work
- `Trusted rank` sort appears in discovery when trusted metrics exist
- trusted-rank chips render on creator cards
- missing trusted-rank data does not break UI

### Technical behavior

- native profile/follower fields are not overwritten
- trusted metrics remain parallel data
- provider relay is pinned
- invalid or missing rank values are ignored silently

## Test coverage

Relevant test files:

- `test/vitest/__tests__/PublicCreatorProfilePage.phonebook.spec.ts`
- `test/vitest/__tests__/creators.spec.ts`
- `test/vitest/__tests__/creatorCard.discovery.spec.ts`

Validation completed:

- focused NIP-85 specs passed
- full `pnpm test` passed
- full `pnpm build` passed

## Proof artifacts

Local verification screenshots:

- `/home/ai_dev/Desktop/AI-Apps/Websites/Fundstr-main-wotathon-nip85-20260407/artifacts/wotathon-nip85-verification-2026-04-07/find-creators-trusted-rank.png`
- `/home/ai_dev/Desktop/AI-Apps/Websites/Fundstr-main-wotathon-nip85-20260407/artifacts/wotathon-nip85-verification-2026-04-07/find-creators-trusted-rank-card-focus.png`
- `/home/ai_dev/Desktop/AI-Apps/Websites/Fundstr-main-wotathon-nip85-20260407/artifacts/wotathon-nip85-verification-2026-04-07/public-profile-trusted-rank.png`

Live verification screenshots:

- `/home/ai_dev/Desktop/AI-Apps/Websites/Fundstr-main-wotathon-nip85-20260407/artifacts/wotathon-live-evidence-2026-04-07-postmerge/live-find-creators-trusted-rank-query.png`
- `/home/ai_dev/Desktop/AI-Apps/Websites/Fundstr-main-wotathon-nip85-20260407/artifacts/wotathon-live-evidence-2026-04-07-postmerge/live-public-profile-trusted-rank.png`

## Best demo framing

Use this message consistently:

> Fundstr helps supporters discover creators they can trust by applying portable NIP-85 trust metrics directly to discovery and patronage decisions.

## Remaining strongest improvements

If more time exists before submission:

1. Add a public-facing demo video
2. Add a public-facing technical explainer
3. Improve openness by publishing at least a small public NIP-85 example/helper
4. Optionally add provider selection or personalized provider support later
