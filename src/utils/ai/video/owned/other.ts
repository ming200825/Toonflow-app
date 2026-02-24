import "../type";
import axios from "axios";
import u from "@/utils";
import { pollTask } from "@/utils/ai/utils";

export default async (input: VideoConfig, config: AIConfig) => {
  if (!config.apiKey) throw new Error("缺少API Key");
  if (!config.baseURL) throw new Error("缺少baseURL");

  const baseURL = config.baseURL.replace(/\/+$/, "");
  const authorization = `Bearer ${config.apiKey}`;

  // 构建请求体 (new-api /v1/videos 格式)
  const requestBody: Record<string, any> = {
    model: config.model,
    prompt: input.prompt,
    duration: input.duration,
    // Gemini Veo 等模型通过 metadata 传递视频参数
    metadata: {
      durationSeconds: input.duration,
      aspectRatio: input.aspectRatio,
      personGeneration: "allow_all",
    },
  };

  // 如果有图片输入
  if (input.imageBase64 && input.imageBase64.length > 0) {
    requestBody.image = input.imageBase64[0];
  }

  // 提交任务 POST /v1/videos
  const { data } = await axios.post(`${baseURL}/videos`, requestBody, {
    headers: { "Content-Type": "application/json", Authorization: authorization },
  });

  if (data.status === "failed") {
    throw new Error(`任务提交失败: ${data.error?.message || "未知错误"}`);
  }

  const taskId = data.task_id || data.id;
  if (!taskId) throw new Error("未返回任务ID");

  // 轮询查询状态 GET /v1/videos/{task_id}
  await pollTask(async () => {
    const { data } = await axios.get(`${baseURL}/videos/${taskId}`, {
      headers: { Authorization: authorization },
    });

    if (data.status === "completed") {
      return { completed: true, url: "completed" };
    }
    if (data.status === "failed") {
      return { completed: false, error: `任务失败: ${data.error?.message || "未知错误"}` };
    }
    // pending / processing 继续轮询
    return { completed: false };
  });

  // 任务完成后，通过 /v1/videos/{task_id}/content 下载视频（需要带 Authorization）
  const response = await axios.get(`${baseURL}/videos/${taskId}/content`, {
    headers: { Authorization: authorization },
    responseType: "stream",
  });
  await u.oss.writeFile(input.savePath, response.data);

  // 返回 null，让 index.ts 跳过重复下载，直接返回 savePath
  return null;
};
