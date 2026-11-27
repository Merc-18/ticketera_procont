export interface User {
  id: string;
  email: string;
  full_name: string;
  role: 'superadmin' | 'admin' | 'developer' | 'viewer';
  is_active: boolean;
  created_at: string;
  updated_at: string;
}


export interface Request {
  id: string;
  request_number: string;
  requester_name: string;
  requester_email?: string | null;
  requester_area: string | null;
  request_type: string;
  origin: 'Interno' | 'Externo' | 'Regulatorio' | 'Cliente' | 'Otro';
  data_system_involved?: string | null;
  description: string;
  observations?: string | null;
  request_date?: string | null;
  requested_date?: string | null;
  created_at: string;
  needs_code: boolean;
  status: 'pending' | 'approved' | 'rejected';
  rejection_reason?: string | null;
  project_id?: string;
  updated_at: string;
  studio_id?: string | null;
  system_id?: string | null;
  subsystem_id?: string | null;
  requested_subsystem_id?: string | null;
  area_id?: string | null;
  subarea_id?: string | null;
  studio_code_id?: string | null;
  classified_by?: string | null;
  classified_at?: string | null;
  request_type_id?: string | null;
  title?: string | null;
  requested_priority?: 'low' | 'medium' | 'high' | 'urgent' | null;
  urgent_requested?: boolean;
  /** Motivo visible para el solicitante (migración 20261118000500); rejection_reason queda interno. */
  public_rejection_reason?: string | null;
}

export interface Project {
  id: string;
  request_id?: string;
  title: string;
  description: string;
  project_type: 'development' | 'administrative' | 'dual';
  priority: 'low' | 'medium' | 'high' | 'urgent';
  status: 'active' | 'completed' | 'archived' | 'deleted';
  start_date?: string | null;
  /** Historical storage only. Never display or write as a ticket deadline. */
  due_date?: string | null;
  sla_target_date?: string | null;
  project_number?: string;
  is_blocked: boolean;
  blocked_reason?: string | null;
  blocked_since?: string | null;
  /** M19: Portafolio (nivel superior) e iniciativa de largo alcance; opcionales. */
  portfolio_id?: string | null;
  initiative_id?: string | null;

  created_at: string;
  updated_at: string;
  project_flows?: ProjectFlow[];
}

export interface ProjectFlow {
  id: string;
  project_id: string;
  flow_type: 'administrative' | 'development';
  assigned_to?: string | null;
  current_phase: string;
  progress: number;
  created_at: string;
  updated_at: string;
}

export interface ChecklistItem {
  id: string;
  project_flow_id: string;
  phase: string;
  description: string;
  completed: boolean;
  order_index: number;
  created_at: string;
  completed_at?: string | null;
}

export interface Comment {
  id: string;
  project_id: string;
  user_id?: string;
  content: string;
  created_at: string;
}

export interface Notification {
  id: string
  user_id: string
  type: string
  title: string
  message?: string
  project_id?: string
  read: boolean
  created_at: string
}

export interface ActivityLog {
  id: string;
  project_id: string;
  user_id?: string;
  action: string;
  details: any;
  created_at: string;
}