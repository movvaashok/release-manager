import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import {
  AuditLogsResponse,
  ConfigMR,
  ConfigMrsResponse,
  CreateReleaseRequest,
  GitLabProjectInfo,
  JiraStatusSummary,
  ReleaseSummary,
  ReleaseState,
  RepoReference,
  RepoWithTickets,
  UpdateDocsRequest,
} from '../models/release.model';
import { ProjectService } from './project.service';

@Injectable({ providedIn: 'root' })
export class ReleaseService {
  private base = environment.apiBaseUrl;

  constructor(private http: HttpClient, private projectService: ProjectService) {}

  private get p() {
    return { project: this.projectService.currentId };
  }

  getReferences(): Observable<RepoReference[]> {
    return this.http.get<RepoReference[]>(`${this.base}/repos/reference`, { params: this.p });
  }

  listGitLabRepos(): Observable<GitLabProjectInfo[]> {
    return this.http.get<GitLabProjectInfo[]>(`${this.base}/repos/gitlab`, { params: this.p });
  }

  listReleases(): Observable<ReleaseSummary[]> {
    return this.http.get<ReleaseSummary[]>(`${this.base}/releases`, { params: this.p });
  }

  createRelease(req: CreateReleaseRequest): Observable<ReleaseState> {
    return this.http.post<ReleaseState>(`${this.base}/releases`, req, { params: this.p });
  }

  getRelease(version: string): Observable<ReleaseState> {
    return this.http.get<ReleaseState>(`${this.base}/releases/${version}`, { params: this.p });
  }

  runStage2(version: string): Observable<ReleaseState> {
    return this.http.post<ReleaseState>(`${this.base}/releases/${version}/stage2`, {}, { params: this.p });
  }

  retryStage2Repo(version: string, repoName: string): Observable<ReleaseState> {
    return this.http.post<ReleaseState>(
      `${this.base}/releases/${version}/stage2/${encodeURIComponent(repoName)}/retry`,
      {},
      { params: this.p },
    );
  }

  diffCheckStage2(version: string): Observable<ReleaseState> {
    return this.http.post<ReleaseState>(
      `${this.base}/releases/${version}/stage2/diff-check`,
      {},
      { params: this.p },
    );
  }

  refreshPipelines(version: string): Observable<ReleaseState> {
    return this.http.post<ReleaseState>(
      `${this.base}/releases/${version}/pipelines/refresh`,
      {},
      { params: this.p },
    );
  }

  runStage3(version: string): Observable<ReleaseState> {
    return this.http.post<ReleaseState>(`${this.base}/releases/${version}/stage3`, {}, { params: this.p });
  }

  retryStage3Repo(version: string, repoName: string): Observable<ReleaseState> {
    return this.http.post<ReleaseState>(
      `${this.base}/releases/${version}/stage3/${encodeURIComponent(repoName)}/retry`,
      {},
      { params: this.p },
    );
  }

  refreshMrStatuses(version: string): Observable<ReleaseState> {
    return this.http.post<ReleaseState>(
      `${this.base}/releases/${version}/stage3/refresh-mr-status`,
      {},
      { params: this.p },
    );
  }

  getJiraStatus(version: string): Observable<JiraStatusSummary> {
    return this.http.get<JiraStatusSummary>(`${this.base}/releases/${version}/jira-status`, { params: this.p });
  }

  createRaSubtask(version: string, repoName: string): Observable<ReleaseState> {
    return this.http.post<ReleaseState>(
      `${this.base}/releases/${version}/stage3/${encodeURIComponent(repoName)}/ra-subtask`,
      {},
      { params: this.p },
    );
  }

  addRepos(version: string, repoNames: string[]): Observable<ReleaseState> {
    return this.http.post<ReleaseState>(
      `${this.base}/releases/${version}/repos`,
      { repo_names: repoNames },
      { params: this.p },
    );
  }

  addReposWithTickets(version: string, repos: RepoWithTickets[]): Observable<ReleaseState> {
    return this.http.post<ReleaseState>(
      `${this.base}/releases/${version}/repos`,
      { repo_names: repos.map(r => r.name), repos },
      { params: this.p },
    );
  }

  getConfigMrs(version: string, mainRepo: string): Observable<ConfigMrsResponse> {
    return this.http.get<ConfigMrsResponse>(
      `${this.base}/releases/${version}/config-mrs`,
      { params: { ...this.p, main_repo: mainRepo } },
    );
  }

  trackConfigMr(version: string, mr: Omit<ConfigMR, 'tracked_at'>): Observable<ConfigMR[]> {
    return this.http.post<ConfigMR[]>(
      `${this.base}/releases/${version}/config-mrs`,
      mr,
      { params: this.p },
    );
  }

  untrackConfigMr(version: string, configRepo: string, mrIid: number): Observable<ConfigMR[]> {
    return this.http.delete<ConfigMR[]>(
      `${this.base}/releases/${version}/config-mrs/${mrIid}`,
      { params: { ...this.p, config_repo: configRepo } },
    );
  }

  removeRepo(version: string, repoName: string): Observable<ReleaseState> {
    return this.http.delete<ReleaseState>(
      `${this.base}/releases/${version}/repos/${encodeURIComponent(repoName)}`,
      { params: this.p },
    );
  }

  refreshRa(version: string): Observable<ReleaseState> {
    return this.http.post<ReleaseState>(
      `${this.base}/releases/${version}/docs/refresh-ra`,
      {},
      { params: this.p },
    );
  }

  cabTicketSearch(version: string): Observable<ReleaseState> {
    return this.http.post<ReleaseState>(
      `${this.base}/releases/${version}/docs/cab-ticket-search`,
      {},
      { params: this.p },
    );
  }

  confluenceSearch(version: string): Observable<ReleaseState> {
    return this.http.post<ReleaseState>(
      `${this.base}/releases/${version}/docs/confluence-search`,
      {},
      { params: this.p },
    );
  }

  updateDocs(version: string, req: UpdateDocsRequest): Observable<ReleaseState> {
    return this.http.patch<ReleaseState>(
      `${this.base}/releases/${version}/docs`,
      req,
      { params: this.p },
    );
  }

  getAuditLogs(
    version: string,
    username?: string,
    fromTs?: string,
    toTs?: string,
  ): Observable<AuditLogsResponse> {
    const params: Record<string, string> = { ...this.p };
    if (username) params['username'] = username;
    if (fromTs) params['from_ts'] = fromTs;
    if (toTs) params['to_ts'] = toTs;
    return this.http.get<AuditLogsResponse>(
      `${this.base}/releases/${version}/audit-logs`,
      { params },
    );
  }

  deleteRelease(version: string): Observable<{ detail: string }> {
    return this.http.delete<{ detail: string }>(
      `${this.base}/releases/${version}`,
      { params: this.p },
    );
  }

  addReferenceRepo(repo: Partial<RepoReference>): Observable<RepoReference[]> {
    return this.http.post<RepoReference[]>(`${this.base}/repos/reference`, repo, { params: this.p });
  }

  updateReferenceRepo(name: string, updates: Partial<RepoReference>): Observable<RepoReference[]> {
    return this.http.put<RepoReference[]>(
      `${this.base}/repos/reference/${encodeURIComponent(name)}`,
      updates,
      { params: this.p },
    );
  }

  deleteReferenceRepo(name: string): Observable<RepoReference[]> {
    return this.http.delete<RepoReference[]>(
      `${this.base}/repos/reference/${encodeURIComponent(name)}`,
      { params: this.p },
    );
  }

  getDeploymentStatus(version: string): Observable<any> {
    return this.http.get<any>(`${this.base}/releases/${version}/deployment-status`, { params: this.p });
  }

  getPodLogs(version: string, serviceName: string): Observable<any> {
    return this.http.get<any>(`${this.base}/releases/${version}/deployment-logs/${serviceName}`, { params: this.p });
  }

  getConfigMrs(version: string): Observable<any> {
    return this.http.get<any>(`${this.base}/releases/${version}/config-mrs`, { params: this.p });
  }
}
