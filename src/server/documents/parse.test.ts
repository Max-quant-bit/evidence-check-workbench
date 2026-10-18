import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import { parseDocument } from "./parse.js";

async function makeDocx(): Promise<Buffer> {
  const archive = new JSZip();
  archive.file(
    "[Content_Types].xml",
    `<?xml version="1.0" encoding="UTF-8"?>
      <Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
        <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
        <Default Extension="xml" ContentType="application/xml"/>
        <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
      </Types>`,
  );
  archive.file(
    "word/document.xml",
    `<?xml version="1.0" encoding="UTF-8"?>
      <w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
        <w:body>
          <w:p><w:r><w:t>A fictional DOCX paragraph.</w:t></w:r></w:p>
          <w:p><w:r><w:t>A second synthetic paragraph.</w:t></w:r></w:p>
          <w:sectPr/>
        </w:body>
      </w:document>`,
  );
  return archive.generateAsync({ type: "nodebuffer" });
}

function makePdf(): Buffer {
  const content = Buffer.from(
    "BT\n/F1 12 Tf\n1 0 0 1 20 110 Tm\n(First PDF paragraph.) Tj\n1 0 0 1 20 90 Tm\n(Second PDF paragraph.) Tj\nET\n",
  );
  const objects = [
    Buffer.from("<< /Type /Catalog /Pages 2 0 R >>"),
    Buffer.from("<< /Type /Pages /Kids [3 0 R] /Count 1 >>"),
    Buffer.from(
      "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 144] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    ),
    Buffer.from("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>"),
    Buffer.concat([
      Buffer.from(`<< /Length ${content.length} >>\nstream\n`),
      content,
      Buffer.from("endstream"),
    ]),
  ];
  const parts = [Buffer.from("%PDF-1.4\n")];
  const offsets = [0];
  for (const [index, object] of objects.entries()) {
    offsets.push(Buffer.concat(parts).length);
    parts.push(
      Buffer.from(`${index + 1} 0 obj\n`),
      object,
      Buffer.from("\nendobj\n"),
    );
  }
  const xrefOffset = Buffer.concat(parts).length;
  parts.push(Buffer.from(`xref\n0 ${objects.length + 1}\n`));
  parts.push(Buffer.from("0000000000 65535 f \n"));
  for (const offset of offsets.slice(1)) {
    parts.push(Buffer.from(`${offset.toString().padStart(10, "0")} 00000 n \n`));
  }
  parts.push(
    Buffer.from(
      `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`,
    ),
  );
  return Buffer.concat(parts);
}

describe("parseDocument", () => {
  it("splits UTF-8 text into paragraphs and retains order", async () => {
    const chunks = await parseDocument(
      Buffer.from("First paragraph.\n\nSecond paragraph.\nContinued."),
      ".txt",
    );

    expect(chunks).toEqual([
      { content: "First paragraph.", page: null, paragraph: 1 },
      {
        content: "Second paragraph. Continued.",
        page: null,
        paragraph: 2,
      },
    ]);
  });

  it("rejects invalid UTF-8 instead of silently replacing characters", async () => {
    await expect(
      parseDocument(Buffer.from([0xc3, 0x28]), ".txt"),
    ).rejects.toThrow();
  });

  it("parses DOCX paragraphs as separate ordered chunks", async () => {
    const chunks = await parseDocument(await makeDocx(), ".docx");

    expect(chunks.map(({ content, paragraph, page }) => ({ content, paragraph, page }))).toEqual([
      {
        content: "A fictional DOCX paragraph.",
        paragraph: 1,
        page: null,
      },
      {
        content: "A second synthetic paragraph.",
        paragraph: 2,
        page: null,
      },
    ]);
  });

  it("retains PDF page and paragraph locations", async () => {
    const chunks = await parseDocument(makePdf(), ".pdf");

    expect(chunks).toEqual([
      { content: "First PDF paragraph.", page: 1, paragraph: 1 },
      { content: "Second PDF paragraph.", page: 1, paragraph: 2 },
    ]);
  });
});
