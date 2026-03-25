import { pgTable, text, boolean, timestamp, index, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const citationsTable = pgTable(
  "citations",
  {
    id: text("id").primaryKey(),
    citingPaperId: text("citing_paper_id").notNull(),
    citedPaperId: text("cited_paper_id").notNull(),
    isInfluential: boolean("is_influential").default(false),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("citations_unique_idx").on(table.citingPaperId, table.citedPaperId),
    index("citations_citing_idx").on(table.citingPaperId),
    index("citations_cited_idx").on(table.citedPaperId),
  ]
);

export const insertCitationSchema = createInsertSchema(citationsTable).omit({ createdAt: true });
export const selectCitationSchema = createSelectSchema(citationsTable);
export type InsertCitation = z.infer<typeof insertCitationSchema>;
export type Citation = typeof citationsTable.$inferSelect;
