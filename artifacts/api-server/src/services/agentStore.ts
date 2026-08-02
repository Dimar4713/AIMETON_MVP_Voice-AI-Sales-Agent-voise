import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { logger } from "../lib/logger";
import type { SalesMode } from "./productConfig";

const DATA_DIR = path.resolve(process.cwd(), ".data");
const AGENT_FILE = path.join(DATA_DIR, "agent.json");

interface AgentData {
  agentId?: string;
  salesMode?: SalesMode;
  fileName?: string | null;
  serviceDescription?: string | null;
}

async function ensureDataDir(): Promise<void> {
  await mkdir(DATA_DIR, { recursive: true });
}

async function readAgentData(): Promise<AgentData> {
  try {
    const raw = await readFile(AGENT_FILE, "utf-8");
    return JSON.parse(raw) as AgentData;
  } catch {
    return {};
  }
}

async function writeAgentData(data: AgentData): Promise<void> {
  await ensureDataDir();
  await writeFile(AGENT_FILE, JSON.stringify(data, null, 2), "utf-8");
}

export async function saveAgentId(
  agentId: string,
  configuration?: Omit<AgentData, "agentId">,
): Promise<void> {
  await writeAgentData({ agentId, ...configuration });
  logger.info({ agentId }, "Agent ID saved to agent store");
}

export async function getAgentId(): Promise<string | null> {
  const data = await readAgentData();
  return data.agentId ?? null;
}

export async function hasAgent(): Promise<boolean> {
  const id = await getAgentId();
  return id !== null && id.length > 0;
}

export async function getAgentData(): Promise<AgentData> {
  return readAgentData();
}
