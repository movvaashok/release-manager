import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { AuthService } from '../services/auth.service';
import { SessionTimeoutService } from '../services/session-timeout.service';

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const auth = inject(AuthService);
  const session = inject(SessionTimeoutService);

  session.resetActivity();

  const token = auth.getToken();
  if (token) {
    req = req.clone({ setHeaders: { 'X-Gitlab-Token': token } });
  }
  return next(req);
};
