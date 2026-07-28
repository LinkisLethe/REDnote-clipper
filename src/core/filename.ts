const WINDOWS_RESERVED = /[<>:"/\\|?*\u0000-\u001f]/g;
const TRAILING_DOTS_OR_SPACES = /[. ]+$/g;

export function sanitizeFilenamePart(value: string, fallback = "untitled"): string {
  const cleaned = value
    .replace(WINDOWS_RESERVED, " ")
    .replace(/\s+/g, " ")
    .replace(TRAILING_DOTS_OR_SPACES, "")
    .trim();
  return cleaned || fallback;
}

export function createMarkdownFilename(
  title: string,
  author: string,
  publishedAt?: string
): string {
  const date = (publishedAt || new Date().toISOString()).slice(0, 10);
  const base = [
    sanitizeFilenamePart(title),
    sanitizeFilenamePart(author, "unknown-author"),
    date
  ].join("_");
  return `${base.slice(0, 150).replace(TRAILING_DOTS_OR_SPACES, "")}.md`;
}
