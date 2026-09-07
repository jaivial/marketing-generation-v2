// Shared types for the MarketingForge SPA.

export type CampaignStatus = 'done' | 'generating' | 'draft' | 'failed';

export interface CampaignPlan {
  hook: string;
  tagline: string;
  cta: string;
  audience: string;
  tone: string;
}

export interface Frame {
  i: number;
  t: number | string;
  url: string | null;
}

export interface Campaign {
  id: string;
  name: string;
  duration_s: number;
  status: CampaignStatus;
  created_at: number;
  color: string;
  source: string;
  source_kind?: 'url' | 'files';
  style?: string;
  plan?: CampaignPlan | null;
  script?: string;
  videoUrl?: string | null;
  frames?: Frame[];
}

export interface User {
  name: string;
  email: string;
  plan: string;
  usage: number;
  limit: number;
  avatar: string;
}

export interface SseEvent {
  event: 'plan' | 'frame' | 'script' | 'video' | 'done' | 'error';
  data: any;
}

export type DrawerState = 'open' | 'closed';
export type SidebarState = 'expanded' | 'collapsed';

export interface ToastMessage {
  id: number;
  kind: 'success' | 'error' | 'info';
  text: string;
}
