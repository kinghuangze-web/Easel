import { useRef, useState } from 'react';
import type { ChatSession } from '../lib/store';
import type { PersonaItem } from '../lib/api';
import type { ComponentType } from 'react';
import {
  IconChat, IconSkills, IconOutputs, IconAccounts, IconProfile,
  IconNewChat, IconEdit, IconArchive, IconUnarchive, IconTrash, IconChevron,
  IconDashboard,
} from './icons';
import { IconGear } from './settingsIcons';

export type Page = 'dashboard' | 'chat' | 'trends' | 'ideas' | 'calendar' | 'publish' | 'breakdown' | 'skills' | 'outputs' | 'accounts' | 'profile';

interface SidebarProps {
  currentPage: Page;
  onPageChange: (page: Page) => void;
  personas: PersonaItem[];
  selectedPersona: string;
  onPersonaChange: (persona: string) => void;
  onNewProfile: () => void;
  sessions: ChatSession[];
  activeSessionId: string | null;
  activeSessionHasMessages: boolean;
  onSessionSelect: (id: string) => void;
  onSessionDelete: (id: string) => void;
  onSessionRename: (id: string, title: string) => void;
  onSessionArchive: (id: string, archived: boolean) => void;
  onNewChat: () => void;
  gatewayStatus: string;
  onOpenSettings: () => void;
}

// 主导航（精简）；热点雷达/选题库/内容日历/发布中心 收进「工作台」，不占侧栏
const NAV: { page: Page; Icon: ComponentType<{ size?: number }>; label: string }[] = [
  { page: 'dashboard', Icon: IconDashboard, label: '工作台' },
  { page: 'chat', Icon: IconChat, label: '对话' },
  { page: 'skills', Icon: IconSkills, label: '技能库' },
  { page: 'outputs', Icon: IconOutputs, label: '内容库' },
  { page: 'accounts', Icon: IconAccounts, label: '账号' },
  { page: 'profile', Icon: IconProfile, label: '画像' },
];

export default function Sidebar({
  currentPage,
  onPageChange,
  personas,
  selectedPersona,
  onPersonaChange,
  onNewProfile,
  sessions,
  activeSessionId,
  activeSessionHasMessages,
  onSessionSelect,
  onSessionDelete,
  onSessionRename,
  onSessionArchive,
  onNewChat,
  gatewayStatus,
  onOpenSettings,
}: SidebarProps) {
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [showArchived, setShowArchived] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const menuButton = useRef<HTMLButtonElement>(null);
  const closeMenu = () => {
    if (!expanded) return;
    setExpanded(false);
    menuButton.current?.focus();
  };

  const startRename = (s: ChatSession) => { setRenamingId(s.id); setRenameValue(s.title); };
  const commitRename = () => {
    if (renamingId) onSessionRename(renamingId, renameValue);
    setRenamingId(null);
  };

  const active = sessions.filter((s) => !s.archived && (s.messages.length > 0 || s.id === activeSessionId));
  const archived = sessions.filter((s) => s.archived);

  const renderItem = (s: ChatSession, isArchived: boolean) => {
    if (renamingId === s.id) {
      return (
        <div key={s.id} className="session-item">
          <input
            className="session-rename-input"
            value={renameValue}
            autoFocus
            onChange={(e) => setRenameValue(e.target.value)}
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commitRename();
              else if (e.key === 'Escape') setRenamingId(null);
            }}
            onBlur={commitRename}
          />
        </div>
      );
    }
    return (
      <div
        key={s.id}
        className={`session-item ${s.id === activeSessionId ? 'active' : ''}`}
      >
        <button className="session-item-title" aria-current={s.id === activeSessionId ? 'true' : undefined}
          onClick={() => { onSessionSelect(s.id); closeMenu(); }}>{s.title}</button>
        <div className="session-actions">
          <button className="session-act" title="重命名"
            onClick={(e) => { e.stopPropagation(); startRename(s); }}><IconEdit size={14} /></button>
          <button className="session-act" title={isArchived ? '取消归档' : '归档'}
            onClick={(e) => { e.stopPropagation(); onSessionArchive(s.id, !isArchived); }}>
            {isArchived ? <IconUnarchive size={14} /> : <IconArchive size={14} />}
          </button>
          {isArchived && <button className="session-act danger" title="永久删除"
            onClick={() => onSessionDelete(s.id)}><IconTrash size={14} /></button>}
        </div>
      </div>
    );
  };

  return (
    <aside className="sidebar" onKeyDown={(event) => { if (event.key === 'Escape') closeMenu(); }}>
      <div className="sidebar-header">
        <div className="sidebar-logo">
          <img className="sidebar-logo-icon" src="./static/easel-icon-transparent.png" alt="" />
          <h1>Easel</h1>
        </div>
        <button ref={menuButton} type="button" className="btn btn-sm mobile-navigation" aria-controls="sidebar-menu"
          aria-expanded={expanded} onClick={() => setExpanded((value) => !value)}>
          {NAV.find(({ page }) => page === currentPage)?.label || '工作台'}<IconChevron size={14} />
        </button>
      </div>
      <div className="sidebar-menu" id="sidebar-menu" data-expanded={expanded}>
        {currentPage === 'chat' && <div className="persona-wrap"><select
          className="persona-select"
          value={selectedPersona}
          onChange={(e) => {
            if (e.target.value === '__new__') { onNewProfile(); return; }
            onPersonaChange(e.target.value);
          }}
          disabled={activeSessionHasMessages}
          aria-label="对话画像"
        >
          <option value="">通用模式</option>
          {personas.map((p) => (
            <option key={p.name} value={p.name}>{p.name}</option>
          ))}
          <option value="__new__">+ 新建画像…</option>
        </select>
          {activeSessionHasMessages && <small>当前画像 · 在新对话中可切换</small>}
        </div>}

      <nav className="sidebar-nav" aria-label="工作台导航">
        {NAV.map(({ page, Icon, label }) => (
          <button
            key={page}
            className={`nav-item ${currentPage === page ? 'active' : ''}`}
            aria-current={currentPage === page ? 'page' : undefined}
            onClick={() => { onPageChange(page); closeMenu(); }}
          >
            <span className="nav-icon"><Icon size={18} /></span>
            {label}
          </button>
        ))}
      </nav>

      {currentPage === 'chat' && <div className="sidebar-section">
        <div className="sidebar-section-header">
          <span className="sidebar-section-title">对话</span>
          <button className="new-chat-btn" onClick={() => { onNewChat(); closeMenu(); }} title="新建对话">
            <IconNewChat size={13} /> 新对话
          </button>
        </div>
        {active.map((s) => renderItem(s, false))}

        {archived.length > 0 && (
          <>
            <button type="button" className="archived-header" aria-expanded={showArchived} onClick={() => setShowArchived((v) => !v)}>
              <span className={`archived-chevron ${showArchived ? 'open' : ''}`}><IconChevron size={12} /></span>
              已归档 · {archived.length}
            </button>
            {showArchived && archived.map((s) => renderItem(s, true))}
          </>
        )}
      </div>}

      <div className="sidebar-status">
        <span className={`status-dot ${gatewayStatus === 'connected' ? '' : 'offline'}`} />
        {gatewayStatus === 'connected'
          ? '助手可用'
          : gatewayStatus === 'disconnected'
            ? '助手暂不可用'
            : '连接中…'}
        <button className="settings-gear" onClick={() => { closeMenu(); onOpenSettings(); }} title="设置（模型与环境）">
          <IconGear size={13} /> 设置
        </button>
      </div>
      </div>
    </aside>
  );
}
