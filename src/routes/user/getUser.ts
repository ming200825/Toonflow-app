import express from "express";
import u from "@/utils";
import { success } from "@/lib/responseFormat";
const router = express.Router();

// 获取当前用户信息
export default router.get("/", async (req, res) => {
  const userId = (req as any).user.id;
  const data = await u.db("t_user").where("id", userId).select("id", "name", "role").first();

  res.status(200).send(success(data));
});
