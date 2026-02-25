import bcrypt from "bcryptjs";
import u from "@/utils";
import { v4 as uuid } from "uuid";

// 密码加密
export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}

// 密码验证
export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

// 验证项目归属当前用户
export async function verifyProjectOwnership(projectId: number, userId: number): Promise<boolean> {
  const project = await u.db("t_project").where("id", projectId).andWhere("userId", userId).first();
  return !!project;
}

// 默认 AI 模型映射数据
// configIndex 对应 defaultConfigs 数组的下标，用于插入后关联实际 configId
const defaultAiModelMap = [
  { configIndex: 5, name: "分镜Agent", key: "storyboardAgent" },
  { configIndex: 1, name: "分镜Agent图片生成", key: "storyboardImage" },
  { configIndex: 0, name: "大纲故事线Agent", key: "outlineScriptAgent" },
  { configIndex: 0, name: "资产提示词润色", key: "assetsPrompt" },
  { configIndex: 1, name: "资产图片生成", key: "assetsImage" },
  { configIndex: 0, name: "剧本生成", key: "generateScript" },
  { configIndex: 0, name: "视频提示词生成", key: "videoPrompt" },
  { configIndex: 1, name: "图片编辑", key: "editImage" },
];

// 默认模型配置（注册时自动添加）
const defaultConfigs = [
  { type: "text", model: "gemini-3-pro-preview", modelType: "", apiKey: "sk-xxx", baseUrl: "https://vip-ai.cn/v1", manufacturer: "other" },
  { type: "image", model: "gemini-3-pro-image-preview", modelType: "", apiKey: "sk-xxx", baseUrl: "https://vip-ai.cn/v1", manufacturer: "other" },
  { type: "text", model: "claude-sonnet-4-6", modelType: "", apiKey: "sk-xxx", baseUrl: "https://vip-ai.cn/v1", manufacturer: "other" },
  { type: "text", model: "claude-opus-4-6", modelType: "", apiKey: "sk-xxx", baseUrl: "https://vip-ai.cn/v1", manufacturer: "other" },
  { type: "video", model: "veo-3.1-generate-preview", modelType: "", apiKey: "sk-xxx", baseUrl: "https://vip-ai.cn/v1", manufacturer: "other" },
  { type: "text", model: "gemini-3.1-pro-preview", modelType: "", apiKey: "sk-xxx", baseUrl: "https://vip-ai.cn/v1", manufacturer: "other" },
  { type: "video", model: "doubao-seedance-1-5-pro-251215", modelType: "endFrameOptional", apiKey: "sk-xxx", baseUrl: "https://ark.cn-beijing.volces.com/api/v3/contents/generations/tasks", manufacturer: "volcengine" },
];

// 注册时初始化用户数据（setting + aiModelMap + prompts）
export async function initUserData(userId: number): Promise<void> {
  // 1. 创建 t_setting
  await u.db("t_setting").insert({
    userId,
    tokenKey: uuid().slice(0, 8),
    imageModel: "{}",
    languageModel: "{}",
    projectId: null,
  });

  // 2. 创建默认 t_config（模型配置）
  const now = Date.now();
  for (const item of defaultConfigs) {
    await u.db("t_config").insert({ ...item, userId, createTime: now });
  }

  // 查回该用户刚插入的 config，按 id 排序，保持与 defaultConfigs 下标一致
  const insertedConfigs = await u
    .db("t_config")
    .where("userId", userId)
    .orderBy("id", "asc")
    .select("id");

  // 3. 创建 t_aiModelMap（每个用户独立一套，configId 关联实际插入的 config）
  const aiModelMapData = defaultAiModelMap.map(({ configIndex, ...rest }) => ({
    ...rest,
    configId: insertedConfigs[configIndex]?.id ?? null,
    userId,
  }));
  await u.db("t_aiModelMap").insert(aiModelMapData);

  // 4. 复制默认 t_prompts（从 userId=1 的管理员数据复制，或从无 userId 的数据复制）
  const defaultPrompts = await u.db("t_prompts").where("userId", 1).select("*");
  if (defaultPrompts.length > 0) {
    const newPrompts = defaultPrompts.map(({ id, ...rest }: any) => ({
      ...rest,
      userId,
    }));
    await u.db("t_prompts").insert(newPrompts);
  }
}
