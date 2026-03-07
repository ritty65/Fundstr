import { describe, expect, it } from "vitest";
import { mergeProfileMetaFromPhonebook } from "src/utils/phonebookEnrichment";

const phonebookProfile = {
  pubkey: "abc",
  name: "nostrname",
  display_name: "Display Name",
  about: "About from phonebook",
  picture: "https://example.com/pic.png",
  nip05: "user@example.com",
};

describe("mergeProfileMetaFromPhonebook", () => {
  it("fills missing profile fields from phonebook data", () => {
    const existing = {
      display_name: null,
      name: "",
      about: "",
      picture: "",
      nip05: null,
    };

    const merged = mergeProfileMetaFromPhonebook(existing, phonebookProfile);

    expect(merged.display_name).toBe("Display Name");
    expect(merged.name).toBe("nostrname");
    expect(merged.about).toBe("About from phonebook");
    expect(merged.picture).toBe("https://example.com/pic.png");
    expect(merged.nip05).toBe("user@example.com");
  });

  it("treats whitespace-only fields as missing", () => {
    const existing = {
      display_name: "   ",
      name: "nostrname", // name already present, should not be overridden
      about: "   \t ",
      picture: "  \n  ",
      nip05: " ",
    };

    const merged = mergeProfileMetaFromPhonebook(existing, phonebookProfile);

    expect(merged.display_name).toBe("Display Name");
    expect(merged.name).toBe("nostrname");
    expect(merged.about).toBe("About from phonebook");
    expect(merged.picture).toBe("https://example.com/pic.png");
    expect(merged.nip05).toBe("user@example.com");
  });

  it("does not override existing profile data", () => {
    const existing = {
      display_name: "Existing name",
      name: "existing-handle",
      about: "Existing about",
      picture: "https://example.com/current.png",
      nip05: "me@site.tld",
    };

    const merged = mergeProfileMetaFromPhonebook(existing, {
      ...phonebookProfile,
      display_name: "Phonebook Name",
      name: "phonebook-name",
      about: "New about",
      picture: "https://example.com/new.png",
      nip05: "new@site.tld",
    });

    expect(merged.display_name).toBe("Existing name");
    expect(merged.name).toBe("existing-handle");
    expect(merged.about).toBe("Existing about");
    expect(merged.picture).toBe("https://example.com/current.png");
    expect(merged.nip05).toBe("me@site.tld");
  });
});
