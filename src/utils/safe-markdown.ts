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
  const rendered = marked.parse(markdown, { mangle: false, headerIds: false });
  return DOMPurify.sanitize(rendered, CONFIG);
}

export function sanitizeHtml(html: string): string {
  return DOMPurify.sanitize(html, CONFIG);
}
