import express from "express";
import u from "@/utils";
import { z } from "zod";
import { success, error } from "@/lib/responseFormat";
import { validateFields } from "@/middleware/middleware";
import { verifyProjectOwnership } from "@/utils/auth";
const router = express.Router();

// 获取资产分镜
export default router.post(
  "/",
  validateFields({
    projectId: z.number(),
  }),
  async (req, res) => {
    const { projectId } = req.body;
    const userId = (req as any).user.id;

    const isOwner = await verifyProjectOwnership(projectId, userId);
    if (!isOwner) return res.status(403).send(error("无权操作此项目"));

    const data = await u.db("t_script").where("projectId", projectId).select("name", "id").distinct("id", "name").orderBy("name", "asc");

    res.status(200).send(success(data));
  },
);
