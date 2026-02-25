import express from "express";
import u from "@/utils";
import { z } from "zod";
import { success, error } from "@/lib/responseFormat";
import { validateFields } from "@/middleware/middleware";
const router = express.Router();

export default router.post(
  "/",
  validateFields({
    id: z.number(),
    configId: z.number(),
  }),
  async (req, res) => {
    const { id, configId } = req.body;
    const userId = (req as any).user.id;
    if (id) {
      await u.db("t_aiModelMap").where("id", id).andWhere("userId", userId).update({
        configId,
      });
    }
    res.status(200).send(success("配置成功"));
  },
);
