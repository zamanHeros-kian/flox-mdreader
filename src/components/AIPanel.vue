<template>
  <aside
    class="ai-panel"
    :class="{ 'ai-panel--resizing': isResizing }"
    :style="{ width: panelWidth + 'px' }"
    @keydown="onPanelKeydown"
    tabindex="-1"
  >
    <div class="ai-panel__resize" @mousedown.prevent="startResize" />

    <!-- Header -->
    <header class="ai-panel__header">
      <div class="ai-panel__brand">
        <span class="ai-panel__star">✦</span>
        <span class="ai-panel__title-text">AI Assistant</span>
      </div>
      <div class="ai-panel__header-actions">
        <button
          class="ai-icon-btn"
          :class="{ 'ai-icon-btn--active': isPinned }"
          @click="isPinned = !isPinned"
          :title="isPinned ? 'Unpin panel (Esc to close)' : 'Pin panel open'"
        >📌</button>
        <button class="ai-icon-btn" @click="$emit('close')" title="Close AI panel">✕</button>
      </div>
    </header>

    <!-- Provider selector -->
    <div class="ai-provider-row">
      <button
        v-for="p in PROVIDERS"
        :key="p.id"
        class="ai-provider-btn"
        :class="{ 'ai-provider-btn--active': aiState.selectedProvider.value === p.id }"
        @click="selectProvider(p.id)"
      >
        <span class="ai-provider-btn__name">{{ p.label }}</span>
        <span class="ai-provider-btn__sub">{{ p.sub }}</span>
      </button>
    </div>

    <!-- Tab bar -->
    <nav class="ai-tabs">
      <button
        v-for="tab in ['generate', 'templates', 'settings', 'history']"
        :key="tab"
        class="ai-tab"
        :class="{ 'ai-tab--active': activeTab === tab }"
        @click="activeTab = tab"
      >{{ tab.charAt(0).toUpperCase() + tab.slice(1) }}</button>
    </nav>

    <!-- TAB: GENERATE -->
    <div v-if="activeTab === 'generate'" class="ai-body">
      <!-- Model Selector (only for providers with multiple models) -->
      <div v-if="showModelSelectorColumn" class="ai-field">
        <label class="ai-label">
          Model
          <button class="ai-model-selector-toggle" @click="showModelSelector = !showModelSelector">
            {{ showModelSelector ? '▲' : '▼' }}
          </button>
        </label>
        <div class="ai-model-current" @click="showModelSelector = !showModelSelector">
          <span class="ai-model-name">
            {{ availableModels.find(m => m.model === currentModelId)?.name || 'Select Model' }}
          </span>
          <span class="ai-model-badge">{{ currentModelId }}</span>
        </div>
        <div v-if="showModelSelector" class="ai-model-dropdown">
          <div
            v-for="model in availableModels"
            :key="model.model"
            class="ai-model-option"
            :class="{ 'ai-model-option--active': model.model === currentModelId }"
            @click="selectModel(model.name, model.model)"
          >
            <span class="ai-model-option__name">{{ model.name }}</span>
            <span class="ai-model-option__id">{{ model.model }}</span>
          </div>
          <div v-if="aiState.selectedProvider.value === 'openai_compatible'" class="ai-model-add">
            <input
              v-model="newModelName"
              class="ai-model-add__input"
              placeholder="Model name (e.g. GPT-4o)"
            />
            <input
              v-model="newModelId"
              class="ai-model-add__input"
              placeholder="Model ID (e.g. gpt-4o)"
            />
            <button class="ai-model-add__btn" @click="handleAddCustomModel">+ Add</button>
          </div>
        </div>
      </div>

      <div class="ai-field">
        <label class="ai-label">Context</label>
        <div class="ai-pills">
          <button
            v-for="m in ['none', 'selection', 'document']"
            :key="m"
            class="ai-pill"
            :class="{ 'ai-pill--active': contextMode === m }"
            @click="contextMode = m"
          >
            {{ m === 'none' ? 'None' : m === 'selection' ? '✂ Selection' : '📄 Document' }}
          </button>
        </div>
        <span class="ai-hint">{{ contextLabel }}</span>
      </div>

      <div class="ai-field">
        <label class="ai-label">Quick Actions</label>
        <div class="ai-actions-grid">
          <button
            v-for="action in QUICK_ACTIONS"
            :key="action.id"
            class="ai-action-btn"
            :disabled="aiState.isGenerating.value"
            @click="handleQuickAction(action)"
            :title="action.prompt.slice(0, 80)"
          >
            <span class="ai-action-btn__icon">{{ action.icon }}</span>
            <span class="ai-action-btn__label">{{ action.label }}</span>
          </button>
        </div>
      </div>

      <div class="ai-field">
        <label class="ai-label">
          Prompt
          <kbd class="ai-kbd">⌃↵</kbd>
        </label>
        <textarea
          v-model="promptInput"
          class="ai-textarea"
          rows="4"
          placeholder="What would you like to write or generate?"
          @keydown="onInputKeydown"
        />
      </div>

      <div class="ai-sliders-row">
        <div class="ai-slider-group">
          <span class="ai-slider-label">Temp {{ aiState.temperature.value.toFixed(1) }}</span>
          <input type="range" min="0" max="1" step="0.1" class="ai-slider" v-model.number="aiState.temperature.value" />
        </div>
        <div class="ai-slider-group">
          <span class="ai-slider-label">Tokens {{ aiState.maxTokens.value }}</span>
          <input type="range" min="256" max="4096" step="256" class="ai-slider" v-model.number="aiState.maxTokens.value" />
        </div>
      </div>

      <div class="ai-btn-row">
        <button
          v-if="!aiState.isGenerating.value"
          class="ai-btn ai-btn--primary"
          :disabled="!promptInput.trim()"
          @click="handleGenerate"
        >✦ Generate</button>
        <button v-else class="ai-btn ai-btn--stop" @click="handleStop">⏹ Stop</button>
        <button class="ai-btn ai-btn--ghost" @click="handleClearAll" title="Clear output and conversation history">🗑</button>
      </div>

      <div v-if="aiState.error.value" class="ai-error">
        <div class="ai-error__msg">{{ aiState.error.value }}</div>
        <button class="ai-error__retry" @click="handleRetry">↺ Retry</button>
      </div>

      <div v-if="outputText || aiState.isGenerating.value" class="ai-output-wrap">
        <div class="ai-output-header">
          <span class="ai-label">Output</span>
          <div class="ai-output-meta">
            <span v-if="aiState.isGenerating.value" class="ai-badge ai-badge--live">
              <span class="ai-dot"></span> Generating…
            </span>
            <span v-else-if="aiState.generationDuration.value" class="ai-badge">
              {{ aiState.generationDuration.value }}s
            </span>
          </div>
        </div>
        <div class="ai-output" ref="outputEl">
          <pre class="ai-output__pre">{{ outputText }}</pre>
        </div>
        <div class="ai-output-stats">{{ outputWordCount }}</div>
        <div v-if="outputText && !aiState.isGenerating.value" class="ai-insert-row">
          <button class="ai-insert-btn" @click="insertAtCursor" title="Insert at cursor">↙ Insert</button>
          <button class="ai-insert-btn" @click="replaceSelection" title="Replace selected text">⇄ Replace</button>
          <button class="ai-insert-btn" @click="appendToDoc" title="Append to end of document">↓ Append</button>
          <button class="ai-insert-btn" @click="copyOutput" title="Copy to clipboard">⎘ Copy</button>
        </div>
      </div>
    </div>

    <!-- TAB: TEMPLATES -->
    <div v-else-if="activeTab === 'templates'" class="ai-body">
      <div class="ai-template-list">
        <div v-for="tpl in templates" :key="tpl.id" class="ai-template-item">
          <div class="ai-template-item__main" @click="useTemplate(tpl)">
            <span class="ai-template-item__icon">{{ tpl.icon }}</span>
            <div class="ai-template-item__text">
              <span class="ai-template-item__name">{{ tpl.name }}</span>
              <span class="ai-template-item__preview">{{ tpl.prompt.slice(0, 55) }}…</span>
            </div>
          </div>
          <button
            v-if="!tpl.isDefault"
            class="ai-template-item__del"
            @click.stop="deleteTemplate(tpl.id)"
            title="Delete template"
          >✕</button>
        </div>
      </div>
      <button class="ai-btn ai-btn--ghost ai-btn--block" @click="showNewTemplate = !showNewTemplate">
        {{ showNewTemplate ? '✕ Cancel' : '+ New Template' }}
      </button>
      <div v-if="showNewTemplate" class="ai-template-editor">
        <div class="ai-field">
          <label class="ai-label">Name</label>
          <input v-model="newTplName" class="ai-input" placeholder="My Template" />
        </div>
        <div class="ai-field">
          <label class="ai-label">Icon (emoji)</label>
          <input v-model="newTplIcon" class="ai-input ai-input--tiny" maxlength="2" />
        </div>
        <div class="ai-field">
          <label class="ai-label">Prompt — use [PLACEHOLDER] for variables</label>
          <textarea v-model="newTplPrompt" class="ai-textarea" rows="6" placeholder="Your reusable prompt template…" />
        </div>
        <button class="ai-btn ai-btn--primary ai-btn--block" @click="handleSaveTemplate">Save Template</button>
      </div>
    </div>

    <!-- TAB: SETTINGS -->
    <div v-else-if="activeTab === 'settings'" class="ai-body ai-settings">
      <div class="ai-settings-section">
        <div class="ai-settings-heading">Default Provider</div>
        <select v-model="aiSettings.defaultProvider.value" class="ai-select">
          <option value="mistral">Mistral Large 3</option>
          <option value="nemotron">Nemotron Ultra (OpenRouter)</option>
          <option value="glm">GLM 5.2 (Cloudflare Worker)</option>
        </select>
      </div>

      <div class="ai-settings-section">
        <div class="ai-settings-heading">Mistral API Key</div>
        <div class="ai-key-row">
          <input type="password" v-model="aiSettings.mistralApiKey.value" class="ai-input" placeholder="sk-…" autocomplete="off" />
          <button
            class="ai-test-btn"
            :class="{
              'ai-test-btn--ok': testResult['mistral'] === 'success',
              'ai-test-btn--err': testResult['mistral'] && testResult['mistral'] !== 'success',
            }"
            @click="handleTestConnection('mistral')"
            :disabled="testingProvider === 'mistral' || !aiSettings.mistralApiKey.value"
          >
            {{ testingProvider === 'mistral' ? '…' : testResult['mistral'] === 'success' ? '✓' : testResult['mistral'] ? '✗' : 'Test' }}
          </button>
          <button class="ai-clear-btn" @click="aiSettings.mistralApiKey.value = ''" title="Clear key">✕</button>
        </div>
        <span v-if="testResult['mistral'] && testResult['mistral'] !== 'success'" class="ai-test-error">{{ testResult['mistral'] }}</span>
      </div>

      <div class="ai-settings-section">
        <div class="ai-settings-heading">OpenRouter API Key <span class="ai-settings-sub">(Nemotron Ultra)</span></div>
        <div class="ai-key-row">
          <input type="password" v-model="aiSettings.openrouterApiKey.value" class="ai-input" placeholder="sk-or-…" autocomplete="off" />
          <button
            class="ai-test-btn"
            :class="{
              'ai-test-btn--ok': testResult['nemotron'] === 'success',
              'ai-test-btn--err': testResult['nemotron'] && testResult['nemotron'] !== 'success',
            }"
            @click="handleTestConnection('nemotron')"
            :disabled="testingProvider === 'nemotron' || !aiSettings.openrouterApiKey.value"
          >
            {{ testingProvider === 'nemotron' ? '…' : testResult['nemotron'] === 'success' ? '✓' : testResult['nemotron'] ? '✗' : 'Test' }}
          </button>
          <button class="ai-clear-btn" @click="aiSettings.openrouterApiKey.value = ''" title="Clear key">✕</button>
        </div>
        <span v-if="testResult['nemotron'] && testResult['nemotron'] !== 'success'" class="ai-test-error">{{ testResult['nemotron'] }}</span>
      </div>

      <div class="ai-settings-section">
        <div class="ai-settings-heading">Cloudflare Worker URL <span class="ai-settings-sub">(GLM 5.2)</span></div>
        <input type="url" v-model="aiSettings.cloudflareWorkerUrl.value" class="ai-input" placeholder="https://your-worker.workers.dev" />
      </div>

      <div class="ai-settings-section">
        <div class="ai-settings-heading">Worker Auth Key <span class="ai-settings-sub">(optional)</span></div>
        <div class="ai-key-row">
          <input type="password" v-model="aiSettings.cloudflareWorkerKey.value" class="ai-input" placeholder="Leave blank if worker is open" autocomplete="off" />
          <button
            class="ai-test-btn"
            :class="{
              'ai-test-btn--ok': testResult['glm'] === 'success',
              'ai-test-btn--err': testResult['glm'] && testResult['glm'] !== 'success',
            }"
            @click="handleTestConnection('glm')"
            :disabled="testingProvider === 'glm' || !aiSettings.cloudflareWorkerUrl.value"
          >
            {{ testingProvider === 'glm' ? '…' : testResult['glm'] === 'success' ? '✓' : testResult['glm'] ? '✗' : 'Test' }}
          </button>
          <button class="ai-clear-btn" @click="aiSettings.cloudflareWorkerKey.value = ''" title="Clear key">✕</button>
        </div>
        <span v-if="testResult['glm'] && testResult['glm'] !== 'success'" class="ai-test-error">{{ testResult['glm'] }}</span>
      </div>

      <div class="ai-settings-section">
        <div class="ai-settings-heading">GLM Model Name</div>
        <input type="text" v-model="aiSettings.glmModel.value" class="ai-input" placeholder="glm-4" />
      </div>

      <!-- OpenAI Compatible Provider Settings -->
      <div class="ai-settings-section">
        <div class="ai-settings-heading">OpenAI Compatible Provider</div>
        <div class="ai-settings-sub" style="font-size: 10px; color: var(--text-muted); margin-bottom: 8px;">
          Connect to any OpenAI-compatible API (OpenAI, Together, Groq, OpenRouter, local models, etc.)
        </div>
        <div style="display: flex; flex-direction: column; gap: 8px;">
          <div>
            <div class="ai-settings-sub">Base URL</div>
            <input
              type="url"
              v-model="aiSettings.openaiBaseUrl.value"
              class="ai-input"
              placeholder="https://api.openai.com/v1"
            />
          </div>
          <div>
            <div class="ai-settings-sub">API Key</div>
            <div class="ai-key-row">
              <input
                type="password"
                v-model="aiSettings.openaiApiKey.value"
                class="ai-input"
                placeholder="sk-..."
                autocomplete="off"
              />
              <button
                class="ai-test-btn"
                :class="{
                  'ai-test-btn--ok': testResult['openai_compatible'] === 'success',
                  'ai-test-btn--err': testResult['openai_compatible'] && testResult['openai_compatible'] !== 'success',
                }"
                @click="handleTestConnection('openai_compatible')"
                :disabled="testingProvider === 'openai_compatible' || !aiSettings.openaiBaseUrl.value || !aiSettings.openaiApiKey.value"
              >
                {{ testingProvider === 'openai_compatible' ? '…' : testResult['openai_compatible'] === 'success' ? '✓' : testResult['openai_compatible'] ? '✗' : 'Test' }}
              </button>
              <button class="ai-clear-btn" @click="aiSettings.openaiApiKey.value = ''" title="Clear key">✕</button>
            </div>
            <span v-if="testResult['openai_compatible'] && testResult['openai_compatible'] !== 'success'" class="ai-test-error">
              {{ testResult['openai_compatible'] }}
            </span>
          </div>
          <div>
            <div class="ai-settings-sub">Model Name</div>
            <input
              type="text"
              v-model="aiSettings.openaiModel.value"
              class="ai-input"
              placeholder="gpt-4o"
            />
          </div>
        </div>
      </div>

      <div class="ai-settings-section">
        <div class="ai-settings-heading">Default Temperature: {{ aiSettings.defaultTemperature.value.toFixed(1) }}</div>
        <input type="range" min="0" max="1" step="0.1" class="ai-slider" v-model.number="aiSettings.defaultTemperature.value" />
      </div>

      <div class="ai-settings-section">
        <div class="ai-settings-heading">Default Max Tokens: {{ aiSettings.defaultMaxTokens.value }}</div>
        <input type="range" min="256" max="4096" step="256" class="ai-slider" v-model.number="aiSettings.defaultMaxTokens.value" />
      </div>

      <button class="ai-btn ai-btn--primary ai-btn--block" @click="handleSaveSettings">Save Settings</button>
    </div>

    <!-- TAB: HISTORY -->
    <div v-else-if="activeTab === 'history'" class="ai-body">
      <div v-if="sessionHistory.length === 0" class="ai-empty">No generations yet this session.</div>
      <div v-else class="ai-history-list">
        <div v-for="item in sessionHistory" :key="item.id" class="ai-history-card">
          <div class="ai-history-card__meta">
            <span class="ai-history-card__provider">{{ item.provider }}</span>
            <span class="ai-history-card__time">{{ item.time }}{{ item.duration ? ` · ${item.duration}s` : '' }}</span>
          </div>
          <div class="ai-history-card__prompt">{{ item.prompt.length > 90 ? item.prompt.slice(0, 90) + '…' : item.prompt }}</div>
          <div class="ai-history-card__output">{{ item.output.length > 140 ? item.output.slice(0, 140) + '…' : item.output }}</div>
          <div class="ai-insert-row">
            <button class="ai-insert-btn" @click="emit('insert-at-cursor', item.output)">↙ Insert</button>
            <button class="ai-insert-btn" @click="emit('append-to-document', item.output)">↓ Append</button>
            <button class="ai-insert-btn" @click="navigator.clipboard.writeText(item.output)">⎘ Copy</button>
          </div>
        </div>
      </div>
    </div>
  </aside>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, nextTick } from 'vue';
import {
  aiState, aiSettings,
  generateAI, retryLastGeneration,
  clearConversation, testConnection,
  QUICK_ACTIONS, loadAISettings, saveAISettings,
  stopGeneration, cleanupAI, getModelsForProvider,
  addCustomModel, removeCustomModel,
  validateProviderConfig, setProviderDefaultModel,
} from '../composables/useAI';
import { usePromptTemplates } from '../composables/usePromptTemplates';

const props = defineProps({
  selectedText: { type: String, default: '' },
  documentContent: { type: String, default: '' },
});

const emit = defineEmits([
  'close',
  'insert-at-cursor',
  'replace-selection',
  'append-to-document',
]);

const promptInput = ref('');
const outputEl = ref(null);
const outputText = ref('');
const contextMode = ref('none');
const activeTab = ref('generate');
const showNewTemplate = ref(false);
const isPinned = ref(false);
const panelWidth = ref(320);
const isResizing = ref(false);
const sessionHistory = ref([]);
const newTplName = ref('');
const newTplIcon = ref('📌');
const newTplPrompt = ref('');
const testingProvider = ref(null);
const testResult = ref({});

// Model selector state
const showModelSelector = ref(false);
const newModelName = ref('');
const newModelId = ref('');

const { templates, loadTemplates, addTemplate, deleteTemplate } = usePromptTemplates();

// Available models for the currently selected provider
const availableModels = computed(() => getModelsForProvider(aiState.selectedProvider.value));

const PROVIDERS = [
  { id: 'mistral', label: 'Mistral Large 3', sub: 'Mistral' },
  { id: 'nemotron', label: 'Nemotron Ultra', sub: 'OpenRouter' },
  { id: 'glm', label: 'GLM 5.2', sub: 'Cloudflare' },
  { id: 'openai_compatible', label: 'OpenAI API', sub: 'Custom' },
];

const contextLabel = computed(() => {
  if (contextMode.value === 'selection') {
    return props.selectedText ? `Selection — ${props.selectedText.length} chars` : 'No text selected';
  }
  if (contextMode.value === 'document') {
    return `Full document — ${props.documentContent.length} chars`;
  }
  return 'No context injected';
});

// Current model ID based on provider
const currentModelId = computed(() => {
  switch (aiState.selectedProvider.value) {
    case 'mistral':
      return 'mistral-large-latest';
    case 'nemotron':
      return 'nvidia/llama-3.1-nemotron-ultra-253b-v1';
    case 'glm':
      return aiSettings.glmModel.value || 'glm-4';
    case 'openai_compatible':
      return aiSettings.openaiModel.value || 'gpt-4o';
    default:
      return '';
  }
});

// Whether to show model selector (only for providers with choices)
const showModelSelectorColumn = computed(() => {
  return availableModels.value.length > 1;
});

const outputWordCount = computed(() => {
  if (!outputText.value) return '';
  const words = outputText.value.trim().split(/\s+/).filter(Boolean).length;
  const chars = outputText.value.length;
  return `${words} words · ${chars} chars`;
});

async function handleGenerate() {
  if (!promptInput.value.trim() || aiState.isGenerating.value) return;
  outputText.value = '';
  const context = contextMode.value === 'selection' ? (props.selectedText || null)
    : contextMode.value === 'document' ? (props.documentContent || null)
    : null;
  try {
    const result = await generateAI(promptInput.value.trim(), context, () => {
      outputText.value = aiState.streamedOutput.value;
      nextTick(scrollToBottom);
    });
    outputText.value = result || aiState.streamedOutput.value;
    sessionHistory.value.unshift({
      id: Date.now(),
      prompt: promptInput.value.trim(),
      output: outputText.value,
      provider: aiState.selectedProvider.value,
      time: new Date().toLocaleTimeString(),
      duration: aiState.generationDuration.value,
    });
    if (sessionHistory.value.length > 15) {
      sessionHistory.value = sessionHistory.value.slice(0, 15);
    }
  } catch (err) {
    // aiState.error is set
  }
}

async function handleQuickAction(action) {
  outputText.value = '';
  const context = contextMode.value === 'selection' ? props.selectedText
    : contextMode.value === 'document' ? props.documentContent
    : null;
  if (action.needsContext && !context) {
    promptInput.value = action.prompt;
    activeTab.value = 'generate';
    return;
  }
  try {
    const result = await generateAI(action.prompt, context, () => {
      outputText.value = aiState.streamedOutput.value;
      nextTick(scrollToBottom);
    });
    outputText.value = result || aiState.streamedOutput.value;
    sessionHistory.value.unshift({
      id: Date.now(),
      prompt: action.prompt,
      output: outputText.value,
      provider: aiState.selectedProvider.value,
      time: new Date().toLocaleTimeString(),
    });
  } catch (err) {
    // handled
  }
}

async function handleRetry() {
  outputText.value = '';
  try {
    const result = await retryLastGeneration(() => {
      outputText.value = aiState.streamedOutput.value;
      nextTick(scrollToBottom);
    });
    outputText.value = result || aiState.streamedOutput.value;
  } catch (err) {
    // handled
  }
}

function handleStop() {
  stopGeneration();
}

function selectProvider(providerId: string) {
  aiState.selectedProvider.value = providerId;
  setProviderDefaultModel(providerId);
  showModelSelector.value = false;
}

function useTemplate(template) {
  promptInput.value = template.prompt;
  activeTab.value = 'generate';
}

function handleSaveTemplate() {
  if (!newTplName.value.trim() || !newTplPrompt.value.trim()) return;
  addTemplate(newTplName.value, newTplIcon.value, newTplPrompt.value);
  newTplName.value = '';
  newTplIcon.value = '📌';
  newTplPrompt.value = '';
  showNewTemplate.value = false;
}

function insertAtCursor() { emit('insert-at-cursor', outputText.value); }
function replaceSelection() { emit('replace-selection', outputText.value); }
function appendToDoc() { emit('append-to-document', outputText.value); }

async function copyOutput() {
  if (!outputText.value) return;
  await navigator.clipboard.writeText(outputText.value);
}

async function handleTestConnection(provider) {
  testingProvider.value = provider;
  testResult.value[provider] = null;
  try {
    await testConnection(provider);
    testResult.value = { ...testResult.value, [provider]: 'success' };
  } catch (err) {
    testResult.value = { ...testResult.value, [provider]: String(err) };
  } finally {
    testingProvider.value = null;
  }
}

// Model management functions
function handleAddCustomModel() {
  if (!newModelName.value.trim() || !newModelId.value.trim()) return;
  addCustomModel(newModelName.value, newModelId.value);
  newModelName.value = '';
  newModelId.value = '';
}

function handleRemoveCustomModel(name: string) {
  removeCustomModel(name);
}

function selectModel(modelName: string, modelId: string) {
  if (aiState.selectedProvider.value === 'openai_compatible') {
    aiSettings.openaiModel.value = modelId;
  } else if (aiState.selectedProvider.value === 'glm') {
    aiSettings.glmModel.value = modelId;
  }
  showModelSelector.value = false;
}

async function handleSaveSettings() {
  try {
    await saveAISettings();
  } catch (err) {
    console.error('[Texodus AI] Save failed:', err);
  }
}

function startResize(e) {
  isResizing.value = true;
  const startX = e.clientX;
  const startW = panelWidth.value;
  function onMove(e) {
    const delta = startX - e.clientX;
    panelWidth.value = Math.min(520, Math.max(240, startW + delta));
  }
  function onUp() {
    isResizing.value = false;
    window.removeEventListener('mousemove', onMove);
    window.removeEventListener('mouseup', onUp);
  }
  window.addEventListener('mousemove', onMove);
  window.addEventListener('mouseup', onUp);
}

function onPanelKeydown(e) {
  if (!isPinned.value && e.key === 'Escape') emit('close');
}

function onInputKeydown(e) {
  if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
    e.preventDefault();
    e.stopPropagation();
    handleGenerate();
  }
}

function scrollToBottom() {
  if (outputEl.value) outputEl.value.scrollTop = outputEl.value.scrollHeight;
}

function clearOutput() {
  outputText.value = '';
  aiState.error.value = null;
  aiState.generationDuration.value = null;
}

function handleClearAll() {
  clearConversation();
  clearOutput();
}

onMounted(async () => {
  await loadAISettings();
  loadTemplates();
});

onUnmounted(() => {
  cleanupAI();
});
</script>

<style scoped>
.ai-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--bg-color);
  border-left: 1px solid var(--border-color);
  position: relative;
  flex-shrink: 0;
  font-size: 13px;
  user-select: none;
  outline: none;
}

.ai-panel--resizing { cursor: col-resize; }

.ai-panel__resize {
  position: absolute;
  left: -3px;
  top: 0;
  width: 6px;
  height: 100%;
  cursor: col-resize;
  z-index: 10;
}
.ai-panel__resize:hover {
  background: var(--accent-color);
  opacity: 0.4;
}

.ai-panel__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 9px 12px;
  border-bottom: 1px solid var(--border-color);
  flex-shrink: 0;
}

.ai-panel__brand {
  display: flex;
  align-items: center;
  gap: 6px;
  font-weight: 600;
  font-size: 12.5px;
  color: var(--text-color);
  letter-spacing: 0.01em;
}

.ai-panel__star {
  color: var(--accent-color);
  font-size: 13px;
}

.ai-panel__header-actions {
  display: flex;
  gap: 2px;
}

.ai-icon-btn {
  background: none;
  border: none;
  cursor: pointer;
  color: var(--text-color);
  opacity: 0.45;
  padding: 3px 6px;
  border-radius: 4px;
  font-size: 12px;
  transition: opacity 0.12s, background 0.12s;
}
.ai-icon-btn:hover { opacity: 1; background: var(--border-color); }
.ai-icon-btn--active { opacity: 1; color: var(--accent-color); }

.ai-provider-row {
  display: flex;
  gap: 4px;
  padding: 7px 10px;
  border-bottom: 1px solid var(--border-color);
  flex-shrink: 0;
}

.ai-provider-btn {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  padding: 5px 3px;
  border: 1px solid var(--border-color);
  border-radius: 5px;
  background: none;
  cursor: pointer;
  color: var(--text-color);
  opacity: 0.55;
  transition: all 0.12s;
}
.ai-provider-btn:hover { opacity: 0.85; background: var(--border-color); }
.ai-provider-btn--active {
  opacity: 1;
  border-color: var(--accent-color);
  background: var(--accent-subtle);
  color: var(--accent-color);
}

.ai-provider-btn__name { font-size: 10px; font-weight: 700; white-space: nowrap; }
.ai-provider-btn__sub { font-size: 9px; opacity: 0.65; }

.ai-tabs {
  display: flex;
  border-bottom: 1px solid var(--border-color);
  flex-shrink: 0;
}

.ai-tab {
  flex: 1;
  padding: 7px 0;
  border: none;
  background: none;
  cursor: pointer;
  font-size: 11.5px;
  font-weight: 500;
  color: var(--text-color);
  opacity: 0.5;
  border-bottom: 2px solid transparent;
  transition: all 0.12s;
}
.ai-tab:hover { opacity: 0.8; }
.ai-tab--active {
  opacity: 1;
  border-bottom-color: var(--accent-color);
  color: var(--accent-color);
}

.ai-body {
  flex: 1;
  overflow-y: auto;
  padding: 11px 11px 20px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.ai-field { display: flex; flex-direction: column; gap: 5px; }
.ai-label {
  font-size: 10.5px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.07em;
  color: var(--text-color);
  opacity: 0.55;
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.ai-kbd {
  font-family: monospace;
  font-size: 10px;
  padding: 1px 4px;
  border: 1px solid var(--border-color);
  border-radius: 3px;
  background: var(--border-color);
  text-transform: none;
  letter-spacing: 0;
  font-weight: normal;
  opacity: 0.9;
}

.ai-hint {
  font-size: 10px;
  color: var(--text-color);
  opacity: 0.38;
  font-style: italic;
}

.ai-pills { display: flex; gap: 4px; }

.ai-pill {
  padding: 4px 9px;
  border: 1px solid var(--border-color);
  border-radius: 20px;
  background: none;
  cursor: pointer;
  font-size: 11px;
  color: var(--text-color);
  opacity: 0.55;
  transition: all 0.12s;
}
.ai-pill:hover { opacity: 0.85; }
.ai-pill--active {
  opacity: 1;
  border-color: var(--accent-color);
  background: var(--accent-subtle);
  color: var(--accent-color);
}

.ai-actions-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 4px;
}

.ai-action-btn {
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 6px 8px;
  border: 1px solid var(--border-color);
  border-radius: 5px;
  background: none;
  cursor: pointer;
  font-size: 11px;
  color: var(--text-color);
  transition: all 0.12s;
  text-align: left;
}
.ai-action-btn:hover:not(:disabled) {
  background: var(--border-color);
  border-color: var(--accent-color);
}
.ai-action-btn:disabled { opacity: 0.35; cursor: not-allowed; }
.ai-action-btn__icon { font-size: 12px; flex-shrink: 0; }
.ai-action-btn__label { font-size: 10.5px; }

.ai-textarea {
  width: 100%;
  padding: 8px 9px;
  border: 1px solid var(--border-color);
  border-radius: 5px;
  background: var(--bg-color);
  color: var(--text-color);
  font-size: 12px;
  line-height: 1.5;
  resize: vertical;
  font-family: inherit;
  box-sizing: border-box;
  transition: border-color 0.12s;
}
.ai-textarea:focus { outline: none; border-color: var(--accent-color); }

.ai-input {
  width: 100%;
  padding: 6px 9px;
  border: 1px solid var(--border-color);
  border-radius: 5px;
  background: var(--bg-color);
  color: var(--text-color);
  font-size: 12px;
  font-family: inherit;
  box-sizing: border-box;
  transition: border-color 0.12s;
}
.ai-input:focus { outline: none; border-color: var(--accent-color); }
.ai-input--tiny { width: 50px; text-align: center; font-size: 15px; }

.ai-select {
  width: 100%;
  padding: 6px 9px;
  border: 1px solid var(--border-color);
  border-radius: 5px;
  background: var(--bg-color);
  color: var(--text-color);
  font-size: 12px;
  cursor: pointer;
}

.ai-sliders-row { display: flex; gap: 10px; }
.ai-slider-group { flex: 1; display: flex; flex-direction: column; gap: 4px; }
.ai-slider-label { font-size: 10.5px; color: var(--text-color); opacity: 0.6; }
.ai-slider { width: 100%; accent-color: var(--accent-color); cursor: pointer; }

.ai-btn-row { display: flex; gap: 5px; }

.ai-btn {
  padding: 7px 13px;
  border-radius: 5px;
  border: 1px solid var(--border-color);
  cursor: pointer;
  font-size: 12px;
  font-weight: 600;
  font-family: inherit;
  transition: all 0.12s;
}

.ai-btn--primary {
  background: var(--accent-color);
  color: var(--bg-color);
  border-color: var(--accent-color);
}
.ai-btn--primary:hover { opacity: 0.85; }
.ai-btn--primary:disabled { opacity: 0.4; cursor: not-allowed; }

.ai-btn--stop {
  background: var(--danger-color);
  color: var(--bg-color);
  border-color: var(--danger-color);
  flex: 1;
}
.ai-btn--stop:hover { opacity: 0.85; }

.ai-btn--ghost {
  background: transparent;
  color: var(--text-color);
}
.ai-btn--ghost:hover { background: var(--btn-hover); }

.ai-btn--block { width: 100%; }

.ai-error {
  padding: 8px 10px;
  background: var(--blockquote-bg);
  border: 1px solid var(--danger-color);
  border-radius: 5px;
}
.ai-error__msg {
  font-size: 11px;
  color: var(--danger-color);
  margin-bottom: 5px;
}
.ai-error__retry {
  background: none;
  border: 1px solid var(--border-color);
  border-radius: 4px;
  padding: 3px 8px;
  font-size: 11px;
  cursor: pointer;
  color: var(--text-color);
}
.ai-error__retry:hover { background: var(--btn-hover); }

.ai-output-wrap {
  border: 1px solid var(--border-color);
  border-radius: 5px;
  overflow: hidden;
}

.ai-output-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 9px;
  background: var(--bg-secondary);
  border-bottom: 1px solid var(--border-color);
}

.ai-output-meta {
  display: flex;
  gap: 5px;
  align-items: center;
}

.ai-badge {
  font-size: 10px;
  padding: 2px 6px;
  background: var(--bg-color);
  border: 1px solid var(--border-color);
  border-radius: 10px;
  color: var(--text-muted);
}

.ai-badge--live {
  color: var(--accent-color);
  border-color: var(--accent-color);
}

.ai-dot {
  display: inline-block;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--accent-color);
  margin-right: 4px;
  animation: ai-pulse 1.2s infinite;
}

@keyframes ai-pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.4; }
}

.ai-output {
  max-height: 240px;
  overflow-y: auto;
  padding: 9px;
}

.ai-output__pre {
  margin: 0;
  font-family: inherit;
  font-size: 12px;
  white-space: pre-wrap;
  word-break: break-word;
  color: var(--text-color);
  line-height: 1.5;
}

.ai-output-stats {
  padding: 4px 9px;
  font-size: 10px;
  color: var(--text-muted);
  border-top: 1px solid var(--border-color);
  background: var(--bg-secondary);
}

.ai-insert-row {
  display: flex;
  gap: 4px;
  padding: 6px 9px;
  border-top: 1px solid var(--border-color);
  background: var(--bg-secondary);
}

.ai-insert-btn {
  flex: 1;
  padding: 5px 8px;
  border: 1px solid var(--border-color);
  border-radius: 4px;
  background: var(--bg-color);
  color: var(--text-color);
  font-size: 10.5px;
  cursor: pointer;
  transition: all 0.12s;
}
.ai-insert-btn:hover {
  background: var(--accent-subtle);
  border-color: var(--accent-color);
  color: var(--accent-color);
}

.ai-template-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.ai-template-item {
  display: flex;
  align-items: stretch;
  border: 1px solid var(--border-color);
  border-radius: 5px;
  overflow: hidden;
}

.ai-template-item__main {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px;
  cursor: pointer;
  transition: background 0.12s;
}
.ai-template-item__main:hover { background: var(--bg-secondary); }

.ai-template-item__icon { font-size: 16px; }

.ai-template-item__text {
  display: flex;
  flex-direction: column;
  gap: 1px;
  min-width: 0;
}

.ai-template-item__name { font-size: 11.5px; font-weight: 600; color: var(--text-color); }
.ai-template-item__preview {
  font-size: 10px;
  color: var(--text-muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.ai-template-item__del {
  padding: 0 10px;
  border: none;
  border-left: 1px solid var(--border-color);
  background: var(--bg-secondary);
  color: var(--text-muted);
  cursor: pointer;
  font-size: 11px;
}
.ai-template-item__del:hover {
  background: var(--danger-color);
  color: var(--bg-color);
}

.ai-template-editor {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 10px;
  border: 1px solid var(--border-color);
  border-radius: 5px;
  background: var(--bg-secondary);
}

.ai-settings {
  gap: 14px;
}

.ai-settings-section {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.ai-settings-heading {
  font-size: 11px;
  font-weight: 600;
  color: var(--text-color);
  display: flex;
  align-items: center;
  gap: 4px;
}

.ai-settings-sub {
  font-weight: normal;
  color: var(--text-muted);
  font-size: 10px;
}

.ai-key-row {
  display: flex;
  gap: 4px;
  align-items: center;
}

.ai-key-row .ai-input { flex: 1; }

.ai-test-btn {
  padding: 6px 10px;
  border: 1px solid var(--border-color);
  border-radius: 5px;
  background: var(--bg-color);
  color: var(--text-color);
  cursor: pointer;
  font-size: 11px;
  font-weight: 500;
  min-width: 48px;
  transition: all 0.12s;
}
.ai-test-btn:hover:not(:disabled) { background: var(--btn-hover); }
.ai-test-btn:disabled { opacity: 0.5; cursor: not-allowed; }

.ai-test-btn--ok {
  background: var(--accent-subtle);
  border-color: var(--accent-color);
  color: var(--accent-color);
}

.ai-test-btn--err {
  background: var(--blockquote-bg);
  border-color: var(--danger-color);
  color: var(--danger-color);
}

.ai-clear-btn {
  padding: 6px 8px;
  border: 1px solid var(--border-color);
  border-radius: 5px;
  background: var(--bg-color);
  color: var(--text-muted);
  cursor: pointer;
  font-size: 11px;
}
.ai-clear-btn:hover { background: var(--btn-hover); color: var(--text-color); }

.ai-test-error {
  font-size: 10px;
  color: var(--danger-color);
}

/* ── Model selector ── */
.ai-model-selector-toggle {
  background: none;
  border: none;
  cursor: pointer;
  color: var(--text-muted);
  font-size: 10px;
  padding: 2px 4px;
  border-radius: 3px;
}
.ai-model-selector-toggle:hover {
  background: var(--btn-hover);
  color: var(--text-color);
}

.ai-model-current {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 9px;
  border: 1px solid var(--border-color);
  border-radius: 5px;
  background: var(--bg-color);
  cursor: pointer;
  transition: border-color 0.12s;
}
.ai-model-current:hover {
  border-color: var(--accent-color);
}

.ai-model-name {
  font-size: 12px;
  color: var(--text-color);
  font-weight: 500;
}

.ai-model-badge {
  font-size: 9px;
  padding: 2px 6px;
  background: var(--accent-subtle);
  color: var(--accent-color);
  border-radius: 10px;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.ai-model-dropdown {
  border: 1px solid var(--border-color);
  border-radius: 5px;
  background: var(--bg-color);
  max-height: 200px;
  overflow-y: auto;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
}

.ai-model-option {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 8px 10px;
  cursor: pointer;
  border-bottom: 1px solid var(--border-color);
  transition: background 0.12s;
}
.ai-model-option:last-child {
  border-bottom: none;
}
.ai-model-option:hover {
  background: var(--bg-secondary);
}
.ai-model-option--active {
  background: var(--accent-subtle);
  border-left: 2px solid var(--accent-color);
}

.ai-model-option__name {
  font-size: 11.5px;
  font-weight: 600;
  color: var(--text-color);
}

.ai-model-option__id {
  font-size: 10px;
  color: var(--text-muted);
  font-family: monospace;
}

.ai-model-add {
  display: flex;
  gap: 4px;
  padding: 8px;
  border-top: 1px solid var(--border-color);
  background: var(--bg-secondary);
}

.ai-model-add__input {
  flex: 1;
  padding: 4px 6px;
  border: 1px solid var(--border-color);
  border-radius: 4px;
  background: var(--bg-color);
  color: var(--text-color);
  font-size: 11px;
  font-family: inherit;
}
.ai-model-add__input:focus {
  outline: none;
  border-color: var(--accent-color);
}

.ai-model-add__btn {
  padding: 4px 10px;
  border: 1px solid var(--accent-color);
  border-radius: 4px;
  background: var(--accent-color);
  color: var(--bg-color);
  font-size: 11px;
  font-weight: 600;
  cursor: pointer;
  transition: opacity 0.12s;
}
.ai-model-add__btn:hover {
  opacity: 0.85;
}

.ai-empty {
  padding: 20px;
  text-align: center;
  color: var(--text-muted);
  font-size: 11px;
  font-style: italic;
}

.ai-history-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.ai-history-card {
  border: 1px solid var(--border-color);
  border-radius: 5px;
  padding: 8px 10px;
  display: flex;
  flex-direction: column;
  gap: 5px;
}

.ai-history-card__meta {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.ai-history-card__provider {
  font-size: 10px;
  font-weight: 600;
  text-transform: uppercase;
  color: var(--accent-color);
  letter-spacing: 0.05em;
}

.ai-history-card__time {
  font-size: 10px;
  color: var(--text-muted);
}

.ai-history-card__prompt {
  font-size: 11px;
  color: var(--text-color);
  font-style: italic;
}

.ai-history-card__output {
  font-size: 10.5px;
  color: var(--text-muted);
  line-height: 1.4;
}
</style>
