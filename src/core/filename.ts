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

export function createVersionedMarkdownFilename(
  filename: string,
  createdAt = new Date(),
  collisionIndex = 1
): string {
  const stem = filename.replace(/\.md$/i, "");
  const pad = (value: number) => String(value).padStart(2, "0");
  const stamp = [
    createdAt.getFullYear(),
    pad(createdAt.getMonth() + 1),
    pad(createdAt.getDate())
  ].join("") + "-" + [
    pad(createdAt.getHours()),
    pad(createdAt.getMinutes()),
    pad(createdAt.getSeconds())
  ].join("");
  const collisionSuffix = collisionIndex > 1 ? `-${collisionIndex}` : "";
  return `${stem}_更新-${stamp}${collisionSuffix}.md`;
}
