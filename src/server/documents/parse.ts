import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import mammoth from "mammoth";
import { htmlToText } from "html-to-text";
import sanitizeHtml from "sanitize-html";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";

const pdfjsRoot = path.resolve(
  path.dirname(
    fileURLToPath(import.meta.resolve("pdfjs-dist/legacy/build/pdf.mjs")),
  ),
  "../..",
);
const standardFontDataUrl = pathToFileURL(
  `${path.join(pdfjsRoot, "standard_fonts")}${path.sep}`,
).href;

export interface ParsedChunk {
  content: string;
  page: number | null;
  paragraph: number;
}

function toChunks(text: string, page: number | null): ParsedChunk[] {
  return text
    .split(/\r?\n(?:[ \t]*\r?\n)+/)
    .map((paragraph) => paragraph.replace(/\s*\r?\n\s*/g, " ").trim())
    .filter(Boolean)
    .map((content, index) => ({ content, page, paragraph: index + 1 }));
}

async function parseDocx(buffer: Buffer): Promise<ParsedChunk[]> {
  const { value } = await mammoth.convertToHtml({ buffer });
  const safeHtml = sanitizeHtml(value, {
    allowedTags: [
      "p",
      "br",
      "strong",
      "em",
      "ul",
      "ol",
      "li",
      "h1",
      "h2",
      "h3",
      "h4",
      "h5",
      "h6",
      "blockquote",
    ],
    allowedAttributes: {},
  });
  const blockHtml = safeHtml.match(
    /<(p|li|h[1-6]|blockquote)(?:\s[^>]*)?>[\s\S]*?<\/\1>/gi,
  );
  const paragraphs = blockHtml?.length
    ? blockHtml
        .map((block) => htmlToText(block, { wordwrap: false }).trim())
        .filter(Boolean)
    : toChunks(htmlToText(safeHtml, { wordwrap: false }), null).map(
        (chunk) => chunk.content,
      );
  return paragraphs.map((content, index) => ({
    content,
    page: null,
    paragraph: index + 1,
  }));
}

async function parsePdf(buffer: Buffer): Promise<ParsedChunk[]> {
  const loadingTask = getDocument({
    data: new Uint8Array(buffer),
    standardFontDataUrl,
  });
  const pdf = await loadingTask.promise;
  const chunks: ParsedChunk[] = [];

  try {
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber);
      try {
        const content = await page.getTextContent();
        const paragraphs: string[] = [];
        let paragraphLines: string[] = [];
        let lineParts: string[] = [];
        let lastBaseline: number | null = null;
        let lastHeight = 0;
        let lineBaseline = 0;
        let lineHeight = 0;

        const flushParagraph = () => {
          const paragraph = paragraphLines.join(" ").trim();
          if (paragraph) paragraphs.push(paragraph);
          paragraphLines = [];
        };
        const flushLine = () => {
          const line = lineParts.join("").replace(/\s+/g, " ").trim();
          lineParts = [];
          if (!line) return;
          if (
            lastBaseline !== null &&
            Math.abs(lastBaseline - lineBaseline) >
              Math.max(8, ((lastHeight + lineHeight) / 2) * 1.5)
          ) {
            flushParagraph();
          }
          paragraphLines.push(line);
          lastBaseline = lineBaseline;
          lastHeight = lineHeight;
        };

        for (const item of content.items) {
          if (!("str" in item)) continue;
          lineParts.push(item.str);
          lineBaseline = item.transform[5];
          lineHeight = item.height;
          if (item.hasEOL) flushLine();
        }
        flushLine();
        flushParagraph();
        chunks.push(
          ...paragraphs.map((paragraph, index) => ({
            content: paragraph,
            page: pageNumber,
            paragraph: index + 1,
          })),
        );
      } finally {
        page.cleanup();
      }
    }
  } finally {
    await loadingTask.destroy();
  }

  return chunks;
}

export async function parseDocument(
  buffer: Buffer,
  extension: ".docx" | ".pdf" | ".txt",
): Promise<ParsedChunk[]> {
  if (extension === ".docx") return parseDocx(buffer);
  if (extension === ".pdf") return parsePdf(buffer);

  const text = new TextDecoder("utf-8", { fatal: true })
    .decode(buffer)
    .replace(/^\uFEFF/, "");
  return toChunks(text, null);
}
