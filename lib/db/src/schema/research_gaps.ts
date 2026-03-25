import { pgTable, text, real, jsonb, timestamp, index } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const researchGapsTable = pgTable(
  "research_gaps",
  {
    id: text("id").primaryKey(),
    collectionRunId: text("collection_run_id").notNull(),
    title: text("title").notNull(),
    description: text("description").notNull(),
    evidenceType: text("evidence_type").notNull(),
    supportingPaperIds: jsonb("supporting_paper_ids").$type<string[]>().default([]),
    noveltyScore: real("novelty_score").default(0),
    impactScore: real("impact_score").default(0),
    feasibilityScore: real("feasibility_score").default(0),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("research_gaps_run_idx").on(table.collectionRunId),
    index("research_gaps_novelty_idx").on(table.noveltyScore),
  ]
);

export const insertResearchGapSchema = createInsertSchema(researchGapsTable).omit({ createdAt: true });
export const selectResearchGapSchema = createSelectSchema(researchGapsTable);
export type InsertResearchGap = z.infer<typeof insertResearchGapSchema>;
export type ResearchGap = typeof researchGapsTable.$inferSelect;

export const researchProposalsTable = pgTable(
  "research_proposals",
  {
    id: text("id").primaryKey(),
    gapId: text("gap_id").notNull(),
    collectionRunId: text("collection_run_id").notNull(),
    title: text("title").notNull(),
    motivation: text("motivation").notNull(),
    researchQuestions: jsonb("research_questions").$type<string[]>().default([]),
    methodology: text("methodology").notNull(),
    expectedContributions: jsonb("expected_contributions").$type<string[]>().default([]),
    challenges: jsonb("challenges").$type<string[]>().default([]),
    noveltyScore: real("novelty_score").default(0),
    noveltyExplanation: text("novelty_explanation"),
    supportingPaperIds: jsonb("supporting_paper_ids").$type<string[]>().default([]),
    rawText: text("raw_text"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("research_proposals_gap_idx").on(table.gapId),
    index("research_proposals_run_idx").on(table.collectionRunId),
    index("research_proposals_novelty_idx").on(table.noveltyScore),
  ]
);

export const insertResearchProposalSchema = createInsertSchema(researchProposalsTable).omit({ createdAt: true });
export const selectResearchProposalSchema = createSelectSchema(researchProposalsTable);
export type InsertResearchProposal = z.infer<typeof insertResearchProposalSchema>;
export type ResearchProposal = typeof researchProposalsTable.$inferSelect;
