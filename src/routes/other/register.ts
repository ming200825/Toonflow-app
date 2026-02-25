import express from "express";
import u from "@/utils";
import { z } from "zod";
import { success, error } from "@/lib/responseFormat";
import { validateFields } from "@/middleware/middleware";
import { hashPassword, initUserData } from "@/utils/auth";
const router = express.Router();

// 注册
export default router.post(
  "/",
  validateFields({
    username: z.string().min(2).max(20),
    password: z.string().min(6).max(50),
  }),
  async (req, res) => {
    const { username, password } = req.body;

    // 检查用户名唯一性
    const existing = await u.db("t_user").where("name", "=", username).first();
    if (existing) return res.status(400).send(error("用户名已存在"));

    // 加密密码
    const hashedPassword = await hashPassword(password);

    // 插入用户
    await u.db("t_user").insert({
      name: username,
      password: hashedPassword,
      role: "user",
    } as any);

    // 获取新用户的 id
    const newUser = await u.db("t_user").where("name", "=", username).first();
    if (!newUser || !newUser.id) return res.status(500).send(error("注册失败"));

    // 初始化用户数据（setting, aiModelMap, prompts）
    await initUserData(newUser.id);

    return res.status(200).send(success({ id: newUser.id, name: newUser.name }, "注册成功"));
  },
);
