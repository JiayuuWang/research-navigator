import { pgTable, text, integer, jsonb, timestamp, index } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const debateSessionsTable = pgTable(
  "debate_sessions",
  {
    id: text("id").primaryKey(),
    collectionRunId: text("collection_run_id").notNull(),
    topic: text("topic").notNull(),
    controversialQuestion: text("controversial_question").notNull(),
    subTopics: jsonb("sub_topics").$type<string[]>().default([]),
    roles: jsonb("roles").$type<Array<{ name: string; description: string; perspective: string }>>().default([]),
    status: text("status").notNull().default("pending"),
    finalReport: text("final_report"),
    consensusPoints: jsonb("consensus_points").$type<string[]>().default([]),
    disagreementPoints: jsonb("disagreement_points").$type<string[]>().default([]),
    openQuestions: jsonb("open_questions").$type<string[]>().default([]),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    index("debate_sessions_run_idx").on(table.collectionRunId),
    index("debate_sessions_status_idx").on(table.status),
  ]
);

export const insertDebateSessionSchema = createInsertSchema(debateSessionsTable).omit({ createdAt: true, updatedAt: true });
export const selectDebateSessionSchema = createSelectSchema(debateSessionsTable);
export type InsertDebateSession = z.infer<typeof insertDebateSessionSchema>;
export type DebateSession = typeof debateSessionsTable.$inferSelect;

export const debateTurnsTable = pgTable(
  "debate_turns",
  {
    id: text("id").primaryKey(),
    sessionId: text("session_id").notNull(),
    round: integer("round").notNull(),
    role: text("role").notNull(),
    content: text("content").notNull(),
    claims: jsonb("claims").$type<Array<{ claim: string; evidenceStrength: string; sourceIds: string[] }>>().default([]),
    referencedTurnIds: jsonb("referenced_turn_ids").$type<string[]>().default([]),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("debate_turns_session_idx").on(table.sessionId),
    index("debate_turns_round_idx").on(table.round),
  ]
);

export const insertDebateTurnSchema = createInsertSchema(debateTurnsTable).omit({ createdAt: true });
export const selectDebateTurnSchema = createSelectSchema(debateTurnsTable);
export type InsertDebateTurn = z.infer<typeof insertDebateTurnSchema>;
export type DebateTurn = typeof debateTurnsTable.$inferSelect;
