import { Router, type IRouter } from "express";
import {
  CreateAgentBody,
  CreateAgentResponse,
  GetAgentStatusResponse,
  UpdateAgentConfigurationBody,
  UpdateAgentConfigurationResponse,
} from "@workspace/api-zod";
import { getApiKey } from "../services/settingsStore";
import { getAgents, getAgent, saveAgent } from "../services/agentStore";
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

  await saveAgent(input.salesMode, agentId, {
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
  const data = await getAgents();
  const agents = Object.values(data.agents);

  req.log.info({ agentCount: agents.length }, "Agent status requested");

  res.json(
    GetAgentStatusResponse.parse({
      hasAgent: agents.length > 0,
      agents,
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

  const input = UpdateAgentConfigurationBody.parse(req.body);
  const existingAgent = await getAgent(input.salesMode);
  if (!existingAgent) {
    res.status(400).json({
      error: `AI agent for ${input.salesMode} has not been created yet.`,
    });
    return;
  }

  await updateSalesAgent(
    apiKey,
    existingAgent.agentId,
    input.salesMode,
    input.serviceDescription,
  );
  await saveAgent(input.salesMode, existingAgent.agentId, {
    fileName: input.fileName,
    serviceDescription: input.serviceDescription ?? null,
  });

  const updatedAgent = await getAgent(input.salesMode);
  res.json(
    UpdateAgentConfigurationResponse.parse({
      hasAgent: true,
      agentId: updatedAgent?.agentId ?? null,
      salesMode: updatedAgent?.salesMode ?? null,
      fileName: updatedAgent?.fileName ?? null,
      serviceDescription: updatedAgent?.serviceDescription ?? null,
    }),
  );
});

export default router;
