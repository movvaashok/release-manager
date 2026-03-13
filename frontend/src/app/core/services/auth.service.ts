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
          this.saveSession(res.username, res.gitlab_token);
        }
      })
    );
  }

  saveSession(username: string, gitlabToken: string): void {
    localStorage.setItem(SESSION_KEY, JSON.stringify({ username, gitlab_token: gitlabToken }));
  }

  getSession(): { username: string; gitlab_token: string } | null {
    const raw = localStorage.getItem(SESSION_KEY);
    return raw ? JSON.parse(raw) : null;
  }

  getToken(): string | null {
    return this.getSession()?.gitlab_token ?? null;
  }

  getUsername(): string | null {
    return this.getSession()?.username ?? null;
  }

  isLoggedIn(): boolean {
    return !!this.getSession();
  }

  logout(): void {
    localStorage.removeItem(SESSION_KEY);
  }
}
