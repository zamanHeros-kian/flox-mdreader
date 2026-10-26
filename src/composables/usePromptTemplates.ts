import { ref } from 'vue';

const DEFAULT_TEMPLATES = [
  {
    id: 'blog-post',
    name: 'Blog Post',
    icon: '📖',
    isDefault: true,
    prompt: `Write a comprehensive blog post about the following topic.

Include:
- An engaging headline and hook introduction
- 3–4 body sections with ## subheadings
- Practical examples or evidence in each section
- A strong conclusion with a clear takeaway

Use a confident, conversational tone. Output in Markdown.

Topic: [TOPIC]`,
  },
  {
    id: 'tech-doc',
    name: 'Technical Doc',
    icon: '⚙️',
    isDefault: true,
    prompt: `Write technical documentation for the following subject.

Include:
- ## Overview
- ## Requirements / Prerequisites
- ## Step-by-step Instructions (numbered)
- ## Code Examples (with fenced code blocks)
- ## Troubleshooting

Subject: [SUBJECT]`,
  },
  {
    id: 'readme',
    name: 'README',
    icon: '📄',
    isDefault: true,
    prompt: `Write a professional GitHub README for the following project.

Sections to include:
- Title (with badge placeholders for build/license/version)
- Short description tagline
- ## Features (bulleted)
- ## Installation
- ## Usage (with code examples)
- ## Configuration
- ## Contributing
- ## License

Project description: [PROJECT DESCRIPTION]`,
  },
  {
    id: 'meeting-notes',
    name: 'Meeting Notes',
    icon: '📅',
    isDefault: true,
    prompt: `Format the following raw notes into clean, structured Markdown meeting notes.

Use these sections:
- **Date:** [date]
- **Attendees:** [names]
- ## Agenda
- ## Discussion Points
- ## Decisions Made
- ## Action Items (with owner and deadline for each)

Raw notes:
[RAW NOTES]`,
  },
  {
    id: 'email',
    name: 'Email Draft',
    icon: '✉️',
    isDefault: true,
    prompt: `Draft a professional email for the following purpose.

Provide:
1. A suggested subject line
2. The full email body with appropriate greeting and sign-off
3. A brief note on tone/strategy used

Email purpose: [PURPOSE]`,
  },
  {
    id: 'social-post',
    name: 'Social Post',
    icon: '📱',
    isDefault: true,
    prompt: `Write 3 variations of a social media post about the following topic.

Requirements:
- Each under 280 characters for X/Twitter compatibility
- Engaging, non-spammy tone
- Include 2–3 relevant hashtags per post
- Label them Variation A, B, C

Topic: [TOPIC]`,
  },
];

const STORAGE_KEY = 'texodus-ai-templates-v1';
const templates = ref([...DEFAULT_TEMPLATES]);

export function usePromptTemplates() {
  function loadTemplates() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const custom = JSON.parse(raw);
        templates.value = [
          ...DEFAULT_TEMPLATES,
          ...custom.filter(t => !t.isDefault),
        ];
      }
    } catch (err) {
      console.warn('[Texodus AI] Failed to load templates:', err);
    }
  }

  function persistCustom() {
    const custom = templates.value.filter(t => !t.isDefault);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(custom));
  }

  function addTemplate(name, icon, prompt) {
    if (!name.trim() || !prompt.trim()) throw new Error('Name and prompt are required');
    const t = {
      id: `custom-${Date.now()}`,
      name: name.trim(),
      icon: icon || '📌',
      prompt: prompt.trim(),
      isDefault: false,
    };
    templates.value = [...templates.value, t];
    persistCustom();
    return t;
  }

  function deleteTemplate(id) {
    const t = templates.value.find(x => x.id === id);
    if (!t || t.isDefault) return;
    templates.value = templates.value.filter(x => x.id !== id);
    persistCustom();
  }

  function updateTemplate(id, updates) {
    const idx = templates.value.findIndex(x => x.id === id);
    if (idx === -1 || templates.value[idx].isDefault) return;
    templates.value = templates.value.map((t, i) =>
      i === idx ? { ...t, ...updates } : t,
    );
    persistCustom();
  }

  return { templates, loadTemplates, addTemplate, deleteTemplate, updateTemplate };
}
