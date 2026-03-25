import { pgTable, text, integer, jsonb, timestamp, index } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const authorsTable = pgTable(
  "authors",
  {
    id: text("id").primaryKey(),
    semanticScholarId: text("semantic_scholar_id").unique(),
    openAlexId: text("open_alex_id").unique(),
    name: text("name").notNull(),
    affiliations: jsonb("affiliations").$type<string[]>().default([]),
    homepage: text("homepage"),
    citationCount: integer("citation_count").default(0),
    paperCount: integer("paper_count").default(0),
    hIndex: integer("h_index").default(0),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    index("authors_name_idx").on(table.name),
    index("authors_citation_count_idx").on(table.citationCount),
  ]
);

export const insertAuthorSchema = createInsertSchema(authorsTable).omit({ createdAt: true, updatedAt: true });
export const selectAuthorSchema = createSelectSchema(authorsTable);
export type InsertAuthor = z.infer<typeof insertAuthorSchema>;
export type Author = typeof authorsTable.$inferSelect;

// Junction table: paper <-> author
export const paperAuthorsTable = pgTable(
  "paper_authors",
  {
    paperId: text("paper_id").notNull(),
    authorId: text("author_id").notNull(),
    position: integer("position").default(0),
  },
  (table) => [
    index("paper_authors_paper_idx").on(table.paperId),
    index("paper_authors_author_idx").on(table.authorId),
  ]
);

export const insertPaperAuthorSchema = createInsertSchema(paperAuthorsTable);
export type InsertPaperAuthor = z.infer<typeof insertPaperAuthorSchema>;
export type PaperAuthor = typeof paperAuthorsTable.$inferSelect;
