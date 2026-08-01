import { Router, type IRouter } from "express";
import { LogClientEventBody, LogClientEventResponse } from "@workspace/api-zod";

const router: IRouter = Router();

router.post("/logs/client-event", async (req, res): Promise<void> => {
  const parsed = LogClientEventBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid log event payload" });
    return;
  }

  const { level, message, data } = parsed.data;

  if (level === "error") {
    req.log.error({ clientData: data }, `[CLIENT] ${message}`);
  } else if (level === "warn") {
    req.log.warn({ clientData: data }, `[CLIENT] ${message}`);
  } else {
    req.log.info({ clientData: data }, `[CLIENT] ${message}`);
  }

  res.json(LogClientEventResponse.parse({ ok: true }));
});

export default router;
