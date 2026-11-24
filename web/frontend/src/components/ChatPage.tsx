import { useState, useRef, useEffect } from 'react';
import MessageBubble from './MessageBubble';
import QuestionCards from './QuestionCards';
import BrushEntry from './BrushEntry';
import type { ChatSession, ChatMessage, StreamState } from '../lib/store';
import { uploadFiles, adoptOversize } from '../lib/api';
import type { UploadedFile } from '../lib/api';
import { EMPTY_DRAFT } from '../lib/chatDraft';
import type { ChatDraft, ReadingPosition } from '../lib/chatDraft';
import { IconArrowUp, IconStop, IconPlus, IconFile } from './icons';

interface ChatPageProps {
  session: ChatSession;
  draft: ChatDraft;
  readingPositions: Map<string, ReadingPosition>;
  onDraftChange: (update: (draft: ChatDraft) => ChatDraft) => void;
  stream?: StreamState;          // 进行中的流式态（来自 App，切页也不丢）
  onSend: (displayText: string, attachments?: UploadedFile[]) => void;
  onStop: () => void;
  onResend: (
    userIndex: number,
    displayText: string,
    attachments?: UploadedFile[],
    legacyAgentText?: string,
  ) => void; // 重试：仅对最后一轮
  onQuestionAnswered?: (questionId: string) => void;   // 某道问答题提交成功（App 记录答过，重放不再出现）
}

// 空态推荐（贴合 Easel 社媒创作场景）
const SUGGESTIONS = [
  { icon: '🔥', title: '蹭个热点', prompt: '看看现在微博和抖音有什么热搜，挑几个适合我做二创的选题' },
  { icon: '✍️', title: '写小红书文案', prompt: '帮我写一条小红书种草文案，主题先问我' },
  { icon: '🎴', title: '做金句卡片', prompt: '把一句走心的话做成一张适合发朋友圈的金句卡片' },
  { icon: '🎬', title: '口播脚本', prompt: '帮我写一条 60 秒的口播短视频脚本，主题先问我' },
];

function greeting(): string {
  const h = new Date().getHours();
  const g = h < 6 ? '夜深了' : h < 12 ? '上午好' : h < 14 ? '中午好' : h < 18 ? '下午好' : '晚上好';
  return `${g}，想创作点什么？`;
}

export default function ChatPage({ session, draft, readingPositions, onDraftChange, stream, onSend, onStop, onResend, onQuestionAnswered }: ChatPageProps) {
  const { input, attachments, uploading, uploadError } = draft;
  const setInput = (value: string) => onDraftChange((d) => ({ ...d, input: value }));
  const [dragOver, setDragOver] = useState(false);
  const [maxMb, setMaxMb] = useState(50);
  const messagesRef = useRef<HTMLDivElement>(null);
  const threadRef = useRef<HTMLDivElement>(null);
  const following = useRef(readingPositions.get(session.id)?.following ?? true);
  const lastScrollTop = useRef(readingPositions.get(session.id)?.top ?? 0);
  const [showLatest, setShowLatest] = useState(!following.current);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isStreaming = !!stream;
  const isEmpty = session.messages.length === 0 && !isStreaming;

  useEffect(() => {
    fetch('/api/upload/limits').then((r) => r.json())
      .then((d) => { if (d?.max_mb) setMaxMb(d.max_mb); }).catch(() => {});
  }, []);

  const doUpload = async (fs: FileList | File[]) => {
    const arr = Array.from(fs);
    if (!arr.length || uploading || isStreaming) return;
    const cap = maxMb * 1024 * 1024;
    const big = arr.filter((f) => f.size > cap);
    const small = arr.filter((f) => f.size <= cap);

    onDraftChange((d) => ({ ...d, uploading: true, uploadError: '' }));
    const results = await Promise.allSettled([
      big.length ? adoptOversize(big, session.id) : [],
      small.length ? uploadFiles(small, session.id) : [],
    ]);
    const saved = results.flatMap((result) => result.status === 'fulfilled' ? result.value : []);
    const failed = results.flatMap((result, i) => result.status === 'rejected' ? (i === 0 ? big : small) : []);
    onDraftChange((d) => ({
      ...d, uploading: false, attachments: [...d.attachments, ...saved],
      uploadError: failed.length ? `${failed.map((file) => file.name).join('、')} 未能添加，请重新选择。` : '',
    }));
  };
  const onDrop = (e: React.DragEvent) => {
    e.preventDefault(); setDragOver(false);
    if (e.dataTransfer.files?.length) doUpload(e.dataTransfer.files);
  };
  const onPaste = (e: React.ClipboardEvent) => {
    if (e.clipboardData.files?.length) { e.preventDefault(); doUpload(e.clipboardData.files); }
  };
  const removeAttachment = (path: string) => onDraftChange((d) => ({
    ...d, attachments: d.attachments.filter((x) => x.path !== path),
  }));

  useEffect(() => {
    const box = messagesRef.current;
    const thread = threadRef.current;
    if (!box || !thread) return;
    const savedPosition = readingPositions.get(session.id);
    box.scrollTop = following.current ? box.scrollHeight : (savedPosition?.top ?? 0);
    lastScrollTop.current = box.scrollTop;
    const resize = new ResizeObserver(() => {
      if (!following.current) return;
      box.scrollTop = box.scrollHeight;
      lastScrollTop.current = box.scrollTop;
    });
    resize.observe(thread);
    resize.observe(box);
    return () => resize.disconnect();
  }, [isEmpty, readingPositions, session.id]);

  const onMessageScroll = () => {
    const box = messagesRef.current;
    if (!box) return;
    const top = box.scrollTop;
    const nearEnd = box.scrollHeight - box.clientHeight - top <= 32;
    // A scroll event from an earlier stick-to-end can arrive after a reply grows.
    following.current = nearEnd || (following.current && top >= lastScrollTop.current - 1);
    lastScrollTop.current = top;
    readingPositions.set(session.id, { top, following: following.current });
    setShowLatest(!following.current);
  };

  const jumpToLatest = () => {
    const box = messagesRef.current;
    following.current = true;
    setShowLatest(false);
    if (box) {
      box.scrollTop = box.scrollHeight;
      lastScrollTop.current = box.scrollTop;
      readingPositions.set(session.id, { top: box.scrollTop, following: true });
    }
  };

  useEffect(() => {
    const el = textareaRef.current;
    if (el) {
      el.style.height = 'auto';
      el.style.height = Math.min(el.scrollHeight, 180) + 'px';
    }
  }, [input]);

  const handleSend = () => {
    const trimmed = input.trim();
    if ((!trimmed && attachments.length === 0) || isStreaming || uploading) return;
    // 附件通过结构化字段发送；用户消息气泡只显示用户实际输入的文字。
    onSend(trimmed, attachments);
    onDraftChange(() => EMPTY_DRAFT);
    jumpToLatest();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing && e.keyCode !== 229) {
      e.preventDefault();
      handleSend();
    }
  };

  const inputBox = (hero: boolean) => (
    <div className={`composer ${hero ? 'composer-hero' : ''} ${dragOver ? 'composer-drag' : ''}`}
      onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={(e) => { e.preventDefault(); setDragOver(false); }}
      onDrop={onDrop}>
      {attachments.length > 0 && (
        <div className="composer-attachments">
          {attachments.map((a) => (
            <span key={a.path} className="attach-chip" title={a.path}>
              <IconFile size={12} /> <span className="attach-name">{a.name}</span>
              <button className="attach-x" onClick={() => removeAttachment(a.path)} title="移除">×</button>
            </span>
          ))}
        </div>
      )}
      <div className="composer-top">
        <BrushEntry onPick={(t) => { setInput(t); requestAnimationFrame(() => textareaRef.current?.focus()); }} />
        <textarea
          ref={textareaRef}
          className="chat-input"
          placeholder={dragOver ? '松手上传素材…' : hero ? '把你的想法告诉我，选题 / 文案 / 卡片 / 视频 / 发布都行…（可拖入图片/文档当素材）' : '发消息…（Enter 发送，Shift+Enter 换行，可拖入/粘贴素材）'}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          onPaste={onPaste}
          rows={1}
          autoFocus={hero}
        />
      </div>
      <input ref={fileInputRef} type="file" multiple hidden
        onChange={(e) => { if (e.target.files) doUpload(e.target.files); e.target.value = ''; }} />
      {uploadError && <p className="composer-error" role="alert">{uploadError}</p>}
      <div className="composer-bar">
        <button className="composer-attach-btn" onClick={() => fileInputRef.current?.click()}
          disabled={isStreaming || uploading} title={`添加素材（图片/文档）；超过 ${maxMb}MB 的大文件将自动存为本地素材（不走上传）`}>
          <IconPlus size={15} /> {uploading ? '上传中…' : '素材'}
        </button>
        <span className="composer-hint">{isStreaming ? '生成中…' : 'Enter 发送 · Shift+Enter 换行'}</span>
        {isStreaming ? (
          <button className="send-btn" onClick={onStop} title="停止生成"><IconStop size={15} /></button>
        ) : (
          <button className="send-btn" onClick={handleSend} disabled={(!input.trim() && !attachments.length) || uploading} title="发送"><IconArrowUp size={17} /></button>
        )}
      </div>
    </div>
  );

  // ---- 空态：居中欢迎页 ----
  if (isEmpty) {
    return (
      <div className="chat-page">
        <div className="chat-hero">
          <div className="chat-hero-brand">
            <img src="./static/easel-icon-transparent.png" alt="" />
            <span>Easel</span>
          </div>
          <h1 className="chat-hero-title">{greeting()}</h1>
          <p className="chat-hero-sub">从选题到发布，一站式帮你把想法做成能发的内容。</p>
          {inputBox(true)}
          <div className="suggestions">
            {SUGGESTIONS.map((s) => (
              <button key={s.title} className="card card-hover suggestion-card"
                onClick={() => { if (!isStreaming) onSend(s.prompt); }}>
                <span className="suggestion-icon">{s.icon}</span>
                <span className="suggestion-body">
                  <span className="suggestion-title">{s.title}</span>
                  <span className="suggestion-text">{s.prompt}</span>
                </span>
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // ---- 对话态 ----
  const displayMessages: ChatMessage[] = [...session.messages];
  if (isStreaming) displayMessages.push({ role: 'assistant', content: stream!.content || '' });

  return (
    <div className="chat-page">
      <div className="chat-messages" ref={messagesRef} onScroll={onMessageScroll}>
        <div className="chat-thread" ref={threadRef}>
          {displayMessages.map((msg, i) => {
            const isLast = i === displayMessages.length - 1;
            const live = isStreaming && isLast && msg.role === 'assistant';
            const isFinal = !live && i < session.messages.length;
            let actions;
            if (isFinal) {
              const copy = () => navigator.clipboard?.writeText(msg.content);
              // 只允许对「最后一轮」重试，契合 OpenClaw append-only 模型（不改写历史）；已移除编辑
              const isLastFinal = i === session.messages.length - 1;
              if (msg.role === 'user') {
                actions = {
                  onCopy: copy,
                  onRetry: isLastFinal
                    ? () => onResend(i, msg.content, msg.attachments, msg.agentContent)
                    : undefined,
                  canModify: !isStreaming,
                };
              } else {
                const pi = i - 1;
                const prevUser = pi >= 0 && session.messages[pi]?.role === 'user' ? session.messages[pi] : null;
                actions = {
                  onCopy: copy,
                  onRetry: (isLastFinal && prevUser)
                    ? () => onResend(pi, prevUser.content, prevUser.attachments, prevUser.agentContent)
                    : undefined,
                  canModify: !isStreaming,
                };
              }
            }
            return (
              <MessageBubble
                key={`${i}-${msg.role}`}
                message={msg}
                isStreaming={live}
                thinking={live ? stream!.thinking : ''}
                activity={live ? stream!.activity : ''}
                stillWorking={live ? stream!.stillWorking : ''}
                actions={actions}
              />
            );
          })}
          {isStreaming && (stream!.questions?.length ?? 0) > 0 && (
            <QuestionCards questions={stream!.questions || []} onDone={(qid) => onQuestionAnswered?.(qid)} />
          )}
        </div>
      </div>

      <div className="chat-input-area">
        {showLatest && <button className="btn btn-sm chat-latest" onClick={jumpToLatest}>回到最新消息</button>}
        <div className="chat-input-inner">{inputBox(false)}</div>
      </div>
    </div>
  );
}
