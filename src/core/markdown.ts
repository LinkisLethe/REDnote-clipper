import type { Note, OcrImageResult, UiLanguage } from "./types";

const headings = {
  "zh-CN": {
    body: "正文",
    imageText: "图片文字",
    image: "图片"
  },
  en: {
    body: "Content",
    imageText: "Text from images",
    image: "Image"
  }
} as const;

function yamlString(value: string): string {
  return JSON.stringify(value);
}

function yamlList(values: string[]): string {
  return `[${values.map(yamlString).join(", ")}]`;
}

function cleanMarkdownText(value: string): string {
  return value.replace(/\r\n?/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

export function applyOcrResults(
  note: Note,
  results: Array<OcrImageResult | null>
): Note {
  return {
    ...note,
    images: note.images.map((image, index) => ({
      ...image,
      ocr: results[index] ?? undefined
    }))
  };
}

export function renderMarkdown(
  note: Note,
  options: { language: UiLanguage; includeOcr: boolean }
): string {
  const t = headings[options.language];
  const successfulOcr = options.includeOcr
    ? note.images.map((image) => image.ocr).filter((result) => Boolean(result?.text))
    : [];
  const frontmatter = [
    "---",
    `title: ${yamlString(note.title)}`,
    `source: ${yamlString(note.url)}`,
    `platform: ${yamlString(note.platform)}`,
    `note_id: ${yamlString(note.id)}`,
    `author: ${yamlString(note.authorName)}`,
    `author_id: ${yamlString(note.authorId || "")}`,
    `published_at: ${yamlString(note.publishedAt || "")}`,
    `captured_at: ${yamlString(note.capturedAt)}`,
    `tags: ${yamlList(note.tags)}`,
    `liked_count: ${yamlString(note.metrics.likedCount || "")}`,
    `collected_count: ${yamlString(note.metrics.collectedCount || "")}`,
    `comment_count: ${yamlString(note.metrics.commentCount || "")}`,
    `shared_count: ${yamlString(note.metrics.sharedCount || "")}`,
    `ocr: ${String(options.includeOcr)}`,
    `ocr_image_count: ${successfulOcr.length}`,
    "---"
  ];
  const sections = [frontmatter.join("\n"), `# ${note.title}`];
  const body = cleanMarkdownText(note.body);
  if (body) {
    sections.push(`## ${t.body}\n\n${body}`);
  }
  if (successfulOcr.length > 0) {
    const images = successfulOcr.map((result) => {
      const value = result as OcrImageResult;
      return `### ${t.image} ${value.imageIndex + 1}\n\n${cleanMarkdownText(value.text)}`;
    });
    sections.push(`## ${t.imageText}\n\n${images.join("\n\n")}`);
  }
  return `${sections.join("\n\n")}\n`;
}
