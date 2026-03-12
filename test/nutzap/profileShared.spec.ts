import { describe, expect, it } from "vitest";

import { parseTiersContent } from "src/nutzap/profileShared";
import {
  buildTierPayloadForKind,
  CANONICAL_TIER_KIND,
  LEGACY_TIER_KIND,
} from "src/nutzap/relayPublishing";

describe("parseTiersContent", () => {
  it("parses wrapped canonical tier payloads", () => {
    const tiers = parseTiersContent(
      JSON.stringify({
        v: 1,
        tiers: [
          {
            id: "founders",
            title: "Founders Club",
            price: 5000,
            frequency: "monthly",
            description: "Early access",
          },
        ],
      }),
    );

    expect(tiers).toHaveLength(1);
    expect(tiers[0]).toMatchObject({
      id: "founders",
      title: "Founders Club",
      price: 5000,
      frequency: "monthly",
      description: "Early access",
    });
  });

  it("parses legacy top-level tier arrays", () => {
    const tiers = parseTiersContent(
      JSON.stringify([
        {
          id: "legacy",
          title: "Legacy Supporter",
          price_sats: 2100,
          frequency: "one_time",
        },
      ]),
    );

    expect(tiers).toHaveLength(1);
    expect(tiers[0]).toMatchObject({
      id: "legacy",
      title: "Legacy Supporter",
      price: 2100,
      frequency: "one_time",
    });
  });

  it("preserves media type and title through publish payloads", () => {
    const canonicalPayload = buildTierPayloadForKind(
      [
        {
          id: "media-tier",
          title: "Video Tier",
          price: 7000,
          frequency: "monthly",
          media: [
            {
              url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
              type: "video",
              title: "Launch video",
            },
          ],
        },
      ],
      CANONICAL_TIER_KIND,
    );
    const legacyPayload = buildTierPayloadForKind(
      [
        {
          id: "media-tier",
          title: "Video Tier",
          price: 7000,
          frequency: "monthly",
          media: [
            {
              url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
              type: "video",
              title: "Launch video",
            },
          ],
        },
      ],
      LEGACY_TIER_KIND,
    );

    const canonicalTiers = parseTiersContent(JSON.stringify(canonicalPayload));
    const legacyTiers = parseTiersContent(JSON.stringify(legacyPayload));

    expect(canonicalTiers[0]?.media?.[0]).toMatchObject({
      type: "video",
      title: "Launch video",
    });
    expect(legacyTiers[0]?.media?.[0]).toMatchObject({
      type: "video",
      title: "Launch video",
    });
  });
});
