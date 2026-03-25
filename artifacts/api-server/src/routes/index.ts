import { Router, type IRouter } from "express";
import healthRouter from "./health.js";
import papersRouter from "./papers/index.js";
import collectionRouter from "./collection/index.js";
import graphRouter from "./graph/index.js";
import trendsRouter from "./trends/index.js";
import gapsRouter from "./gaps/index.js";
import proposalsRouter from "./proposals/index.js";
import debatesRouter from "./debates/index.js";
import reportRouter from "./report/index.js";

const router: IRouter = Router();

router.use(healthRouter);
router.use("/papers", papersRouter);
router.use("/collection", collectionRouter);
router.use("/graph", graphRouter);
router.use("/trends", trendsRouter);
router.use("/gaps", gapsRouter);
router.use("/proposals", proposalsRouter);
router.use("/debates", debatesRouter);
router.use("/report", reportRouter);

export default router;
