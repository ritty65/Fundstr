# Find Creators – E2E Smoke Notes

## Chrome
- Load `/find-creators` on broadband: skeletons render immediately and featured creators populate in ~1s.
- Search by npub or keyword returns matching profiles. No console relay errors.

## Firefox (ETP strict)
- Avatars load via proxy or fall back to placeholder; no broken images.
- Page renders without layout thrash warnings.

## Offline / Poor Network
- With network throttled, skeletons remain visible until data arrives. Counts hydrate when connection recovers.

## Relay Down Scenario
- If one primary relay is unreachable, page still loads using remaining relays and logs a single warning.
