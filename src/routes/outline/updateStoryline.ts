import express from "express";
import u from "@/utils";
import { z } from "zod";
import { error, success } from "@/lib/responseFormat";
import { validateFields } from "@/middleware/middleware";
import { verifyProjectOwnership } from "@/utils/auth";
const router = express.Router();

// 更新故事线
export default router.post(
  "/",
  validateFields({
    projectId: z.number(),
    content: z.string(),
  }),
  async (req, res) => {
    const { projectId, content } = req.body;
    const userId = (req as any).user.id;

    const isOwner = await verifyProjectOwnership(projectId, userId);
    if (!isOwner) return res.status(403).send(error("无权操作此项目"));

    const existing = await u.db("t_storyline").where({ projectId }).first();
    if (existing) {
      await u.db("t_storyline").where({ projectId }).update({ content });
    } else {
      await u.db("t_storyline").insert({ projectId: projectId, content: content });
    }

    res.status(200).send(success({ message: "更新故事线成功" }));
  }
);
