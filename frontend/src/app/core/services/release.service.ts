import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import {
  CreateReleaseRequest,
  ReleaseSummary,
  ReleaseState,
  RepoReference,
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

  addRepos(version: string, repoNames: string[]): Observable<ReleaseState> {
    return this.http.post<ReleaseState>(
      `${this.base}/releases/${version}/repos`,
      { repo_names: repoNames },
      { params: this.p },
    );
  }

  removeRepo(version: string, repoName: string): Observable<ReleaseState> {
    return this.http.delete<ReleaseState>(
      `${this.base}/releases/${version}/repos/${encodeURIComponent(repoName)}`,
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
}
