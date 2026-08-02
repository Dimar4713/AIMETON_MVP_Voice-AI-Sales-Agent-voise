import { Router, type IRouter } from "express";
import {
  CreateAgentBody,
  CreateAgentResponse,
  GetAgentStatusResponse,
  UpdateAgentConfigurationBody,
  UpdateAgentConfigurationResponse,
} from "@workspace/api-zod";
import { getApiKey } from "../services/settingsStore";
import { getAgentData, saveAgentId, getAgentId } from "../services/agentStore";
import { createSalesAgent, updateSalesAgent } from "../services/elevenLabsService";

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

  await saveAgentId(agentId, {
    salesMode: input.salesMode,
    fileName: input.fileName,
    serviceDescription: input.serviceDescription ?? null,
  });

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
  const data = await getAgentData();
  const agentExists = Boolean(data.agentId);
  const agentId = data.agentId ?? null;

  req.log.info({ hasAgent: agentExists }, "Agent status requested");

  res.json(
    GetAgentStatusResponse.parse({
      hasAgent: agentExists,
      agentId: agentId ?? null,
      salesMode: data.salesMode ?? null,
      fileName: data.fileName ?? null,
      serviceDescription: data.serviceDescription ?? null,
    }),
  );
});

router.patch("/agent/configuration", async (req, res): Promise<void> => {
  req.log.info("Agent configuration update requested");

  const apiKey = await getApiKey();
  if (!apiKey) {
    res.status(400).json({ error: "API key not configured." });
    return;
  }

  const agentId = await getAgentId();
  if (!agentId) {
    res.status(400).json({ error: "AI agent not created yet." });
    return;
  }

  const input = UpdateAgentConfigurationBody.parse(req.body);
  await updateSalesAgent(
    apiKey,
    agentId,
    input.salesMode,
    input.serviceDescription,
  );
  await saveAgentId(agentId, {
    salesMode: input.salesMode,
    fileName: input.fileName,
    serviceDescription: input.serviceDescription,
  });

  const data = await getAgentData();
  res.json(
    UpdateAgentConfigurationResponse.parse({
      hasAgent: true,
      agentId,
      salesMode: data.salesMode ?? null,
      fileName: data.fileName ?? null,
      serviceDescription: data.serviceDescription ?? null,
    }),
  );
});

export default router;
