export interface RepoReference {
  name: string;
  project_id: number;
  path_with_namespace: string;
  web_url: string;
  default_branch: string;
  develop_branch: string;
  config_repo?: string | null;  // name of the linked config repository
}

export type Stage2Status = 'pending' | 'success' | 'conflict' | 'failed';
export type Stage3Status = 'pending' | 'success' | 'already_exists' | 'failed';

export interface Stage1Repo {
  name: string;
  project_id: number;
  path_with_namespace: string;
  web_url?: string;
  jira_tickets: string[];
}

export interface Stage2Repo {
  name: string;
  project_id: number;
  status: Stage2Status;
  branch_created: boolean;
  branch_existed: boolean;
  merged: boolean;
  no_updates: boolean;
  error: string | null;
  pipeline_status: string | null;
  pipeline_url: string | null;
  has_new_commits: boolean | null;
  commits_ahead: number | null;
  compare_url: string | null;
  config_branches: string[];
  config_branch_error: string | null;
}

export interface Stage3Repo {
  name: string;
  project_id: number;
  status: Stage3Status;
  mr_url: string | null;
  mr_iid: number | null;
  already_existed: boolean;
  error: string | null;
  pipeline_status: string | null;
  pipeline_url: string | null;
  requires_ra: boolean;
  config_repo: string | null;          // linked config repo name (from repo registry)
  config_repo_in_release: boolean;     // true when config repo is already in this release
  config_branches: string[];
  config_branch_error: string | null;
}

export interface ReleaseState {
  version: string;
  created_at: string;
  stage1: Stage1Repo[];
  stage2: Stage2Repo[];
  stage3: Stage3Repo[];
  // Documentation
  cab_date: string | null;
  cab_ticket_url: string | null;
  confluence_url: string | null;
  risk_assessment_url: string | null;
}

export interface ReleaseSummary {
  version: string;
  created_at: string;
  total_repos: number;
  stage2_success: number;
  stage2_conflict: number;
  stage2_failed: number;
  stage2_pending: number;
  stage3_success: number;
  stage3_already_exists: number;
  stage3_failed: number;
  stage3_pending: number;
  // Documentation links
  cab_date: string | null;
  cab_ticket_url: string | null;
  confluence_url: string | null;
  risk_assessment_url: string | null;
}

export interface CreateReleaseRequest {
  version: string;
  repo_names: string[];
  cab_date?: string | null;
  cab_ticket_url?: string | null;
}

export interface UpdateDocsRequest {
  confluence_url?: string | null;
  risk_assessment_url?: string | null;
  cab_date?: string | null;
  cab_ticket_url?: string | null;
}

export interface Project {
  id: string;
  display_name: string;
  jira_project_key: string;
}

export interface AuditLog {
  id: string;
  timestamp: string;
  username: string;
  action: string;
  project: string;
  release_version: string;
  repo_name: string | null;
  details: Record<string, unknown>;
}

export interface AuditLogsResponse {
  logs: AuditLog[];
  users: string[];
}

export interface JiraTicket {
  key: string;
  summary: string;
  status: string;
  issue_type: string;
  priority?: string;
  components: string[];
  url?: string;
}

export interface RepoWithTickets {
  name: string;
  jira_tickets: string[];
}

export interface ConfigMR {
  main_repo: string;
  config_repo: string;
  mr_iid: number;
  mr_url: string;
  title: string;
  source_branch: string;
  target_branch: string;
  state: string;
  tracked_at: string;
}

export interface OpenMR {
  mr_iid: number;
  mr_url: string;
  title: string;
  source_branch: string;
  target_branch: string;
  state: string;
  author: string;
}

export interface ConfigMrsResponse {
  tracked: ConfigMR[];
  open_mrs: OpenMR[];
}
