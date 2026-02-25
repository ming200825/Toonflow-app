import express from "express";
import u from "@/utils";
import axios from "axios";
import { z } from "zod";
import { success, error } from "@/lib/responseFormat";
import { verifyProjectOwnership } from "@/utils/auth";
import { validateFields } from "@/middleware/middleware";
const router = express.Router();

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

// 获取番茄小说章节目录
export default router.post(
  "/",
  validateFields({
    url: z.string(),
  }),
  async (req, res) => {
    const { url } = req.body;

    const match = url.match(/\/page\/(\d+)/);
    if (!match) return res.status(400).send(error("无效的番茄小说链接"));
    const bookId = match[1];

    try {
      const dirRes = await axios.get(
        `https://fanqienovel.com/api/reader/directory/detail?bookId=${bookId}`,
        { headers: { "User-Agent": UA } },
      );

      const dirData = dirRes.data?.data;
      if (!dirData) return res.status(400).send(error("获取章节目录失败"));

      const chapterIds: string[] = dirData.allItemIds || [];
      const chapters = chapterIds.map((id: string, index: number) => {
        const info = dirData.allItems?.find((item: any) => item.itemId === id);
        return {
          itemId: id,
          index: index + 1,
          title: info?.title || `第${index + 1}章`,
          volumeName: info?.volumeName || "正文卷",
        };
      });

      res.status(200).send(success({ bookId, chapters }));
    } catch {
      res.status(500).send(error("获取目录失败，请检查链接是否正确"));
    }
  },
);
