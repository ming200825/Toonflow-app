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
  }),
  async (req, res) => {
    const { id } = req.body;
    const userId = (req as any).user.id;
    await u.db("t_config").where("id", id).andWhere("userId", userId).delete();
    await u.db("t_aiModelMap").where("configId", id).update("configId",null);
    res.status(200).send(success("删除成功"));
  },
);
