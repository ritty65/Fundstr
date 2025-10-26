import { describe, it, expect, beforeEach, vi } from "vitest";
import { mount } from "@vue/test-utils";

const mocks = vi.hoisted(() => ({
  isTrustedUrl: vi.fn(),
  normalizeMediaUrl: vi.fn(),
  determineMediaType: vi.fn(),
}));

vi.mock("src/utils/validateMedia", () => mocks);

import MediaPreview from "src/components/MediaPreview.vue";
import * as validateMedia from "src/utils/validateMedia";

const mockedValidateMedia = vi.mocked(validateMedia);

function mountPreview(url: string, layout: "default" | "responsive" = "default") {
  return mount(MediaPreview, {
    props: { url, layout },
  });
}

describe("MediaPreview sanitization", () => {
  beforeEach(() => {
    mockedValidateMedia.normalizeMediaUrl.mockReset();
    mockedValidateMedia.isTrustedUrl.mockReset();
    mockedValidateMedia.determineMediaType.mockReset();
  });

  it("omits iframe when url is not trusted", () => {
    mockedValidateMedia.normalizeMediaUrl.mockReturnValue("https://www.youtube.com/embed/video12345");
    mockedValidateMedia.isTrustedUrl.mockReturnValue(false);
    mockedValidateMedia.determineMediaType.mockReturnValue("youtube");

    const wrapper = mountPreview("https://youtu.be/video12345");

    expect(mockedValidateMedia.normalizeMediaUrl).toHaveBeenCalledWith("https://youtu.be/video12345");
    expect(mockedValidateMedia.isTrustedUrl).toHaveBeenCalledWith("https://www.youtube.com/embed/video12345");
    expect(wrapper.find(".media-preview-container").exists()).toBe(false);
    expect(wrapper.find("iframe").exists()).toBe(false);
  });

  it("omits image when url is not trusted", () => {
    mockedValidateMedia.normalizeMediaUrl.mockReturnValue("https://cdn.example.com/image.png");
    mockedValidateMedia.isTrustedUrl.mockReturnValue(false);
    mockedValidateMedia.determineMediaType.mockReturnValue("image");

    const wrapper = mountPreview("https://example.com/image.png");

    expect(mockedValidateMedia.normalizeMediaUrl).toHaveBeenCalledWith("https://example.com/image.png");
    expect(mockedValidateMedia.isTrustedUrl).toHaveBeenCalledWith("https://cdn.example.com/image.png");
    expect(wrapper.find(".media-preview-container").exists()).toBe(false);
    expect(wrapper.find("img").exists()).toBe(false);
  });

  it("normalizes youtube links to embeds and renders iframe", () => {
    mockedValidateMedia.normalizeMediaUrl.mockReturnValue("https://www.youtube.com/embed/abcd1234xyz");
    mockedValidateMedia.isTrustedUrl.mockReturnValue(true);
    mockedValidateMedia.determineMediaType.mockReturnValue("youtube");

    const wrapper = mountPreview("https://youtu.be/abcd1234xyz");

    expect(mockedValidateMedia.determineMediaType).toHaveBeenCalledWith(
      "https://www.youtube.com/embed/abcd1234xyz",
    );
    const iframe = wrapper.get("iframe");
    expect(iframe.attributes("src")).toBe("https://www.youtube.com/embed/abcd1234xyz");
  });

  it("normalizes ipfs urls to https gateway and renders image", () => {
    mockedValidateMedia.normalizeMediaUrl.mockReturnValue(
      "https://nftstorage.link/ipfs/bafybeigdyrszipfsimage",
    );
    mockedValidateMedia.isTrustedUrl.mockReturnValue(true);
    mockedValidateMedia.determineMediaType.mockReturnValue("image");

    const wrapper = mountPreview("ipfs://bafybeigdyrszipfsimage");

    const img = wrapper.get("img");
    expect(img.attributes("src")).toBe("https://nftstorage.link/ipfs/bafybeigdyrszipfsimage");
  });

  it("normalizes nostr event urls and renders embedded iframe", () => {
    mockedValidateMedia.normalizeMediaUrl.mockReturnValue(
      "https://primal.net/e/nostrevent123?embed=1",
    );
    mockedValidateMedia.isTrustedUrl.mockReturnValue(true);
    mockedValidateMedia.determineMediaType.mockReturnValue("nostr");

    const wrapper = mountPreview("https://primal.net/e/nostrevent123");

    const iframe = wrapper.get("iframe");
    expect(iframe.attributes("src")).toBe("https://primal.net/e/nostrevent123?embed=1");
  });

  it("applies responsive layout styles only for trusted image urls", () => {
    mockedValidateMedia.normalizeMediaUrl.mockReturnValue("https://cdn.example.com/photo.webp");
    mockedValidateMedia.isTrustedUrl.mockReturnValue(true);
    mockedValidateMedia.determineMediaType.mockReturnValue("image");

    const wrapper = mountPreview("https://example.com/photo.webp", "responsive");

    const container = wrapper.get(".media-preview-container");
    expect(container.classes()).toContain("media-preview-container--responsive");
    expect(container.attributes("style")).toContain("--media-preview-aspect: auto");
  });

  it("does not apply responsive styles for non-image media", () => {
    mockedValidateMedia.normalizeMediaUrl.mockReturnValue("https://www.youtube.com/embed/abcd1234xyz");
    mockedValidateMedia.isTrustedUrl.mockReturnValue(true);
    mockedValidateMedia.determineMediaType.mockReturnValue("youtube");

    const wrapper = mountPreview("https://youtu.be/abcd1234xyz", "responsive");

    const container = wrapper.get(".media-preview-container");
    expect(container.classes()).not.toContain("media-preview-container--responsive");
    expect(container.attributes("style")).toBeUndefined();
  });
});
