import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, Observable, tap } from 'rxjs';
import { environment } from '../../../environments/environment';
import { Project } from '../models/release.model';

const STORAGE_KEY = 'pioneer_current_project';

@Injectable({ providedIn: 'root' })
export class ProjectService {
  private _projects: Project[] = [];
  private _current = new BehaviorSubject<Project | null>(null);

  current$ = this._current.asObservable();

  constructor(private http: HttpClient) {}

  get current(): Project | null {
    return this._current.value;
  }

  get currentId(): string {
    return this._current.value?.id ?? 'pioneer';
  }

  get projects(): Project[] {
    return this._projects;
  }

  loadForUser(userProjectIds: string[], isAdmin: boolean): Observable<Project[]> {
    return this.http.get<Project[]>(`${environment.apiBaseUrl}/projects`).pipe(
      tap((all) => {
        this._projects = isAdmin || userProjectIds.length === 0
          ? all
          : all.filter((p) => userProjectIds.includes(p.id));

        const stored = localStorage.getItem(STORAGE_KEY);
        const preferred: Project | null = stored ? JSON.parse(stored) : null;
        const current =
          preferred && this._projects.find((p) => p.id === preferred.id)
            ? preferred
            : this._projects[0] ?? null;
        this._current.next(current);
      }),
    );
  }

  setProject(project: Project): void {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(project));
    this._current.next(project);
  }

  clear(): void {
    this._current.next(null);
    this._projects = [];
  }
}
