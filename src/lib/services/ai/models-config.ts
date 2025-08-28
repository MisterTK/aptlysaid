import modelsConfig from "$lib/config/gemini-models.json"

export interface ModelInfo {
  name: string
  description: string
  maxTokens: number
  costPerMillion?: number
}

export interface ModelsConfig {
  defaultModel: string
  models: Record<string, ModelInfo>
}

const { defaultModel, models } = modelsConfig as ModelsConfig

export const DEFAULT_MODEL = defaultModel
export const VERTEX_AI_MODELS = models

export type VertexAIModel = keyof typeof models
