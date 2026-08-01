import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { logger } from "../lib/logger";

const DATA_DIR = path.resolve(process.cwd(), ".data");
const SETTINGS_FILE = path.join(DATA_DIR, "settings.json");

interface SettingsData {
  apiKey?: string;
}

async function ensureDataDir(): Promise<void> {
  await mkdir(DATA_DIR, { recursive: true });
}

async function readSettings(): Promise<SettingsData> {
  try {
    const raw = await readFile(SETTINGS_FILE, "utf-8");
    return JSON.parse(raw) as SettingsData;
  } catch {
    return {};
  }
}

async function writeSettings(data: SettingsData): Promise<void> {
  await ensureDataDir();
  await writeFile(SETTINGS_FILE, JSON.stringify(data, null, 2), "utf-8");
}

export async function saveApiKey(apiKey: string): Promise<void> {
  const existing = await readSettings();
  await writeSettings({ ...existing, apiKey });
  logger.info("API key saved to settings store");
}

export async function getApiKey(): Promise<string | null> {
  const data = await readSettings();
  return data.apiKey ?? null;
}

export async function hasApiKey(): Promise<boolean> {
  const key = await getApiKey();
  return key !== null && key.length > 0;
}

export function maskApiKey(key: string): string {
  if (key.length <= 8) return "***";
  return `${key.slice(0, 4)}...${key.slice(-4)}`;
}
