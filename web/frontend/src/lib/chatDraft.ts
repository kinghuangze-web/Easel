import type { UploadedFile } from './api';

export interface ChatDraft {
  input: string;
  attachments: UploadedFile[];
  uploading: boolean;
  uploadError: string;
}

export interface ReadingPosition { top: number; following: boolean }

export const EMPTY_DRAFT: ChatDraft = { input: '', attachments: [], uploading: false, uploadError: '' };

const DRAFT_KEY = 'easel_chat_drafts';

export function loadChatDrafts(): Record<string, ChatDraft> {
  try {
    const draft = JSON.parse(sessionStorage.getItem(DRAFT_KEY) || '{}') as Record<string, Pick<ChatDraft, 'input' | 'attachments'>>;
    return Object.fromEntries(Object.entries(draft).map(([id, value]) => [id, { ...EMPTY_DRAFT, ...value }]));
  } catch { return {}; }
}

export function saveChatDrafts(drafts: Record<string, ChatDraft>) {
  const saved = Object.entries(drafts).flatMap(([id, { input, attachments }]) =>
    input || attachments.length ? [[id, { input, attachments }]] : []);
  try { sessionStorage.setItem(DRAFT_KEY, JSON.stringify(Object.fromEntries(saved))); } catch { /* tab storage unavailable */ }
}
