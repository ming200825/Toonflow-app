import express from "express";
import u from "@/utils";
import { z } from "zod";
import { success, error } from "@/lib/responseFormat";
import { verifyProjectOwnership } from "@/utils/auth";
import { validateFields } from "@/middleware/middleware";
const router = express.Router();

// 新增原文数据
export default router.post(
  "/",
  validateFields({
    projectId: z.number(),
    data: z.array(
      z.object({
        index: z.number(),
        reel: z.string(),
        chapter: z.string(),
        chapterData: z.string(),
      })
    ),
  }),
  async (req, res) => {
    const { projectId, data } = req.body;
    const userId = (req as any).user.id;

    const isOwner = await verifyProjectOwnership(projectId, userId);
    if (!isOwner) return res.status(403).send(error("无权操作此项目"));

    for (const item of data) {
      await u.db("t_novel").insert({
        projectId,
        chapterIndex: item.index,
        reel: item.reel,
        chapter: item.chapter,
        chapterData: item.chapterData,
        createTime: Date.now(),
      });
    }

    res.status(200).send(success({ message: "新增原文成功" }));
  }
);
