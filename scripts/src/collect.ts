#!/usr/bin/env tsx
/**
 * Research Navigator - Data Collection CLI
 * Usage: pnpm --filter @workspace/scripts run collect -- --topic "large language models" --limit 200
 */

import { parseArgs } from "util";
import { db } from "@workspace/db";
import { collectionRunsTable, papersTable } from "@workspace/db";
import { eq, desc, sql } from "drizzle-orm";

// ANSI color codes
const RESET = "\x1b[0m";
const BOLD = "\x1b[1m";
const DIM = "\x1b[2m";
const GREEN = "\x1b[32m";
const CYAN = "\x1b[36m";
const YELLOW = "\x1b[33m";
const RED = "\x1b[31m";
const BLUE = "\x1b[34m";
const MAGENTA = "\x1b[35m";
const GRAY = "\x1b[90m";

function box(text: string, color = CYAN): string {
  const lines = text.split("\n");
  const maxLen = Math.max(...lines.map((l) => l.replace(/\x1b\[[0-9;]*m/g, "").length));
  const border = "─".repeat(maxLen + 4);
  const top = `${color}╭${border}╮${RESET}`;
  const bottom = `${color}╰${border}╯${RESET}`;
  const middle = lines.map((l) => {
    const cleanLen = l.replace(/\x1b\[[0-9;]*m/g, "").length;
    const padding = " ".repeat(maxLen - cleanLen);
    return `${color}│${RESET}  ${l}${padding}  ${color}│${RESET}`;
  });
  return [top, ...middle, bottom].join("\n");
}

function divider(label?: string): string {
  const width = 60;
  if (!label) return `${GRAY}${"─".repeat(width)}${RESET}`;
  const sideLen = Math.floor((width - label.length - 2) / 2);
  return `${GRAY}${"─".repeat(sideLen)} ${CYAN}${BOLD}${label}${RESET}${GRAY} ${"─".repeat(width - sideLen - label.length - 2)}${RESET}`;
}

function progressBar(current: number, total: number, width = 40): string {
  const pct = total > 0 ? Math.min(current / total, 1) : 0;
  const filled = Math.round(pct * width);
  const bar = "█".repeat(filled) + "░".repeat(width - filled);
  const pctStr = (pct * 100).toFixed(1).padStart(5);
  return `${GREEN}${bar}${RESET} ${BOLD}${pctStr}%${RESET}`;
}

function formatNum(n: number): string {
  return n.toLocaleString();
}

async function printStats(): Promise<void> {
  const [{ totalPapers }] = await db.select({ totalPapers: sql<number>`count(*)` }).from(papersTable);
  const recentRuns = await db.select().from(collectionRunsTable).orderBy(desc(collectionRunsTable.startedAt)).limit(5);

  console.log("\n" + box(
    `${BOLD}${CYAN}Research Navigator${RESET}  ${DIM}Database Summary${RESET}`,
    CYAN
  ));
  console.log();
  console.log(`  ${BOLD}Total Papers:${RESET}  ${GREEN}${formatNum(Number(totalPapers))}${RESET}`);
  console.log(`  ${BOLD}Collections:${RESET}   ${CYAN}${recentRuns.length}${RESET} recent runs`);
  console.log();

  if (recentRuns.length > 0) {
    console.log(divider("RECENT RUNS"));
    for (const run of recentRuns) {
      const statusColor = run.status === "completed" ? GREEN : run.status === "failed" ? RED : YELLOW;
      const duration = run.completedAt
        ? `${Math.round((run.completedAt.getTime() - run.startedAt.getTime()) / 1000)}s`
        : "running...";
      console.log(
        `  ${statusColor}●${RESET} ${BOLD}${run.topic}${RESET} ${GRAY}(${run.id.substring(0, 8)})${RESET}`
      );
      console.log(
        `    ${GRAY}Status:${RESET} ${statusColor}${run.status}${RESET} · ` +
        `${GREEN}${formatNum(run.papersCollected ?? 0)}${RESET} collected · ` +
        `${YELLOW}${formatNum(run.papersDeduplicated ?? 0)}${RESET} deduped · ` +
        `${GRAY}${duration}${RESET}`
      );
    }
  }
  console.log();
}

async function runCollection(topic: string, limit: number, sources: string[]): Promise<void> {
  console.log("\n" + box(
    `${BOLD}${GREEN}Starting Collection${RESET}\n` +
    `  ${GRAY}Topic:${RESET}   ${CYAN}${topic}${RESET}\n` +
    `  ${GRAY}Limit:${RESET}   ${YELLOW}${formatNum(limit)} papers${RESET}\n` +
    `  ${GRAY}Sources:${RESET} ${MAGENTA}${sources.join(", ")}${RESET}`,
    GREEN
  ));
  console.log();

  const serverUrl = `http://localhost:${process.env["PORT"] ?? "3001"}`;

  try {
    console.log(`  ${CYAN}Sending collection request...${RESET}`);

    const startRes = await fetch(`${serverUrl}/api/collection/runs`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ topic, limit, sources }),
    });

    if (!startRes.ok) {
      const err = await startRes.text();
      console.error(`\n  ${RED}Error: ${err}${RESET}`);
      process.exit(1);
    }

    const run = await startRes.json() as { id: string; status: string };
    console.log(`  ${GREEN}✓${RESET} Collection run started: ${BOLD}${run.id.substring(0, 8)}...${RESET}`);
    console.log();
    console.log(divider("PROGRESS"));
    console.log();

    // Poll for progress
    let lastPapers = 0;
    let attempts = 0;
    const maxAttempts = 120; // 10 minutes

    while (attempts < maxAttempts) {
      await new Promise((r) => setTimeout(r, 5000));
      attempts++;

      try {
        const statusRes = await fetch(`${serverUrl}/api/collection/runs/${run.id}`);
        if (!statusRes.ok) continue;
        const status = await statusRes.json() as {
          status: string;
          papersCollected: number;
          papersSkipped: number;
          papersDeduplicated: number;
          errorMessage?: string;
        };

        const collected = status.papersCollected ?? 0;
        if (collected !== lastPapers) {
          lastPapers = collected;
          const bar = progressBar(collected, limit);
          process.stdout.write(
            `\r  ${bar} ${BOLD}${formatNum(collected)}${RESET}/${formatNum(limit)} ` +
            `${GRAY}deduped: ${status.papersDeduplicated ?? 0}${RESET}   `
          );
        }

        if (status.status === "completed") {
          console.log("\n");
          console.log(divider("COMPLETE"));
          console.log();
          console.log(box(
            `${BOLD}${GREEN}Collection Complete!${RESET}\n` +
            `  ${GRAY}Papers Collected:${RESET}      ${GREEN}${formatNum(collected)}${RESET}\n` +
            `  ${GRAY}Papers Skipped:${RESET}        ${YELLOW}${formatNum(status.papersSkipped ?? 0)}${RESET}\n` +
            `  ${GRAY}Duplicates Removed:${RESET}    ${CYAN}${formatNum(status.papersDeduplicated ?? 0)}${RESET}\n` +
            `  ${GRAY}Run ID:${RESET}                ${BOLD}${run.id}${RESET}`,
            GREEN
          ));
          console.log();
          console.log(`  ${DIM}Next steps:${RESET}`);
          console.log(`  ${GRAY}→${RESET} Compute trends:   ${CYAN}POST /api/trends/${run.id}/compute${RESET}`);
          console.log(`  ${GRAY}→${RESET} Analyze gaps:     ${CYAN}POST /api/gaps/${run.id}/analyze${RESET}`);
          console.log(`  ${GRAY}→${RESET} Generate debate:  ${CYAN}POST /api/debates/${run.id}/start${RESET}`);
          console.log();
          break;
        } else if (status.status === "failed") {
          console.log("\n");
          console.error(box(
            `${RED}${BOLD}Collection Failed${RESET}\n` +
            `  ${GRAY}Error:${RESET} ${RED}${status.errorMessage ?? "Unknown error"}${RESET}`,
            RED
          ));
          process.exit(1);
        }
      } catch {
        // Server might not be ready yet
      }
    }

    if (attempts >= maxAttempts) {
      console.log("\n  " + YELLOW + "Timed out waiting for collection to complete." + RESET);
    }
  } catch (err) {
    console.error(`\n  ${RED}Failed to connect to server: ${err}${RESET}`);
    console.error(`  ${DIM}Make sure the API server is running (pnpm --filter @workspace/api-server run dev)${RESET}`);
    process.exit(1);
  }
}

async function main(): Promise<void> {
  console.clear();
  console.log(`\n${BOLD}${CYAN}╔══════════════════════════════════════════════╗${RESET}`);
  console.log(`${BOLD}${CYAN}║      RESEARCH NAVIGATOR — INTELLIGENCE CLI   ║${RESET}`);
  console.log(`${BOLD}${CYAN}╚══════════════════════════════════════════════╝${RESET}\n`);

  const { values } = parseArgs({
    args: process.argv.slice(2),
    options: {
      topic: { type: "string", short: "t" },
      limit: { type: "string", short: "l", default: "200" },
      sources: { type: "string", short: "s", default: "semantic_scholar,open_alex" },
      stats: { type: "boolean", default: false },
      help: { type: "boolean", short: "h", default: false },
    },
    allowPositionals: true,
  });

  if (values.help) {
    console.log(box(
      `${BOLD}Usage${RESET}\n\n` +
      `  ${CYAN}pnpm collect${RESET} ${YELLOW}--topic "large language models"${RESET}\n\n` +
      `  ${BOLD}Options:${RESET}\n` +
      `  ${YELLOW}--topic, -t${RESET}    Research topic to collect papers for\n` +
      `  ${YELLOW}--limit, -l${RESET}    Max papers to collect (default: 200)\n` +
      `  ${YELLOW}--sources, -s${RESET}  Data sources: semantic_scholar,open_alex\n` +
      `  ${YELLOW}--stats${RESET}        Show database statistics\n` +
      `  ${YELLOW}--help, -h${RESET}     Show this help`,
      BLUE
    ));
    console.log();
    process.exit(0);
  }

  if (values.stats) {
    await printStats();
    process.exit(0);
  }

  if (!values.topic) {
    console.error(box(
      `${RED}${BOLD}Error: --topic is required${RESET}\n\n` +
      `  ${DIM}Example:${RESET}\n` +
      `  ${CYAN}pnpm collect --topic "transformer attention mechanisms"${RESET}`,
      RED
    ));
    process.exit(1);
  }

  const limit = parseInt(values.limit ?? "200", 10);
  const sources = (values.sources ?? "semantic_scholar,open_alex").split(",").map((s) => s.trim());

  await runCollection(values.topic, limit, sources);
}

main().catch((err) => {
  console.error(`\n  ${RED}Fatal error: ${err}${RESET}`);
  process.exit(1);
});
