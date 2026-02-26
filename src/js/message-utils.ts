const CONTROL_CHARS_REGEX = /[\p{Cc}\p{Cf}]/gu;
const SAFE_CONTROL_CHARS = new Set(["\n", "\r", "\t", "\u200c", "\u200d"]);

function isAllowedControlChar(char: string): boolean {
  if (SAFE_CONTROL_CHARS.has(char)) {
    return true;
  }
  const codePoint = char.codePointAt(0);
  if (codePoint === undefined) {
    return false;
  }
  if (codePoint >= 0xfe00 && codePoint <= 0xfe0f) {
    return true;
  }
  if (codePoint >= 0xe0100 && codePoint <= 0xe01ef) {
    return true;
  }
  return false;
}

function trimToLength(input: string, maxLength: number): string {
  if (input.length <= maxLength) return input;
  let result = "";
  let count = 0;
  for (const char of input) {
    if (count >= maxLength) break;
    result += char;
    count += 1;
  }
  return result;
}

export function sanitizeMessage(message: unknown, maxLength = 1000): string {
  if (typeof message !== "string" || !message) return "";

  const sanitized = message.replace(CONTROL_CHARS_REGEX, (char) =>
    isAllowedControlChar(char) ? char : "",
  );

  return trimToLength(sanitized, maxLength);
}
