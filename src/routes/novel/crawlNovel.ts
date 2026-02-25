import express from "express";
import u from "@/utils";
import axios from "axios";
import { z } from "zod";
import { error } from "@/lib/responseFormat";
import { verifyProjectOwnership } from "@/utils/auth";
import { validateFields } from "@/middleware/middleware";
const router = express.Router();

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function stripHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function sendLog(res: express.Response, msg: string) {
  res.write(`data: ${JSON.stringify({ type: "log", message: msg })}\n\n`);
}

function sendDone(res: express.Response, msg: string) {
  res.write(`data: ${JSON.stringify({ type: "done", message: msg })}\n\n`);
  res.end();
}

function sendError(res: express.Response, msg: string) {
  res.write(`data: ${JSON.stringify({ type: "error", message: msg })}\n\n`);
  res.end();
}

// 逐章采集内容（SSE 流式日志）
export default router.post(
  "/",
  validateFields({
    projectId: z.number(),
    chapters: z.array(
      z.object({
        itemId: z.string(),
        index: z.number(),
        title: z.string(),
        volumeName: z.string(),
      }),
    ),
  }),
  async (req, res) => {
    const { projectId, chapters } = req.body;
    const userId = (req as any).user.id;

    const isOwner = await verifyProjectOwnership(projectId, userId);
    if (!isOwner) return res.status(403).send(error("无权操作此项目"));

    // 切换为 SSE
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders();

    const total = chapters.length;
    sendLog(res, `共 ${total} 个章节，开始逐章采集...`);

    let successCount = 0;
    let failCount = 0;

    for (let i = 0; i < chapters.length; i++) {
      const ch = chapters[i];
      sendLog(res, `[${i + 1}/${total}] 采集: ${ch.title}`);

      try {
        const contentRes = await axios.get(
          `https://fanqienovel.com/api/reader/full?itemId=${ch.itemId}`,
          { headers: { "User-Agent": UA } },
        );

        const contentData = contentRes.data?.data?.content || "";
        const plainText = stripHtml(contentData);

        if (plainText) {
          await u.db("t_novel").insert({
            projectId,
            chapterIndex: ch.index,
            reel: ch.volumeName,
            chapter: ch.title,
            chapterData: plainText,
            createTime: Date.now(),
          });
          successCount++;
        } else {
          sendLog(res, `[${i + 1}/${total}] 跳过: ${ch.title}（内容为空）`);
          failCount++;
        }
      } catch {
        sendLog(res, `[${i + 1}/${total}] 失败: ${ch.title}（请求出错，已跳过）`);
        failCount++;
      }

      await sleep(300);
    }

    sendDone(res, `采集完成！成功 ${successCount} 章，失败 ${failCount} 章`);
  },
);
