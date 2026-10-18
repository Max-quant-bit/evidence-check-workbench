import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import express, {
  type ErrorRequestHandler,
  type NextFunction,
  type Request,
  type Response,
} from "express";
import multer from "multer";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { evidenceClaimSchema } from "../shared/claim.js";
import { db, databasePath } from "./db/index.js";
import {
  documentChunks,
  documents,
  evidenceClaims,
  projects,
} from "./db/schema.js";
import { parseDocument } from "./documents/parse.js";
import { llmProvider } from "./providers/llm.js";

const app = express();
const uploadRoot = path.join(path.dirname(path.resolve(databasePath)), "uploads");
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
const MAX_PARAGRAPHS = 5_000;
const INSERT_BATCH_SIZE = 500;
const allowedTypes: Record<string, string> = {
  ".docx":
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".pdf": "application/pdf",
  ".txt": "text/plain",
};

class UploadValidationError extends Error {}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_UPLOAD_BYTES, files: 1 },
  fileFilter: (_request, file, callback) => {
    const extension = path.extname(file.originalname).toLowerCase();
    if (allowedTypes[extension] !== file.mimetype) {
      callback(new UploadValidationError("Choose a DOCX, PDF, or TXT file."));
      return;
    }
    callback(null, true);
  },
});

app.disable("x-powered-by");
app.use(express.json({ limit: "100kb" }));

const createProjectSchema = z.object({ name: z.string().trim().min(1).max(100) });

app.get("/api/health", (_request, response) => {
  response.json({ status: "ok" });
});

app.get("/api/projects", (_request, response, next) => {
  db.select()
    .from(projects)
    .orderBy(projects.createdAt)
    .then((result) => response.json(result))
    .catch(next);
});

app.post("/api/projects", (request, response, next) => {
  const parsed = createProjectSchema.safeParse(request.body);
  if (!parsed.success) {
    response.status(400).json({ error: "Project name must be 1–100 characters." });
    return;
  }

  db.insert(projects)
    .values({ name: parsed.data.name, createdAt: new Date().toISOString() })
    .returning()
    .then(([project]) => response.status(201).json(project))
    .catch(next);
});

app.get("/api/projects/:projectId/documents", (request, response, next) => {
  const projectId = Number(request.params.projectId);
  if (!Number.isSafeInteger(projectId) || projectId < 1) {
    response.status(400).json({ error: "Invalid project." });
    return;
  }

  db.select()
    .from(documents)
    .where(eq(documents.projectId, projectId))
    .orderBy(documents.createdAt)
    .then(async (rows) => {
      const summaries = await Promise.all(
        rows.map(async (document) => {
          const chunks = await db
            .select({ id: documentChunks.id })
            .from(documentChunks)
            .where(eq(documentChunks.documentId, document.id));
          return {
            id: document.id,
            filename: document.filename,
            mimeType: document.mimeType,
            sizeBytes: document.sizeBytes,
            createdAt: document.createdAt,
            chunkCount: chunks.length,
          };
        }),
      );
      response.json(summaries);
    })
    .catch(next);
});

app.post(
  "/api/projects/:projectId/documents",
  upload.single("file"),
  async (request: Request, response: Response, next: NextFunction) => {
    try {
      const projectId = Number(request.params.projectId);
      if (!Number.isSafeInteger(projectId) || projectId < 1) {
        response.status(400).json({ error: "Invalid project." });
        return;
      }

      const [project] = await db
        .select({ id: projects.id })
        .from(projects)
        .where(eq(projects.id, projectId));
      if (!project) {
        response.status(404).json({ error: "Project not found." });
        return;
      }
      if (!request.file) {
        response.status(400).json({ error: "Choose a DOCX, PDF, or TXT file." });
        return;
      }

      const file = request.file;
      const extension = path.extname(file.originalname).toLowerCase() as
        | ".docx"
        | ".pdf"
        | ".txt";
      let chunks;
      try {
        chunks = await parseDocument(file.buffer, extension);
      } catch (error) {
        console.warn("Document parsing failed.", error);
        response.status(422).json({
          error: "The file could not be parsed. Check that it is a valid, text-based document.",
        });
        return;
      }
      if (chunks.length === 0) {
        response.status(422).json({ error: "No readable paragraphs were found." });
        return;
      }
      if (chunks.length > MAX_PARAGRAPHS) {
        response.status(413).json({
          error: `Documents are limited to ${MAX_PARAGRAPHS.toLocaleString()} paragraphs.`,
        });
        return;
      }

      const safeOriginalName = path.posix
        .basename(file.originalname.replaceAll("\\", "/"))
        .split("")
        .filter((character) => {
          const codePoint = character.codePointAt(0) ?? 0;
          return codePoint > 0x1f && (codePoint < 0x7f || codePoint > 0x9f);
        })
        .join("")
        .slice(0, 255);
      const storageKey = `${crypto.randomUUID()}${extension}`;
      await fs.mkdir(uploadRoot, { recursive: true, mode: 0o700 });
      const destination = path.join(uploadRoot, storageKey);
      await fs.chmod(uploadRoot, 0o700);
      await fs.writeFile(destination, file.buffer, { flag: "wx", mode: 0o600 });

      try {
        const document = db.transaction((transaction) => {
          const [inserted] = transaction
            .insert(documents)
            .values({
              projectId,
              filename: safeOriginalName || `document${extension}`,
              mimeType: file.mimetype,
              sizeBytes: file.size,
              storageKey,
              createdAt: new Date().toISOString(),
            })
            .returning()
            .all();
          for (let start = 0; start < chunks.length; start += INSERT_BATCH_SIZE) {
            transaction
              .insert(documentChunks)
              .values(
                chunks.slice(start, start + INSERT_BATCH_SIZE).map((chunk) => ({
                  documentId: inserted.id,
                  content: chunk.content,
                  page: chunk.page,
                  paragraph: chunk.paragraph,
                })),
              )
              .run();
          }
          return inserted;
        });
        response.status(201).json({
          id: document.id,
          filename: document.filename,
          mimeType: document.mimeType,
          sizeBytes: document.sizeBytes,
          createdAt: document.createdAt,
          chunkCount: chunks.length,
        });
      } catch (error) {
        try {
          await fs.unlink(destination);
        } catch (cleanupError) {
          console.error("Could not remove an unreferenced uploaded file.", cleanupError);
        }
        throw error;
      }
    } catch (error) {
      next(error);
    }
  },
);

app.get("/api/documents/:documentId/chunks", async (request, response, next) => {
  const documentId = Number(request.params.documentId);
  if (!Number.isSafeInteger(documentId) || documentId < 1) {
    response.status(400).json({ error: "Invalid document." });
    return;
  }

  try {
    const rows = await db
      .select({
        id: documentChunks.id,
        content: documentChunks.content,
        page: documentChunks.page,
        paragraph: documentChunks.paragraph,
      })
      .from(documentChunks)
      .where(eq(documentChunks.documentId, documentId))
      .orderBy(documentChunks.id);
    response.json(rows);
  } catch (error) {
    next(error);
  }
});

app.post(
  "/api/documents/:documentId/extract",
  async (request, response, next) => {
    const documentId = Number(request.params.documentId);
    if (!Number.isSafeInteger(documentId) || documentId < 1) {
      response.status(400).json({ error: "Invalid document." });
      return;
    }

    try {
      const [document] = await db
        .select()
        .from(documents)
        .where(eq(documents.id, documentId));
      if (!document) {
        response.status(404).json({ error: "Document not found." });
        return;
      }

      const existing = await db
        .select()
        .from(evidenceClaims)
        .where(eq(evidenceClaims.documentId, documentId));
      if (existing.length > 0) {
        response.json(existing.map(serializeClaim));
        return;
      }

      const chunks = await db
        .select()
        .from(documentChunks)
        .where(eq(documentChunks.documentId, documentId))
        .orderBy(documentChunks.id);
      const extracted = [];
      for (const chunk of chunks) {
        extracted.push(
          ...(await llmProvider.extract(chunk.content, {
            documentName: document.filename,
            page: chunk.page,
            paragraph: chunk.paragraph,
          })),
        );
      }
      const claims = extracted.map((claim) => evidenceClaimSchema.parse(claim));
      const createdAt = new Date().toISOString();
      const rows = claims.length
        ? db.transaction((transaction) => {
            const inserted = [];
            for (
              let start = 0;
              start < claims.length;
              start += INSERT_BATCH_SIZE
            ) {
              const claimBatch = claims
                .slice(start, start + INSERT_BATCH_SIZE)
                .map((claim) => ({
                projectId: document.projectId,
                documentId,
                chunkId:
                  chunks.find(
                    (chunk) =>
                      chunk.page === claim.page &&
                      chunk.paragraph === claim.paragraph,
                  )?.id ?? chunks[0].id,
                ...claim,
                entities: JSON.stringify(claim.entities),
                numbers: JSON.stringify(claim.numbers),
                dates: JSON.stringify(claim.dates),
                status: "unverified" as const,
                createdAt,
                }));
              inserted.push(
                ...transaction
                  .insert(evidenceClaims)
                  .values(claimBatch)
                  .returning()
                  .all(),
              );
            }
            return inserted;
          })
        : [];
      response.json(rows.map(serializeClaim));
    } catch (error) {
      next(error);
    }
  },
);

app.patch("/api/claims/:claimId/verify", async (request, response, next) => {
  const claimId = Number(request.params.claimId);
  if (!Number.isSafeInteger(claimId) || claimId < 1) {
    response.status(400).json({ error: "Invalid claim." });
    return;
  }

  try {
    const [claim] = await db
      .update(evidenceClaims)
      .set({ status: "human_verified" })
      .where(eq(evidenceClaims.id, claimId))
      .returning();
    if (!claim) {
      response.status(404).json({ error: "Claim not found." });
      return;
    }
    response.json(serializeClaim(claim));
  } catch (error) {
    next(error);
  }
});

function serializeClaim(
  claim: typeof evidenceClaims.$inferSelect,
) {
  return {
    ...claim,
    entities: JSON.parse(claim.entities) as string[],
    numbers: JSON.parse(claim.numbers) as string[],
    dates: JSON.parse(claim.dates) as string[],
  };
}

if (process.env.NODE_ENV === "production") {
  const clientRoot = path.resolve("dist/client");
  app.use(express.static(clientRoot));
  app.get("*", (_request, response) =>
    response.sendFile(path.join(clientRoot, "index.html")),
  );
}

const errorHandler: ErrorRequestHandler = (error, _request, response, _next) => {
  void _next;
  if (error instanceof multer.MulterError) {
    const tooLarge = error.code === "LIMIT_FILE_SIZE";
    response.status(tooLarge ? 413 : 400).json({
      error: tooLarge ? "File exceeds the 10 MB limit." : "Invalid file upload.",
    });
    return;
  }
  if (error instanceof UploadValidationError) {
    response.status(415).json({ error: error.message });
    return;
  }
  console.error(error);
  response.status(500).json({ error: "An unexpected server error occurred." });
};
app.use(errorHandler);

export { app };
