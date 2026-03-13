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

@Injectable({ providedIn: 'root' })
export class ReleaseService {
  private base = environment.apiBaseUrl;

  constructor(private http: HttpClient) {}

  getReferences(): Observable<RepoReference[]> {
    return this.http.get<RepoReference[]>(`${this.base}/repos/reference`);
  }

  listReleases(): Observable<ReleaseSummary[]> {
    return this.http.get<ReleaseSummary[]>(`${this.base}/releases`);
  }

  createRelease(req: CreateReleaseRequest): Observable<ReleaseState> {
    return this.http.post<ReleaseState>(`${this.base}/releases`, req);
  }

  getRelease(version: string): Observable<ReleaseState> {
    return this.http.get<ReleaseState>(`${this.base}/releases/${version}`);
  }

  runStage2(version: string): Observable<ReleaseState> {
    return this.http.post<ReleaseState>(`${this.base}/releases/${version}/stage2`, {});
  }

  retryStage2Repo(version: string, repoName: string): Observable<ReleaseState> {
    return this.http.post<ReleaseState>(
      `${this.base}/releases/${version}/stage2/${encodeURIComponent(repoName)}/retry`,
      {}
    );
  }

  runStage3(version: string): Observable<ReleaseState> {
    return this.http.post<ReleaseState>(`${this.base}/releases/${version}/stage3`, {});
  }

  retryStage3Repo(version: string, repoName: string): Observable<ReleaseState> {
    return this.http.post<ReleaseState>(
      `${this.base}/releases/${version}/stage3/${encodeURIComponent(repoName)}/retry`,
      {}
    );
  }

  addRepos(version: string, repoNames: string[]): Observable<ReleaseState> {
    return this.http.post<ReleaseState>(`${this.base}/releases/${version}/repos`, { repo_names: repoNames });
  }
}
