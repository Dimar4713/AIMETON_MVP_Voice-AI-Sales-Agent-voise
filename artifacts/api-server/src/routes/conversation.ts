import { Router, type IRouter } from "express";
import { GetSignedUrlResponse } from "@workspace/api-zod";
import { getApiKey } from "../services/settingsStore";
import { getAgentId } from "../services/agentStore";
import { getSignedConversationUrl } from "../services/elevenLabsService";
import type { SalesMode } from "../services/productConfig";

const router: IRouter = Router();

router.get("/conversation/signed-url", async (req, res): Promise<void> => {
  req.log.info("Signed URL requested");

  const apiKey = await getApiKey();
  if (!apiKey) {
    req.log.warn("Signed URL request failed: API key not set");
    res.status(400).json({ error: "API key not configured" });
    return;
  }

  const salesMode = req.query.salesMode;
  if (
    salesMode !== "online_course" &&
    salesMode !== "fitness_membership" &&
    salesMode !== "crm_system"
  ) {
    res.status(400).json({
      error: "Select a sales direction with a configured AI agent first.",
    });
    return;
  }

  const agentId = await getAgentId(salesMode as SalesMode);
  if (!agentId) {
    req.log.warn("Signed URL request failed: agent not created");
    res.status(400).json({
      error: `AI agent for ${salesMode} not created yet. Please create it first.`,
    });
    return;
  }

  const signedUrl = await getSignedConversationUrl(apiKey, agentId);

  req.log.info("Signed URL returned to client");

  res.json(
    GetSignedUrlResponse.parse({
      signedUrl,
    }),
  );
});

export default router;
