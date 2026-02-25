import express from "express";
import u from "@/utils";
import { z } from "zod";
import { success, error } from "@/lib/responseFormat";
import { validateFields } from "@/middleware/middleware";
import { hashPassword, verifyPassword } from "@/utils/auth";
const router = express.Router();

// 用户修改自己的密码
export default router.post(
  "/",
  validateFields({
    oldPassword: z.string(),
    newPassword: z.string().min(6).max(50),
  }),
  async (req, res) => {
    const userId = (req as any).user.id;
    const { oldPassword, newPassword } = req.body;

    const user = await u.db("t_user").where("id", userId).first();
    if (!user) return res.status(400).send(error("用户不存在"));

    const passwordMatch = await verifyPassword(oldPassword, user.password as string);
    if (!passwordMatch) return res.status(400).send(error("旧密码错误"));

    const hashedPassword = await hashPassword(newPassword);
    await u.db("t_user").where("id", userId).update({ password: hashedPassword });

    return res.status(200).send(success(null, "密码修改成功"));
  },
);
