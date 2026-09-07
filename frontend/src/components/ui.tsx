// Small reusable UI primitives — all icons use Lucide React.

import React, { useEffect } from 'react';
import { useStore } from '../lib/store';
import type { ToastMessage } from '../lib/types';

// ─── Icon ────────────────────────────────────────────────────────────────
// Re-export Lucide icons with a consistent size/stroke + className passthrough.
import {
  LayoutDashboard, Film, Plus, Library, Plug, BarChart3, Settings as SettingsIcon,
  Menu, X, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Sparkles,
  Check, CheckCircle2, AlertCircle, AlertTriangle, Info, PlusCircle, Play,
  Crown, Lock, User, Key, Eye, EyeOff, HelpCircle, Trash2, Copy, ExternalLink, Download,
  Share2, Plus as PlusIcon, ArrowRight, ArrowLeft, Search, Filter, MoreHorizontal,
  Pencil, Star, CreditCard, Users, Bell, Globe, FileText, Image, Video,
  Smartphone, Monitor, Mail, LogOut, ChevronDown, ChevronUp, Type, Layers,
  Zap, Wifi, Server, Database, Cloud, ShieldCheck, ShieldAlert, Lock as LockIcon,
  Hourglass, Activity, TrendingUp, TrendingDown, Calendar, Clock, Hash, AtSign,
  Box, Home, Briefcase, FileVideo, FileImage, FileAudio, MousePointer, Keyboard,
  Cpu, Heart, Star as StarIcon, Bookmark, Tag, BellRing, MessageSquare, Send,
  ThumbsUp, ThumbsDown, Smile, Frown, Meh, Eye as EyeIcon,
  Search as SearchIcon, AlertCircle as AlertCircleIcon,
  Loader2, type LucideIcon,
} from 'lucide-react';

export type IconName = keyof typeof ICON_MAP;

export const ICON_MAP = {
  dashboard: LayoutDashboard,
  campaigns: Film,
  plus: Plus,
  library: Library,
  integrations: Plug,
  analytics: BarChart3,
  settings: SettingsIcon,
  menu: Menu,
  close: X,
  chevronLeft: ChevronLeft,
  chevronRight: ChevronRight,
  chevronDoubleLeft: ChevronsLeft,
  chevronDoubleRight: ChevronsRight,
  sparkles: Sparkles,
  check: Check,
  checkCircle: CheckCircle2,
  alertCircle: AlertCircle,
  alertTriangle: AlertTriangle,
  info: Info,
  plusCircle: PlusCircle,
  play: Play,
  crown: Crown,
  lock: Lock,
  user: User,
  key: Key,
  eye: Eye,
  helpCircle: HelpCircle,
  eyeOff: EyeOff,
  trash: Trash2,
  copy: Copy,
  externalLink: ExternalLink,
  download: Download,
  share: Share2,
  arrowRight: ArrowRight,
  arrowLeft: ArrowLeft,
  search: Search,
  filter: Filter,
  more: MoreHorizontal,
  pencil: Pencil,
  star: Star,
  creditCard: CreditCard,
  users: Users,
  bell: Bell,
  globe: Globe,
  fileText: FileText,
  image: Image,
  video: Video,
  smartphone: Smartphone,
  monitor: Monitor,
  mail: Mail,
  logOut: LogOut,
  chevronDown: ChevronDown,
  chevronUp: ChevronUp,
  type: Type,
  layers: Layers,
  zap: Zap,
  wifi: Wifi,
  server: Server,
  database: Database,
  cloud: Cloud,
  shieldCheck: ShieldCheck,
  shieldAlert: ShieldAlert,
  hourglass: Hourglass,
  activity: Activity,
  trendingUp: TrendingUp,
  trendingDown: TrendingDown,
  calendar: Calendar,
  clock: Clock,
  hash: Hash,
  atSign: AtSign,
  box: Box,
  home: Home,
  briefcase: Briefcase,
  fileVideo: FileVideo,
  fileImage: FileImage,
  fileAudio: FileAudio,
  mousePointer: MousePointer,
  keyboard: Keyboard,
  cpu: Cpu,
  heart: Heart,
  bookmark: Bookmark,
  tag: Tag,
  bellRing: BellRing,
  messageSquare: MessageSquare,
  send: Send,
  thumbsUp: ThumbsUp,
  thumbsDown: ThumbsDown,
  smile: Smile,
  frown: Frown,
  meh: Meh,
  loader: Loader2,
} as const satisfies Record<string, LucideIcon>;

export const Icon: React.FC<{ name: IconName; size?: number; className?: string; strokeWidth?: number }> = ({
  name, size = 18, className = '', strokeWidth = 1.8,
}) => {
  const I = ICON_MAP[name];
  if (!I) return null;
  return <I size={size} strokeWidth={strokeWidth} className={className} aria-hidden="true" />;
};

// ─── Toast ──────────────────────────────────────────────────────────────
let toastCounter = 0;
const toastListeners = new Set<(t: ToastMessage) => void>();

export function toast(text: string, kind: 'success' | 'error' | 'info' = 'info', timeout = 3500) {
  const t: ToastMessage = { id: ++toastCounter, text, kind };
  toastListeners.forEach(l => l(t));
  setTimeout(() => {
    toastListeners.forEach(l => l({ ...t, _remove: true } as any));
  }, timeout);
}

export const ToastContainer: React.FC = () => {
  const [items, setItems] = React.useState<ToastMessage[]>([]);
  useEffect(() => {
    const onAdd = (t: ToastMessage) => {
      if ((t as any)._remove) {
        setItems(curr => curr.filter(x => x.id !== t.id));
      } else {
        setItems(curr => [...curr, t]);
      }
    };
    toastListeners.add(onAdd);
    return () => { toastListeners.delete(onAdd); };
  }, []);

  const kindBorder = (k: ToastMessage['kind']) => {
    if (k === 'success') return 'border-emerald-500/30';
    if (k === 'error') return 'border-rose-500/30';
    return 'border-brand-500/30';
  };
  const kindIcon = (k: ToastMessage['kind']) => {
    if (k === 'success') return 'checkCircle';
    if (k === 'error') return 'alertCircle';
    return 'info';
  };
  const kindBg = (k: ToastMessage['kind']) => {
    if (k === 'success') return 'bg-emerald-500/20 text-emerald-400';
    if (k === 'error') return 'bg-rose-500/20 text-rose-400';
    return 'bg-brand-500/20 text-brand-400';
  };

  return (
    <div className="fixed bottom-20 md:bottom-6 right-4 md:right-6 z-[100] flex flex-col gap-2 pointer-events-none">
      {items.map(t => (
        <div
          key={t.id}
          className={`toast ${kindBorder(t.kind)} bg-zinc-900 border rounded-lg px-4 py-3 shadow-2xl flex items-center gap-2 pointer-events-auto text-sm animate-slide-up`}
          style={{ minWidth: 200, maxWidth: 360 }}
        >
          <span className={`w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 ${kindBg(t.kind)}`}>
            <Icon name={kindIcon(t.kind) as IconName} size={12} strokeWidth={2.5} />
          </span>
          <span className="text-zinc-100">{t.text}</span>
        </div>
      ))}
    </div>
  );
};

// ─── Pill ───────────────────────────────────────────────────────────────
export const Pill: React.FC<{ status: string }> = ({ status }) => {
  const meta = {
    done:        { cls: 'pill-success', label: 'Done' },
    generating:  { cls: 'pill-warn',    label: 'Generating', dot: true },
    draft:       { cls: 'pill-neutral', label: 'Draft' },
    failed:      { cls: 'pill-error',   label: 'Failed' },
  }[status] || { cls: 'pill-neutral', label: status };
  return (
    <span className={`pill ${meta.cls}`}>
      {(meta as any).dot && <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />}
      {meta.label}
    </span>
  );
};

// ─── Logo ───────────────────────────────────────────────────────────────
export const Logo: React.FC<{ compact?: boolean; className?: string }> = ({ compact = false, className = '' }) => (
  <div className={`flex items-center gap-2 ${className}`}>
    <div className="w-7 h-7 rounded-lg gradient-bg flex items-center justify-center flex-shrink-0">
      <svg width="14" height="14" viewBox="0 0 20 20" fill="white" aria-hidden="true">
        <path d="M3 4h14v12H3z" opacity=".3" />
        <path d="M3 4l7 8 7-8v12H3z" />
      </svg>
    </div>
    {!compact && (
      <span className="font-semibold tracking-tight whitespace-nowrap">
        Marketing<span className="text-brand-400">Forge</span>
      </span>
    )}
  </div>
);

// ─── Modal ──────────────────────────────────────────────────────────────
export function openModal(content: React.ReactNode) {
  const overlay = document.createElement('div');
  overlay.className = 'fixed inset-0 z-[60] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in';
  const close = () => {
    overlay.style.opacity = '0';
    setTimeout(() => overlay.remove(), 200);
  };
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
  const escHandler = (e: KeyboardEvent) => {
    if (e.key === 'Escape') { close(); document.removeEventListener('keydown', escHandler); }
  };
  document.addEventListener('keydown', escHandler);
  const wrap = document.createElement('div');
  wrap.className = 'w-full max-w-3xl';
  if (content instanceof Node) wrap.appendChild(content);
  else wrap.innerHTML = String(content);
  overlay.appendChild(wrap);
  document.body.appendChild(overlay);
  return { close, overlay };
}
