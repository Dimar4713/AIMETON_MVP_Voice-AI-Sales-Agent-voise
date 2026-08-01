import { Router, type IRouter } from "express";
import { GetSignedUrlResponse } from "@workspace/api-zod";
import { getApiKey } from "../services/settingsStore";
import { getAgentId } from "../services/agentStore";
import { getSignedConversationUrl } from "../services/elevenLabsService";

const router: IRouter = Router();

router.get("/conversation/signed-url", async (req, res): Promise<void> => {
  req.log.info("Signed URL requested");

  const apiKey = await getApiKey();
  if (!apiKey) {
    req.log.warn("Signed URL request failed: API key not set");
    res.status(400).json({ error: "API key not configured" });
    return;
  }

  const agentId = await getAgentId();
  if (!agentId) {
    req.log.warn("Signed URL request failed: agent not created");
    res.status(400).json({ error: "AI agent not created yet. Please create an agent first." });
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
