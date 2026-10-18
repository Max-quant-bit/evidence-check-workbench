import {
  integer,
  sqliteTable,
  text,
} from "drizzle-orm/sqlite-core";

export const projects = sqliteTable("projects", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  createdAt: text("created_at").notNull(),
});

export const documents = sqliteTable("documents", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  projectId: integer("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  filename: text("filename").notNull(),
  mimeType: text("mime_type").notNull(),
  sizeBytes: integer("size_bytes").notNull(),
  storageKey: text("storage_key").notNull().unique(),
  createdAt: text("created_at").notNull(),
});

export const documentChunks = sqliteTable("document_chunks", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  documentId: integer("document_id")
    .notNull()
    .references(() => documents.id, { onDelete: "cascade" }),
  content: text("content").notNull(),
  page: integer("page"),
  paragraph: integer("paragraph").notNull(),
});

export const evidenceClaims = sqliteTable("evidence_claims", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  projectId: integer("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  documentId: integer("document_id")
    .notNull()
    .references(() => documents.id, { onDelete: "cascade" }),
  chunkId: integer("chunk_id")
    .notNull()
    .references(() => documentChunks.id, { onDelete: "cascade" }),
  side: text("side").notNull(),
  originalText: text("original_text").notNull(),
  claim: text("claim").notNull(),
  entities: text("entities").notNull(),
  numbers: text("numbers").notNull(),
  dates: text("dates").notNull(),
  allegedSource: text("alleged_source"),
  documentName: text("document_name").notNull(),
  page: integer("page"),
  paragraph: integer("paragraph").notNull(),
  status: text("status", { enum: ["unverified", "human_verified"] })
    .notNull()
    .default("unverified"),
  createdAt: text("created_at").notNull(),
});

export const sourceCandidates = sqliteTable("source_candidates", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  claimId: integer("claim_id")
    .notNull()
    .references(() => evidenceClaims.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  url: text("url").notNull(),
  snippet: text("snippet"),
  createdAt: text("created_at").notNull(),
});

export const users = sqliteTable("users", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  email: text("email").notNull().unique(),
  displayName: text("display_name").notNull(),
  createdAt: text("created_at").notNull(),
});
