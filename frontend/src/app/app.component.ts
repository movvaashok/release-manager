import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { SessionTimeoutService } from './core/services/session-timeout.service';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet],
  template: `<router-outlet></router-outlet>`,
})
export class AppComponent {
  constructor(private sessionTimeout: SessionTimeoutService) {
    this.sessionTimeout.start();
  }
}
