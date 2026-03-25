import { pgTable, text, integer, real, jsonb, timestamp, index } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const topicsTable = pgTable(
  "topics",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull().unique(),
    description: text("description"),
    paperCount: integer("paper_count").default(0),
    growthRate: real("growth_rate").default(0),
    keywords: jsonb("keywords").$type<string[]>().default([]),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    index("topics_name_idx").on(table.name),
    index("topics_paper_count_idx").on(table.paperCount),
  ]
);

export const insertTopicSchema = createInsertSchema(topicsTable).omit({ createdAt: true, updatedAt: true });
export const selectTopicSchema = createSelectSchema(topicsTable);
export type InsertTopic = z.infer<typeof insertTopicSchema>;
export type Topic = typeof topicsTable.$inferSelect;

// Junction table: paper <-> topic
export const paperTopicsTable = pgTable(
  "paper_topics",
  {
    paperId: text("paper_id").notNull(),
    topicId: text("topic_id").notNull(),
    score: real("score").default(1.0),
  },
  (table) => [
    index("paper_topics_paper_idx").on(table.paperId),
    index("paper_topics_topic_idx").on(table.topicId),
  ]
);

export const insertPaperTopicSchema = createInsertSchema(paperTopicsTable);
export type InsertPaperTopic = z.infer<typeof insertPaperTopicSchema>;
export type PaperTopic = typeof paperTopicsTable.$inferSelect;

// Clusters from K-Means / LDA analysis
export const clustersTable = pgTable(
  "clusters",
  {
    id: text("id").primaryKey(),
    collectionRunId: text("collection_run_id"),
    label: text("label").notNull(),
    keywords: jsonb("keywords").$type<string[]>().default([]),
    paperCount: integer("paper_count").default(0),
    growthRate: real("growth_rate").default(0),
    description: text("description"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("clusters_run_idx").on(table.collectionRunId),
  ]
);

export const insertClusterSchema = createInsertSchema(clustersTable).omit({ createdAt: true });
export type InsertCluster = z.infer<typeof insertClusterSchema>;
export type Cluster = typeof clustersTable.$inferSelect;

// Junction: paper <-> cluster
export const paperClustersTable = pgTable(
  "paper_clusters",
  {
    paperId: text("paper_id").notNull(),
    clusterId: text("cluster_id").notNull(),
    score: real("score").default(1.0),
  },
  (table) => [
    index("paper_clusters_paper_idx").on(table.paperId),
    index("paper_clusters_cluster_idx").on(table.clusterId),
  ]
);

export const insertPaperClusterSchema = createInsertSchema(paperClustersTable);
export type InsertPaperCluster = z.infer<typeof insertPaperClusterSchema>;
export type PaperCluster = typeof paperClustersTable.$inferSelect;
