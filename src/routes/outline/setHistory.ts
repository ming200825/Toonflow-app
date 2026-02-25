import express from "express";
import u from "@/utils";
import { z } from "zod";
import { error, success } from "@/lib/responseFormat";
import { validateFields } from "@/middleware/middleware";
import { verifyProjectOwnership } from "@/utils/auth";
const router = express.Router();

// 删除大纲
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

    const history = await u
      .db("t_chatHistory")
      .where({ projectId: Number(projectId), type: "outlineWebChat" })
      .first();
    if (!history) {
      await u.db("t_chatHistory").insert({
        projectId: Number(projectId),
        type: "outlineWebChat",
        data: data,
      });
    } else {
      await u
        .db("t_chatHistory")
        .where({ projectId: Number(projectId), type: "outlineWebChat" })
        .update({
          data: data,
        });
    }

    res.status(200).send(success("保存成功"));
  },
);
