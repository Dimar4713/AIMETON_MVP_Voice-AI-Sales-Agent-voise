import { logger } from "../lib/logger";
import { buildSystemPrompt, getProductConfig, type SalesMode } from "./productConfig";

const ELEVENLABS_BASE_URL = "https://api.elevenlabs.io/v1";

interface CreateAgentResponse {
  agent_id: string;
}

interface SignedUrlResponse {
  signed_url: string;
}

async function elevenLabsRequest<T>(
  method: string,
  path: string,
  apiKey: string,
  body?: unknown,
): Promise<T> {
  const url = `${ELEVENLABS_BASE_URL}${path}`;
  const headers: Record<string, string> = {
    "xi-api-key": apiKey,
    "Content-Type": "application/json",
  };

  const response = await fetch(url, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (!response.ok) {
    const errorText = await response.text();
    logger.error(
      { status: response.status, path },
      "ElevenLabs API request failed",
    );
    throw new Error(
      `ElevenLabs API error ${response.status}: ${errorText}`,
    );
  }

  return response.json() as Promise<T>;
}

export async function createSalesAgent(
  apiKey: string,
  salesMode: SalesMode = "crm_system",
  serviceDescription?: string,
): Promise<string> {
  logger.info("Creating ElevenLabs sales agent");

  const product = getProductConfig(salesMode);
  const systemPrompt = buildSystemPrompt(product, serviceDescription);

  const payload = {
    name: `AI Sales Agent — ${product.name}`,
    conversation_config: {
      agent: {
        prompt: {
          prompt: systemPrompt,
        },
        first_message: `Добрый день! Меня зовут Алекс, я AI-ассистент компании. Удобно ли вам сейчас поговорить пару минут? Я хотел бы узнать, ${salesMode === "online_course" ? "какие навыки вы хотите развить" : salesMode === "fitness_membership" ? "каких результатов в тренировках вы хотите достичь" : "как вы сейчас управляете своими клиентами и продажами"}.`,
        language: "ru",
      },
      tts: {
        model_id: "eleven_turbo_v2_5",
        voice_id: "pNInz6obpgDQGcFmaJgB", // Adam voice (professional male)
      },
    },
    platform_settings: {
      auth: {
        enable_auth: false,
      },
    },
  };

  const result = await elevenLabsRequest<CreateAgentResponse>(
    "POST",
    "/convai/agents/create",
    apiKey,
    payload,
  );

  logger.info({ agentId: result.agent_id }, "ElevenLabs agent created successfully");
  return result.agent_id;
}

export async function getSignedConversationUrl(
  apiKey: string,
  agentId: string,
): Promise<string> {
  logger.info({ agentId }, "Fetching signed conversation URL");

  const result = await elevenLabsRequest<SignedUrlResponse>(
    "GET",
    `/convai/conversation/get-signed-url?agent_id=${encodeURIComponent(agentId)}`,
    apiKey,
  );

  logger.info("Signed conversation URL obtained");
  return result.signed_url;
}
