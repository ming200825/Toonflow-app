import express from "express";
import u from "@/utils";
import { z } from "zod";
import { success, error } from "@/lib/responseFormat";
import { verifyProjectOwnership } from "@/utils/auth";
import { validateFields } from "@/middleware/middleware";
const router = express.Router();

// 获取原文数据
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

    const data = await u
      .db("t_novel")
      .where("projectId", projectId)
      .select("id", "chapterIndex as index", "reel", "chapter", "chapterData")
      .orderBy("chapterIndex", "asc");

    res.status(200).send(success(data));
  }
);
