import { Router, type IRouter } from "express";
import {
  CreateAgentBody,
  CreateAgentResponse,
  GetAgentStatusResponse,
} from "@workspace/api-zod";
import { getApiKey } from "../services/settingsStore";
import { saveAgentId, getAgentId, hasAgent } from "../services/agentStore";
import { createSalesAgent } from "../services/elevenLabsService";

const router: IRouter = Router();

router.post("/agent/create", async (req, res): Promise<void> => {
  req.log.info("Agent creation requested");

  const apiKey = await getApiKey();
  if (!apiKey) {
    req.log.warn("Agent creation failed: API key not set");
    res.status(400).json({ error: "API key not configured. Please save your ElevenLabs API key first." });
    return;
  }

  req.log.info("Starting ElevenLabs agent creation");

  const input = CreateAgentBody.parse(req.body);
  const agentId = await createSalesAgent(
    apiKey,
    input.salesMode,
    input.serviceDescription,
  );

  await saveAgentId(agentId);

  req.log.info({ agentId }, "Agent created and saved");

  res.json(
    CreateAgentResponse.parse({
      success: true,
      agentId,
      message: `AI agent created successfully with ID: ${agentId}`,
    }),
  );
});

router.get("/agent/status", async (req, res): Promise<void> => {
  const agentExists = await hasAgent();
  const agentId = await getAgentId();

  req.log.info({ hasAgent: agentExists }, "Agent status requested");

  res.json(
    GetAgentStatusResponse.parse({
      hasAgent: agentExists,
      agentId: agentId ?? null,
    }),
  );
});

export default router;
