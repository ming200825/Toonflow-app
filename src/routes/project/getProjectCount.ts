import express from "express";
import u from "@/utils";
import { z } from "zod";
import { success, error } from "@/lib/responseFormat";
import { validateFields } from "@/middleware/middleware";
import { verifyProjectOwnership } from "@/utils/auth";
const router = express.Router();

// 获取项目统计
export default router.post(
  "/",
  validateFields({
    projectId: z.number(),
  }),
  async (req, res) => {
    const { projectId } = req.body;
    const userId = (req as any).user.id;

    // 验证项目归属
    const isOwner = await verifyProjectOwnership(projectId, userId);
    if (!isOwner) return res.status(403).send(error("无权操作此项目"));

    const scripts = await u.db("t_script").where("projectId", projectId).select("id");
    const scriptIds = scripts.map((item: any) => item.id);

    const roleCount: any = await u.db("t_assets").where("projectId", projectId).where("type", "角色").count("* as total").first();
    const scriptCount: any = await u.db("t_script").where("projectId", projectId).count("* as total").first();
    const videoCount: any = await u.db("t_video").whereIn("scriptId", scriptIds).count("* as total").first();
    const storyboardCount: any = await u.db("t_assets").whereIn("scriptId", scriptIds).where("type", "分镜").count("* as total").first();

    const data = {
      roleCount: roleCount?.total || 0,
      scriptCount: scriptCount?.total || 0,
      videoCount: videoCount?.total || 0,
      storyboardCount: storyboardCount?.total || 0,
    };

    res.status(200).send(success(data));
  }
);
