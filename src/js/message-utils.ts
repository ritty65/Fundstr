export function sanitizeMessage(message: unknown, maxLength = 1000): string {
  if (typeof message !== "string" || !message) return "";
  const sanitized = message.replace(/[^\x09\x0A\x0D\x20-\x7E]/g, "");
  return sanitized.slice(0, maxLength);
}
