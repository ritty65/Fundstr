import { marked } from "marked";
import DOMPurify from "dompurify";
import type { Config } from "dompurify";

const CONFIG: Config = {
  USE_PROFILES: { html: true },
  FORBID_TAGS: ["img", "svg"],
  FORBID_ATTR: ["style"],
};

export function renderMarkdownSafe(markdown: string): string {
  if (!markdown) return "";
  const rendered = marked.parse(markdown);
  return DOMPurify.sanitize(String(rendered), CONFIG);
}

export function sanitizeHtml(html: string): string {
  return DOMPurify.sanitize(html, CONFIG);
}
