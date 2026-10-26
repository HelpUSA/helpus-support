export type TicketCategory = 'bug' | 'feature' | 'question' | 'support' | 'billing';
export type TicketPriority = 'low' | 'medium' | 'high' | 'urgent';
export type TicketStatus = 'pending_approval' | 'new' | 'in_progress' | 'in_production' | 'waiting_client' | 'in_testing' | 'resolved' | 'rejected' | 'closed';

export type TicketEventType =
  | 'ticket_created'
  | 'master_approved'
  | 'production_step'
  | 'deployment_ready'
  | 'ticket_resolved'
  | 'ticket_reopened_by_client'
  | 'ticket_reset_by_master'
  | 'ticket_rejected'
  | 'ticket_cancelled';

export interface TicketEvent {
  id: string; // eventId
  ticketId: string;
  tenantId?: string; // cryptographically bound by computeEventPayload if present
  type: TicketEventType;
  actorEmail: string;
  actorRole: 'master_superadmin' | 'superadmin' | 'tenant_admin' | 'client' | 'system_pipeline';
  authorized: boolean;
  progressPercentage: number;
  status: TicketStatus;
  note?: string;
  metadata?: Record<string, any>;
  timestamp: string; // ISO 8601
  seq?: number;
  idempotencyKey?: string;
  signature?: string; // Assinatura HMAC de proveniência do servidor
}

export interface Tenant {
  id: string;
  name: string;
  slug: string;
  domain: string;
  primaryColor?: string;
  apiKey: string;
  createdAt: string;
}

export interface Attachment {
  id: string;
  name: string;
  url: string;
  type: string;
  size: number;
}

export interface Message {
  id: string;
  ticketId: string;
  senderId: string;
  senderName: string;
  senderEmail?: string;
  senderRole: 'client' | 'agent' | 'system';
  isInternalNote: boolean;
  content: string;
  attachments?: Attachment[];
  createdAt: string;
}

export interface TicketContext {
  url?: string;
  userEmail?: string;
  userName?: string;
  userAgent?: string;
  os?: string;
  screen?: string;
  extraMeta?: Record<string, any>;
}

export interface Ticket {
  aiBridgeOrchestrated?: boolean;
  id: string;
  tenantId: string;
  tenantName: string;
  code: string; // ex: PUB-101
  title: string;
  description: string;
  category: TicketCategory;
  priority: TicketPriority;
  status: TicketStatus;
  createdByEmail: string;
  createdByName: string;
  assignedTo?: string;
  contextData?: TicketContext;
  attachments?: Attachment[];
  messages: Message[];
  createdAt: string;
  updatedAt: string;
  slaDeadline?: string;
  cancellationReason?: string;
  adminNotes?: string;
  progressPercentage?: number; // 0 to 100
  progressStep?: string; // Current step description
  reopenedAt?: string;
  solutionCommitSha?: string;
  events?: TicketEvent[];
}
