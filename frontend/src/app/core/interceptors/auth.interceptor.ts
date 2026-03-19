import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { AuthService } from '../services/auth.service';
import { SessionTimeoutService } from '../services/session-timeout.service';

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const auth = inject(AuthService);
  const session = inject(SessionTimeoutService);

  session.resetActivity();

  const token = auth.getToken();
  const username = auth.getUsername();
  const role = auth.getRole();
  const headers: Record<string, string> = {};
  if (token) headers['X-Gitlab-Token'] = token;
  if (username) headers['X-Username'] = username;
  if (role) headers['X-Role'] = role;
  if (Object.keys(headers).length) {
    req = req.clone({ setHeaders: headers });
  }
  return next(req);
};
