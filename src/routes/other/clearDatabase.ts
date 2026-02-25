import initDB from "@/lib/initDB";

import { db } from "@/utils/db";
import express from "express";
import { success } from "@/lib/responseFormat";
const router = express.Router();

// 清空所有表 (sqlite)
export default router.post("/", async (req, res) => {
  const isAdmin = (req as any).user.role === "admin";
  if (!isAdmin) return res.status(403).send({ message: "权限不足，仅管理员可执行此操作" });

  await initDB(db, true);
  res.status(200).send(success("清空数据库成功"));
});
