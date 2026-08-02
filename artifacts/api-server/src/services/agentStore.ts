import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { logger } from "../lib/logger";
import type { SalesMode } from "./productConfig";

const DATA_DIR = path.resolve(process.cwd(), ".data");
const AGENT_FILE = path.join(DATA_DIR, "agent.json");

export interface AgentConfiguration {
  agentId: string;
  salesMode: SalesMode;
  fileName: string | null;
  serviceDescription: string | null;
}

export interface AgentStoreData {
  agents: Partial<Record<SalesMode, AgentConfiguration>>;
}

interface LegacyAgentData {
  agentId?: string;
  salesMode?: SalesMode;
  fileName?: string | null;
  serviceDescription?: string | null;
}

const salesModes: SalesMode[] = [
  "online_course",
  "fitness_membership",
  "crm_system",
];

function isSalesMode(value: unknown): value is SalesMode {
  return typeof value === "string" && salesModes.includes(value as SalesMode);
}

async function ensureDataDir(): Promise<void> {
  await mkdir(DATA_DIR, { recursive: true });
}

async function readAgentData(): Promise<AgentStoreData> {
  try {
    const raw = JSON.parse(await readFile(AGENT_FILE, "utf-8")) as Record<
      string,
      unknown
    >;

    if ("agents" in raw && raw.agents && typeof raw.agents === "object") {
      return {
        agents: raw.agents as Partial<
          Record<SalesMode, AgentConfiguration>
        >,
      };
    }

    // Migrate the previous single-agent format to the CRM direction.
    if (typeof raw.agentId === "string" && raw.agentId.length > 0) {
      const mode = isSalesMode(raw.salesMode) ? raw.salesMode : "crm_system";
      return {
        agents: {
          [mode]: {
            agentId: raw.agentId,
            salesMode: mode,
            fileName: typeof raw.fileName === "string" ? raw.fileName : null,
            serviceDescription:
              typeof raw.serviceDescription === "string"
                ? raw.serviceDescription
                : null,
          },
        },
      };
    }
  } catch {
    // A missing or invalid local store means no agents have been configured.
  }

  return { agents: {} };
}

async function writeAgentData(data: AgentStoreData): Promise<void> {
  await ensureDataDir();
  await writeFile(AGENT_FILE, JSON.stringify(data, null, 2), "utf-8");
}

export async function saveAgent(
  salesMode: SalesMode,
  agentId: string,
  configuration?: Partial<Pick<AgentConfiguration, "fileName" | "serviceDescription">>,
): Promise<void> {
  const data = await readAgentData();
  data.agents[salesMode] = {
    agentId,
    salesMode,
    fileName: configuration?.fileName ?? null,
    serviceDescription: configuration?.serviceDescription ?? null,
  };
  await writeAgentData(data);
  logger.info({ agentId, salesMode }, "Agent saved to agent store");
}

export async function getAgent(
  salesMode: SalesMode,
): Promise<AgentConfiguration | null> {
  const data = await readAgentData();
  return data.agents[salesMode] ?? null;
}

export async function getAgents(): Promise<AgentStoreData> {
  return readAgentData();
}

export async function getAgentId(
  salesMode: SalesMode,
): Promise<string | null> {
  return (await getAgent(salesMode))?.agentId ?? null;
}

export async function hasAgent(salesMode: SalesMode): Promise<boolean> {
  return Boolean(await getAgentId(salesMode));
}