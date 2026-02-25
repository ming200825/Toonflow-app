import express from "express";
import u from "@/utils";
import { z } from "zod";
import { success, error } from "@/lib/responseFormat";
import { validateFields } from "@/middleware/middleware";
import { hashPassword } from "@/utils/auth";
const router = express.Router();

// 管理员重置用户密码
export default router.post(
  "/",
  validateFields({
    userId: z.number(),
    newPassword: z.string().min(6).max(50),
  }),
  async (req, res) => {
    const isAdmin = (req as any).user.role === "admin";
    if (!isAdmin) return res.status(403).send(error("权限不足，仅管理员可执行此操作"));

    const { userId, newPassword } = req.body;

    const user = await u.db("t_user").where("id", userId).first();
    if (!user) return res.status(400).send(error("目标用户不存在"));

    const hashedPassword = await hashPassword(newPassword);
    await u.db("t_user").where("id", userId).update({ password: hashedPassword });

    return res.status(200).send(success(null, "密码重置成功"));
  },
);
