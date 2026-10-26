import { ref } from 'vue';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';

// ─── Shared reactive state ───────────────────────────────────────

export const aiState = {
  selectedProvider: ref('mistral'),
  isGenerating: ref(false),
  streamedOutput: ref(''),
  error: ref(null),
  conversationHistory: ref([]),
  temperature: ref(0.7),
  maxTokens: ref(2048),
  lastPrompt: ref(''),
  lastContext: ref(null),
  generationStartTime: ref(null),
  generationDuration: ref(null),
};

// ─── Settings state (persisted via tauri-plugin-store) ───────────

export const aiSettings = {
  mistralApiKey: ref(''),
  openrouterApiKey: ref(''),
  cloudflareWorkerUrl: ref(''),
  cloudflareWorkerKey: ref(''),
  glmModel: ref('glm-4'),
  // OpenAI Compatible provider settings
  openaiBaseUrl: ref(''),
  openaiApiKey: ref(''),
  openaiModel: ref(''),
  openaiCustomModels: ref([]), // array of {name, model} objects
  defaultProvider: ref('mistral'),
  defaultTemperature: ref(0.7),
  defaultMaxTokens: ref(2048),
};

let _streamUnlisten = null;
let _cancelToken = null;

// ─── Settings: Load / Save ───────────────────────────────────────

export async function loadAISettings() {
  try {
    const { Store } = await import('@tauri-apps/plugin-store');
    const store = await Store.load('ai-settings.json');

    const get = async (key, fallback) => {
      try { return (await store.get(key)) ?? fallback; }
      catch { return fallback; }
    };

    aiSettings.mistralApiKey.value = await get('mistralApiKey', '');
    aiSettings.openrouterApiKey.value = await get('openrouterApiKey', '');
    aiSettings.cloudflareWorkerUrl.value = await get('cloudflareWorkerUrl', '');
    aiSettings.cloudflareWorkerKey.value = await get('cloudflareWorkerKey', '');
    aiSettings.glmModel.value = await get('glmModel', 'glm-4');
    // OpenAI Compatible
    aiSettings.openaiBaseUrl.value = await get('openaiBaseUrl', '');
    aiSettings.openaiApiKey.value = await get('openaiApiKey', '');
    aiSettings.openaiModel.value = await get('openaiModel', '');
    aiSettings.openaiCustomModels.value = await get('openaiCustomModels', []);

    aiSettings.defaultProvider.value = await get('defaultProvider', 'mistral');
    aiSettings.defaultTemperature.value = await get('defaultTemperature', 0.7);
    aiSettings.defaultMaxTokens.value = await get('defaultMaxTokens', 2048);

    aiState.selectedProvider.value = aiSettings.defaultProvider.value;
    aiState.temperature.value = aiSettings.defaultTemperature.value;
    aiState.maxTokens.value = aiSettings.defaultMaxTokens.value;
  } catch (err) {
    console.warn('[Texodus AI] Failed to load settings:', err);
  }
}

export async function saveAISettings() {
  const { Store } = await import('@tauri-apps/plugin-store');
  const store = await Store.load('ai-settings.json');

  await store.set('mistralApiKey', aiSettings.mistralApiKey.value);
  await store.set('openrouterApiKey', aiSettings.openrouterApiKey.value);
  await store.set('cloudflareWorkerUrl', aiSettings.cloudflareWorkerUrl.value);
  await store.set('cloudflareWorkerKey', aiSettings.cloudflareWorkerKey.value);
  await store.set('glmModel', aiSettings.glmModel.value);
  // OpenAI Compatible
  await store.set('openaiBaseUrl', aiSettings.openaiBaseUrl.value);
  await store.set('openaiApiKey', aiSettings.openaiApiKey.value);
  await store.set('openaiModel', aiSettings.openaiModel.value);
  await store.set('openaiCustomModels', aiSettings.openaiCustomModels.value);

  await store.set('defaultProvider', aiSettings.defaultProvider.value);
  await store.set('defaultTemperature', aiSettings.defaultTemperature.value);
  await store.set('defaultMaxTokens', aiSettings.defaultMaxTokens.value);
  await store.save();
}

// ─── Model management for OpenAI Compatible ──────────────────────

export function addCustomModel(name: string, modelId: string) {
  if (!name.trim() || !modelId.trim()) return;
  const models = [...aiSettings.openaiCustomModels.value];
  const existing = models.findIndex(m => m.name === name.trim());
  if (existing >= 0) {
    models[existing] = { name: name.trim(), model: modelId.trim() };
  } else {
    models.push({ name: name.trim(), model: modelId.trim() });
  }
  aiSettings.openaiCustomModels.value = models;
}

export function removeCustomModel(name: string) {
  aiSettings.openaiCustomModels.value = aiSettings.openaiCustomModels.value.filter(m => m.name !== name);
}

export function getModelsForProvider(provider: string) {
  switch (provider) {
    case 'mistral':
      return [
        { name: 'Mistral Large', model: 'mistral-large-latest' },
        { name: 'Mistral Medium', model: 'mistral-medium-latest' },
        { name: 'Mistral Small', model: 'mistral-small-latest' },
        { name: 'Mixtral 8x7B', model: 'open-mixtral-8x7b' },
        { name: 'Mixtral 8x22B', model: 'open-mixtral-8x22b' },
      ];
    case 'nemotron':
      return [
        { name: 'Nemotron Ultra 253B', model: 'nvidia/llama-3.1-nemotron-ultra-253b-v1' },
        { name: 'Llama 3.1 70B', model: 'meta-llama/llama-3.1-70b-instruct' },
        { name: 'Llama 3.1 8B', model: 'meta-llama/llama-3.1-8b-instruct' },
      ];
    case 'glm':
      return [
        { name: 'GLM-4', model: 'glm-4' },
        { name: 'GLM-4-Flash', model: 'glm-4-flash' },
        { name: 'GLM-4-Air', model: 'glm-4-air' },
        { name: 'GLM-4-AirX', model: 'glm-4-airx' },
      ];
    case 'openai_compatible':
      // Return user-defined custom models
      return aiSettings.openaiCustomModels.value.length > 0
        ? aiSettings.openaiCustomModels.value
        : [
            { name: 'GPT-4o', model: 'gpt-4o' },
            { name: 'GPT-4o Mini', model: 'gpt-4o-mini' },
            { name: 'GPT-4 Turbo', model: 'gpt-4-turbo' },
            { name: 'GPT-3.5 Turbo', model: 'gpt-3.5-turbo' },
            { name: 'O1 Preview', model: 'o1-preview' },
            { name: 'O1 Mini', model: 'o1-mini' },
          ];
    default:
      return [];
  }
}

// ─── Validation before generate ──────────────────────────────────

export function validateProviderConfig(provider: string): string | null {
  switch (provider) {
    case 'mistral':
      if (!aiSettings.mistralApiKey.value.trim()) {
        return 'Mistral API key is not set. Go to Settings → AI to add it.';
      }
      break;
    case 'nemotron':
      if (!aiSettings.openrouterApiKey.value.trim()) {
        return 'OpenRouter API key is not set. Go to Settings → AI to add it.';
      }
      break;
    case 'glm':
      if (!aiSettings.cloudflareWorkerUrl.value.trim()) {
        return 'Cloudflare Worker URL is not set. Go to Settings → AI to add it.';
      }
      if (!aiSettings.glmModel.value.trim()) {
        return 'GLM model name is not set. Go to Settings → AI to add it.';
      }
      break;
    case 'openai_compatible':
      if (!aiSettings.openaiBaseUrl.value.trim()) {
        return 'Base URL is not set. Go to Settings → AI to add it.';
      }
      if (!aiSettings.openaiApiKey.value.trim()) {
        return 'API key is not set. Go to Settings → AI to add it.';
      }
      if (!aiSettings.openaiModel.value.trim()) {
        return 'Model name is not set. Go to Settings → AI to add it.';
      }
      break;
    default:
      return 'Unknown provider selected.';
  }
  return null;
}

/// Sets the default model when switching providers
export function setProviderDefaultModel(provider: string) {
  switch (provider) {
    case 'mistral':
      // Mistral uses a fixed model, no user selection needed
      break;
    case 'nemotron':
      // Nemotron uses a fixed model, no user selection needed
      break;
    case 'glm':
      if (!aiSettings.glmModel.value.trim()) {
        aiSettings.glmModel.value = 'glm-4';
      }
      break;
    case 'openai_compatible':
      if (!aiSettings.openaiModel.value.trim() && aiSettings.openaiCustomModels.value.length > 0) {
        aiSettings.openaiModel.value = aiSettings.openaiCustomModels.value[0].model;
      } else if (!aiSettings.openaiModel.value.trim()) {
        aiSettings.openaiModel.value = 'gpt-4o';
      }
      break;
  }
}

// ─── Core generation function ────────────────────────────────────

export async function generateAI(userPrompt, context = null, onChunk = null) {
  if (aiState.isGenerating.value) return;

  // Validate provider configuration before starting
  const validationError = validateProviderConfig(aiState.selectedProvider.value);
  if (validationError) {
    aiState.error.value = validationError;
    return;
  }

  aiState.isGenerating.value = true;
  aiState.streamedOutput.value = '';
  aiState.error.value = null;
  aiState.generationDuration.value = null;
  aiState.lastPrompt.value = userPrompt;
  aiState.lastContext.value = context;
  aiState.generationStartTime.value = Date.now();

  const systemMessage = {
    role: 'system',
    content: [
      'You are a writing assistant inside Texodus, a Markdown editor.',
      'Always respond in valid GitHub Flavored Markdown.',
      'Be precise, helpful, and match the quality of professional writing.',
      'Do not add meta-commentary about your response unless asked.',
    ].join(' '),
  };

  const messages = [systemMessage];
  messages.push(...aiState.conversationHistory.value.slice(-6));

  let finalPrompt = userPrompt;
  if (context) {
    finalPrompt = `**Context:**\n\`\`\`\n${context}\n\`\`\`\n\n**Task:** ${userPrompt}`;
  }
  messages.push({ role: 'user', content: finalPrompt });

  if (_streamUnlisten) {
    await _streamUnlisten();
    _streamUnlisten = null;
  }

  // Generate a unique cancel token for this request
  _cancelToken = `ai_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  _streamUnlisten = await listen('ai-stream-chunk', (event) => {
    const { type, content } = event.payload;
    if (type === 'chunk' && content) {
      aiState.streamedOutput.value += content;
      onChunk?.(content);
    } else if (type === 'cancelled') {
      aiState.isGenerating.value = false;
    }
  });

  try {
    const p = aiState.selectedProvider.value;
    const temperature = aiState.temperature.value;
    const maxTokens = aiState.maxTokens.value;
    let result;

    if (p === 'mistral') {
      result = await invoke('ai_generate_mistral', {
        apiKey: aiSettings.mistralApiKey.value,
        messages,
        temperature,
        maxTokens,
      });
    } else if (p === 'nemotron') {
      result = await invoke('ai_generate_nemotron', {
        apiKey: aiSettings.openrouterApiKey.value,
        messages,
        temperature,
        maxTokens,
      });
    } else if (p === 'glm') {
      result = await invoke('ai_generate_glm', {
        workerUrl: aiSettings.cloudflareWorkerUrl.value,
        apiKey: aiSettings.cloudflareWorkerKey.value,
        model: aiSettings.glmModel.value,
        messages,
        temperature,
        maxTokens,
      });
    } else if (p === 'openai_compatible') {
      result = await invoke('ai_generate_openai_compatible', {
        baseUrl: aiSettings.openaiBaseUrl.value,
        apiKey: aiSettings.openaiApiKey.value,
        model: aiSettings.openaiModel.value,
        messages,
        temperature,
        maxTokens,
      });
    }

    const finalOutput = result || aiState.streamedOutput.value;

    aiState.conversationHistory.value.push(
      { role: 'user', content: finalPrompt },
      { role: 'assistant', content: finalOutput },
    );
    if (aiState.conversationHistory.value.length > 20) {
      aiState.conversationHistory.value = aiState.conversationHistory.value.slice(-20);
    }

    aiState.generationDuration.value = ((Date.now() - aiState.generationStartTime.value) / 1000).toFixed(1);
    return finalOutput;
  } catch (err) {
    aiState.error.value = String(err).replace(/Bearer\s+\S+/gi, 'Bearer [REDACTED]');
    throw err;
  } finally {
    aiState.isGenerating.value = false;
    _cancelToken = null;
    if (_streamUnlisten) {
      await _streamUnlisten();
      _streamUnlisten = null;
    }
  }
}

/// Stops the current generation by invoking the Rust-side cancel command.
export async function stopGeneration() {
  if (!aiState.isGenerating.value) return;
  try {
    await invoke('ai_stop');
  } catch (err) {
    console.warn('[Texodus AI] Stop failed:', err);
  }
  aiState.isGenerating.value = false;
  if (_streamUnlisten) {
    await _streamUnlisten();
    _streamUnlisten = null;
  }
}

/// Cleans up the stream listener on component unmount.
export function cleanupAI() {
  if (_streamUnlisten) {
    _streamUnlisten();
    _streamUnlisten = null;
  }
}

export async function retryLastGeneration(onChunk) {
  if (!aiState.lastPrompt.value) return;
  return generateAI(aiState.lastPrompt.value, aiState.lastContext.value, onChunk);
}

export function clearConversation() {
  aiState.conversationHistory.value = [];
  aiState.streamedOutput.value = '';
  aiState.error.value = null;
  aiState.generationDuration.value = null;
  aiState.lastPrompt.value = '';
  aiState.lastContext.value = null;
}

export async function testConnection(provider) {
  const key = {
    mistral: aiSettings.mistralApiKey.value,
    nemotron: aiSettings.openrouterApiKey.value,
    glm: aiSettings.cloudflareWorkerKey.value,
    openai_compatible: aiSettings.openaiApiKey.value,
  }[provider] ?? '';

  const workerUrl = (provider === 'glm' || provider === 'openai_compatible')
    ? (provider === 'glm' ? aiSettings.cloudflareWorkerUrl.value : aiSettings.openaiBaseUrl.value)
    : undefined;

  return invoke('ai_test_connection', { provider, apiKey: key, workerUrl });
}

// ─── Quick action definitions ────────────────────────────────────

export const QUICK_ACTIONS = [
  {
    id: 'improve',
    label: 'Improve Writing',
    icon: '✨',
    prompt: 'Improve the writing quality of the following text. Make it clearer, more engaging, and more polished while preserving the original meaning and voice. Output only the improved text:',
    needsContext: true,
  },
  {
    id: 'shorter',
    label: 'Make Shorter',
    icon: '✂️',
    prompt: 'Make the following text more concise. Remove all redundancy and filler while keeping every important idea. Output only the shortened version:',
    needsContext: true,
  },
  {
    id: 'longer',
    label: 'Expand',
    icon: '📝',
    prompt: 'Expand and elaborate on the following text. Add relevant depth, examples, and detail. Match the existing tone and style. Output only the expanded text:',
    needsContext: true,
  },
  {
    id: 'grammar',
    label: 'Fix Grammar',
    icon: '🔤',
    prompt: 'Fix all grammar, spelling, and punctuation errors in the following text. Make no other changes — do not rephrase, only correct errors. Output the corrected text only:',
    needsContext: true,
  },
  {
    id: 'summarize',
    label: 'Summarize',
    icon: '📋',
    prompt: 'Write a concise summary of the following text as 3–5 Markdown bullet points. Capture only the core ideas:',
    needsContext: true,
  },
  {
    id: 'outline',
    label: 'Generate Outline',
    icon: '🗂️',
    prompt: 'Generate a detailed Markdown document outline for the following topic. Use nested headings (##, ###) and brief descriptions for each section:',
    needsContext: false,
  },
  {
    id: 'professional',
    label: 'Make Professional',
    icon: '💼',
    prompt: 'Rewrite the following text in a professional, formal tone suitable for business communication. Output only the rewritten text:',
    needsContext: true,
  },
  {
    id: 'casual',
    label: 'Make Casual',
    icon: '😊',
    prompt: 'Rewrite the following text in a casual, friendly, conversational tone. Keep it natural and approachable. Output only the rewritten text:',
    needsContext: true,
  },
  {
    id: 'continue',
    label: 'Continue Writing',
    icon: '▶️',
    prompt: 'Continue writing from where the following text ends. Match the style, tone, voice, and format exactly. Write at least 3 more paragraphs:',
    needsContext: true,
  },
  {
    id: 'translate',
    label: 'Translate to English',
    icon: '🌐',
    prompt: 'Translate the following text to English. Preserve the meaning, tone, and formatting as closely as possible:',
    needsContext: true,
  },
];
