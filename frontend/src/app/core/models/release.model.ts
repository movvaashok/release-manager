export interface RepoReference {
  name: string;
  project_id: number;
  path_with_namespace: string;
  web_url: string;
  default_branch: string;
  develop_branch: string;
}

export type Stage2Status = 'pending' | 'success' | 'conflict' | 'failed';
export type Stage3Status = 'pending' | 'success' | 'already_exists' | 'failed';

export interface Stage1Repo {
  name: string;
  project_id: number;
  path_with_namespace: string;
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
}

export interface Stage3Repo {
  name: string;
  project_id: number;
  status: Stage3Status;
  mr_url: string | null;
  mr_iid: number | null;
  already_existed: boolean;
  error: string | null;
}

export interface ReleaseState {
  version: string;
  created_at: string;
  stage1: Stage1Repo[];
  stage2: Stage2Repo[];
  stage3: Stage3Repo[];
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
}

export interface CreateReleaseRequest {
  version: string;
  repo_names: string[];
}
