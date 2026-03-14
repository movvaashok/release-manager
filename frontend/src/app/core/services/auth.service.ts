import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { environment } from '../../../environments/environment';

export interface LoginRequest {
  username: string;
  password: string;
  gitlab_token?: string;
}

export interface LoginResponse {
  username: string;
  gitlab_token: string | null;
  has_token: boolean;
  role: string;
}

export interface UserSummary {
  username: string;
  role: string;
  has_token: boolean;
}

export interface CreateUserRequest {
  username: string;
  password: string;
  role: string;
}

const SESSION_KEY = 'pioneer_session';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private base = environment.apiBaseUrl;

  constructor(private http: HttpClient) {}

  login(req: LoginRequest): Observable<LoginResponse> {
    return this.http.post<LoginResponse>(`${this.base}/auth/login`, req).pipe(
      tap(res => {
        if (res.gitlab_token) {
          this.saveSession(res.username, res.gitlab_token, res.role);
        }
      })
    );
  }

  saveSession(username: string, gitlabToken: string, role: string): void {
    localStorage.setItem(SESSION_KEY, JSON.stringify({ username, gitlab_token: gitlabToken, role }));
  }

  getSession(): { username: string; gitlab_token: string; role: string } | null {
    const raw = localStorage.getItem(SESSION_KEY);
    return raw ? JSON.parse(raw) : null;
  }

  getToken(): string | null {
    return this.getSession()?.gitlab_token ?? null;
  }

  getUsername(): string | null {
    return this.getSession()?.username ?? null;
  }

  getRole(): string {
    return this.getSession()?.role ?? 'user';
  }

  isAdmin(): boolean {
    return this.getRole() === 'admin';
  }

  isLoggedIn(): boolean {
    return !!this.getSession();
  }

  logout(): void {
    localStorage.removeItem(SESSION_KEY);
  }

  getUsers(): Observable<UserSummary[]> {
    return this.http.get<UserSummary[]>(`${this.base}/auth/users`);
  }

  createUser(req: CreateUserRequest): Observable<UserSummary> {
    return this.http.post<UserSummary>(`${this.base}/auth/users`, req);
  }

  deleteUser(username: string): Observable<void> {
    return this.http.delete<void>(`${this.base}/auth/users/${username}`);
  }
}
