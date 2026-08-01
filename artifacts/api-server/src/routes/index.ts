import { Router, type IRouter } from "express";
import healthRouter from "./health";
import settingsRouter from "./settings";
import agentRouter from "./agent";
import conversationRouter from "./conversation";
import logsRouter from "./logs";

const router: IRouter = Router();

router.use(healthRouter);
router.use(settingsRouter);
router.use(agentRouter);
router.use(conversationRouter);
router.use(logsRouter);

export default router;
