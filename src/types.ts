export type SessionScope = 'private' | 'group' | 'scheduled';
export type TaskStatus = 'pending' | 'processing' | 'done' | 'failed';
export type Platform = 'discord';
export type ResumePolicy = 'sticky' | 'fresh';

export interface BotConfig {
  id: string;
  platform: Platform;
  agentId: string;
  tokenEnv: string;
}

export interface AgentProfile {
  id: string;
  name: string;
  runtime: 'claude';
  model?: string;
  env?: Record<string, string>;
  skill_mode: 'allowlist';
  allowed_tools?: string[];
  disallowed_tools?: string[];
}

export interface AgentDefinition {
  profile: AgentProfile;
  rootDir: string;
  promptPath: string;
  promptText: string;
  skillsDir: string;
}

export interface DeliveryTarget {
  kind: 'discord';
  channelId: string;
  userId: string;
  mentionUser: boolean;
}

export interface ChatIngressEvent {
  source: 'discord';
  platform: Platform;
  botId: string;
  agentId: string;
  scope: Extract<SessionScope, 'private' | 'group'>;
  userId: string;
  username: string;
  groupId: string;
  channelId: string;
  messageId: string;
  content: string;
  deliveryTarget: DeliveryTarget;
}

export interface ScheduledTriggerEvent {
  source: 'scheduler';
  platform: Platform;
  botId: string;
  agentId: string;
  scope: 'scheduled';
  scheduleId: string;
  userId: string;
  groupId: string;
  channelId: string;
  content: string;
  deliveryTarget: DeliveryTarget;
  resumePolicy: ResumePolicy;
}

export type IngressEvent = ChatIngressEvent | ScheduledTriggerEvent;

export interface SessionResolution {
  sessionKey: string;
  sessionDir: string;
  workspaceDir: string;
  homeDir: string;
  scope: SessionScope;
}

export interface TaskRecord {
  taskId: string;
  platform: Platform;
  botId: string;
  agentId: string;
  sessionKey: string;
  sessionScope: SessionScope;
  userId: string;
  groupId: string;
  channelId: string;
  deliveryTarget: DeliveryTarget;
  status: TaskStatus;
  mergedCount: number;
  createdAt: Date;
  startedAt: Date | null;
  finishedAt: Date | null;
  lastError: string;
}

export interface TaskPartRecord {
  partId: string;
  taskId: string;
  authorId: string;
  sourceMessageId: string;
  content: string;
  createdAt: Date;
}

export interface SessionBinding {
  sessionKey: string;
  platform: Platform;
  botId: string;
  agentId: string;
  sessionScope: SessionScope;
  userId: string;
  groupId: string;
  channelId: string;
  workspaceDir: string;
  homeDir: string;
  runtimeSessionId: string;
  updatedAt: Date;
}

export interface GroupMessageRecord {
  platform: Platform;
  botId: string;
  groupId: string;
  channelId: string;
  userId: string;
  messageId: string;
  content: string;
  createdAt: Date;
}

export interface DueSchedule {
  scheduleId: string;
  platform: Platform;
  botId: string;
  agentId: string;
  ownerUserId: string;
  deliveryTarget: DeliveryTarget;
  content: string;
  resumePolicy: ResumePolicy;
  nextRunAt: Date;
  intervalSeconds: number | null;
}

export interface TaskIngestResult {
  taskId: string;
  merged: boolean;
  ackText: string;
  shouldAck: boolean;
}
