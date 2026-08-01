import { Router, type IRouter } from "express";
import {
  SaveApiKeyBody,
  SaveApiKeyResponse,
  GetSettingsStatusResponse,
} from "@workspace/api-zod";
import {
  saveApiKey,
  hasApiKey,
  getApiKey,
  maskApiKey,
} from "../services/settingsStore";

const router: IRouter = Router();

router.post("/settings/save-key", async (req, res): Promise<void> => {
  const parsed = SaveApiKeyBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "API key is required and must not be empty" });
    return;
  }

  const { apiKey } = parsed.data;

  if (!apiKey || apiKey.trim().length === 0) {
    res.status(400).json({ error: "API key must not be empty" });
    return;
  }

  await saveApiKey(apiKey.trim());

  req.log.info("API key saved via settings endpoint");

  res.json(
    SaveApiKeyResponse.parse({
      success: true,
      message: "API key saved successfully",
    }),
  );
});

router.get("/settings/status", async (req, res): Promise<void> => {
  const saved = await hasApiKey();
  let maskedKey: string | null = null;

  if (saved) {
    const key = await getApiKey();
    maskedKey = key ? maskApiKey(key) : null;
  }

  req.log.info({ keySaved: saved }, "Settings status requested");

  res.json(
    GetSettingsStatusResponse.parse({
      keySaved: saved,
      maskedKey,
    }),
  );
});

export default router;
