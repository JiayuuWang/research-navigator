import { pgTable, text, integer, real, timestamp, boolean, jsonb, index, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const papersTable = pgTable(
  "papers",
  {
    id: text("id").primaryKey(),
    semanticScholarId: text("semantic_scholar_id").unique(),
    openAlexId: text("open_alex_id").unique(),
    doi: text("doi"),
    title: text("title").notNull(),
    abstract: text("abstract"),
    year: integer("year"),
    publicationDate: timestamp("publication_date"),
    citationCount: integer("citation_count").default(0),
    referenceCount: integer("reference_count").default(0),
    influentialCitationCount: integer("influential_citation_count").default(0),
    venue: text("venue"),
    journal: text("journal"),
    fieldsOfStudy: jsonb("fields_of_study").$type<string[]>().default([]),
    keywords: jsonb("keywords").$type<string[]>().default([]),
    tldr: text("tldr"),
    url: text("url"),
    pdfUrl: text("pdf_url"),
    source: text("source").notNull(),
    collectionRunId: text("collection_run_id"),
    isIncremental: boolean("is_incremental").default(false),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    index("papers_year_idx").on(table.year),
    index("papers_citation_count_idx").on(table.citationCount),
    index("papers_source_idx").on(table.source),
    index("papers_collection_run_id_idx").on(table.collectionRunId),
  ]
);

export const insertPaperSchema = createInsertSchema(papersTable).omit({ createdAt: true, updatedAt: true });
export const selectPaperSchema = createSelectSchema(papersTable);
export type InsertPaper = z.infer<typeof insertPaperSchema>;
export type Paper = typeof papersTable.$inferSelect;
