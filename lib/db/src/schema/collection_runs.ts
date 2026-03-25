import { pgTable, text, integer, timestamp, jsonb, index } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const collectionRunsTable = pgTable(
  "collection_runs",
  {
    id: text("id").primaryKey(),
    topic: text("topic").notNull(),
    status: text("status").notNull().default("pending"),
    sourcesUsed: jsonb("sources_used").$type<string[]>().default([]),
    papersCollected: integer("papers_collected").default(0),
    papersSkipped: integer("papers_skipped").default(0),
    papersDeduplicated: integer("papers_deduplicated").default(0),
    errorMessage: text("error_message"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}),
    startedAt: timestamp("started_at").defaultNow().notNull(),
    completedAt: timestamp("completed_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("collection_runs_topic_idx").on(table.topic),
    index("collection_runs_status_idx").on(table.status),
    index("collection_runs_started_at_idx").on(table.startedAt),
  ]
);

export const insertCollectionRunSchema = createInsertSchema(collectionRunsTable).omit({ createdAt: true });
export const selectCollectionRunSchema = createSelectSchema(collectionRunsTable);
export type InsertCollectionRun = z.infer<typeof insertCollectionRunSchema>;
export type CollectionRun = typeof collectionRunsTable.$inferSelect;
