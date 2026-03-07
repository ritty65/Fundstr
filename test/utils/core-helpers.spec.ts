import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { splitAmount, bytesToNumber } from "src/js/utils.js";
import { shortenString } from "src/js/string-utils.js";
import { encodeBase64, decodeBase64 } from "src/utils/base64";
import { step1Alice, step3Alice } from "src/js/dhke.js";
import * as nobleSecp256k1 from "@noble/secp256k1";
import { sha256 } from "@noble/hashes/sha256";

const ORIGINAL_RANDOM = nobleSecp256k1.utils.randomPrivateKey;
const ORIGINAL_SHA256 = nobleSecp256k1.utils.sha256;
const ORIGINAL_BYTES_TO_HEX = nobleSecp256k1.utils.bytesToHex;
const ORIGINAL_SUBTRACT = (nobleSecp256k1.Point.prototype as any).subtract;

function deterministicScalar(value: number): Uint8Array {
  const arr = new Uint8Array(32);
  arr[31] = value;
  return arr;
}

describe("utility helpers", () => {
  beforeEach(() => {
    nobleSecp256k1.utils.randomPrivateKey = () => deterministicScalar(1);
    nobleSecp256k1.utils.sha256 = async (msg: Uint8Array) => sha256(msg);
    nobleSecp256k1.utils.bytesToHex = nobleSecp256k1.etc.bytesToHex;
    if (typeof (nobleSecp256k1.Point.prototype as any).subtract !== "function") {
      (nobleSecp256k1.Point.prototype as any).subtract = function (other: any) {
        return this.add(other.negate());
      };
    }
  });

  afterEach(() => {
    nobleSecp256k1.utils.randomPrivateKey = ORIGINAL_RANDOM;
    nobleSecp256k1.utils.sha256 = ORIGINAL_SHA256;
    if (ORIGINAL_BYTES_TO_HEX) {
      nobleSecp256k1.utils.bytesToHex = ORIGINAL_BYTES_TO_HEX;
    } else {
      delete (nobleSecp256k1.utils as any).bytesToHex;
    }
    if (ORIGINAL_SUBTRACT) {
      (nobleSecp256k1.Point.prototype as any).subtract = ORIGINAL_SUBTRACT;
    } else {
      delete (nobleSecp256k1.Point.prototype as any).subtract;
    }
  });

  describe("splitAmount", () => {
    it.each([
      { value: 0, expected: [] },
      { value: 5, expected: [1, 4] },
      { value: 2561, expected: [1, 512, 2048] },
      { value: 0xffffffff, expected: Array.from({ length: 32 }, (_, i) => 2 ** i) },
    ])("returns binary chunks for %s", ({ value, expected }) => {
      expect(splitAmount(value)).toEqual(expected);
    });
  });

  describe("bytesToNumber", () => {
    it.each([
      { bytes: Uint8Array.from([0]), expected: 0n },
      { bytes: Uint8Array.from([0, 1]), expected: 1n },
      { bytes: Uint8Array.from([0xff, 0xff]), expected: 65535n },
      {
        bytes: Uint8Array.from([0x12, 0x34, 0x56, 0x78, 0x9a]),
        expected: 0x123456789an,
      },
    ])("converts %o to bigint", ({ bytes, expected }) => {
      expect(bytesToNumber(bytes)).toBe(expected);
    });
  });

  describe("shortenString", () => {
    it("returns truncated string when exceeding limit", () => {
      expect(shortenString("abcdefghijklmnopqrstuvwxyz", 5, 3)).toBe("abcde...xyz");
    });

    it("returns undefined when string fits within bounds", () => {
      expect(shortenString("short", 10, 3)).toBeUndefined();
    });
  });

  describe("base64 helpers", () => {
    const vector = Uint8Array.from([0, 1, 2, 255]);
    const encoded = "AAEC/w==";

    it("encodes bytes to base64", () => {
      expect(encodeBase64(vector)).toBe(encoded);
    });

    it("decodes base64 to bytes", () => {
      expect(Array.from(decodeBase64(encoded))).toEqual(Array.from(vector));
    });
  });

  describe("dhke flow", () => {
    it("generates deterministic step1 outputs with stubbed randomness", async () => {
      const message = new TextEncoder().encode("fundstr");
      const result = await step1Alice(message);
      const expectedR = nobleSecp256k1.etc.bytesToHex(deterministicScalar(1));
      expect(result.r).toBe(expectedR);

      const manualHashToCurve = async (input: Uint8Array) => {
        let working = input;
        for (;;) {
          const hash = sha256(working);
          const candidate = "02" + nobleSecp256k1.etc.bytesToHex(hash);
          try {
            return nobleSecp256k1.Point.fromHex(candidate);
          } catch {
            working = sha256(working);
          }
        }
      };

      const secretHex = nobleSecp256k1.etc.bytesToHex(message);
      const secretBytes = new TextEncoder().encode(secretHex);
      const Y = await manualHashToCurve(secretBytes);
      const P = nobleSecp256k1.Point.fromPrivateKey(1n);
      const expectedB = Y.add(P).toHex(true);
      expect(result.B_).toBe(expectedB);
    });

    it("removes Alice's blinding factor in step3", () => {
      const r = deterministicScalar(2);
      const A = nobleSecp256k1.Point.fromPrivateKey(5n);
      const C = nobleSecp256k1.Point.fromPrivateKey(7n);
      const blinded = C.add(A.multiply(bytesToNumber(r)));
      const unblinded = step3Alice(blinded, r, A);
      expect(unblinded.toHex(true)).toBe(C.toHex(true));
    });
  });
});
