import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, map } from 'rxjs';
import { environment } from '../../../environments/environment';
import { JiraTicket } from '../models/release.model';

@Injectable({ providedIn: 'root' })
export class JiraService {
  private base = environment.apiBaseUrl;

  constructor(private http: HttpClient) {}

  getTickets(version: string, project = 'TSSA'): Observable<JiraTicket[]> {
    return this.http
      .get<{ tickets: JiraTicket[]; total: number }>(`${this.base}/jira/tickets`, {
        params: { version, project },
      })
      .pipe(map((r) => r.tickets));
  }
}
