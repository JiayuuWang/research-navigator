import { pgTable, text, integer, real, timestamp, index } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const keywordTrendsTable = pgTable(
  "keyword_trends",
  {
    id: text("id").primaryKey(),
    collectionRunId: text("collection_run_id").notNull(),
    keyword: text("keyword").notNull(),
    year: integer("year").notNull(),
    count: integer("count").default(0),
    tfidfScore: real("tfidf_score").default(0),
    growthRate: real("growth_rate").default(0),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("keyword_trends_run_idx").on(table.collectionRunId),
    index("keyword_trends_keyword_idx").on(table.keyword),
    index("keyword_trends_year_idx").on(table.year),
  ]
);

export const insertKeywordTrendSchema = createInsertSchema(keywordTrendsTable).omit({ createdAt: true });
export const selectKeywordTrendSchema = createSelectSchema(keywordTrendsTable);
export type InsertKeywordTrend = z.infer<typeof insertKeywordTrendSchema>;
export type KeywordTrend = typeof keywordTrendsTable.$inferSelect;
