import express from "express";
import u from "@/utils";
import { success } from "@/lib/responseFormat";
import { validateFields } from "@/middleware/middleware";
import { z } from "zod";
const router = express.Router();

// 更新提示词
export default router.post(
  "/",
  validateFields({
    id: z.number(),
    customValue: z.string(),
    code: z.string(),
  }),
  async (req, res) => {
    const { id, customValue, code } = req.body;

    const userId = (req as any).user.id;

    await u
      .db("t_prompts")
      .update({
        customValue: customValue,
      })
      .where("id", id)
      .andWhere("userId", userId);

    res.status(200).send(success({ message: "更新提示词成功" }));
  },
);
