import express from "express";
import u from "@/utils";
import { z } from "zod";
import { error, success } from "@/lib/responseFormat";
import { validateFields } from "@/middleware/middleware";
import { verifyProjectOwnership } from "@/utils/auth";
const router = express.Router();

// 新增大纲
export default router.post(
  "/",
  validateFields({
    projectId: z.number(),
    data: z.string(),
  }),
  async (req, res) => {
    const { projectId, data } = req.body;
    const userId = (req as any).user.id;

    const isOwner = await verifyProjectOwnership(projectId, userId);
    if (!isOwner) return res.status(403).send(error("无权操作此项目"));

    await u.db("t_outline").insert({
      data,
      projectId,
    });

    res.status(200).send(success({ message: "新增大纲成功" }));
  }
);
