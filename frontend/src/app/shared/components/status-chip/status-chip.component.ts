import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatChipsModule } from '@angular/material/chips';
import { MatIconModule } from '@angular/material/icon';

type AnyStatus = 'pending' | 'success' | 'conflict' | 'failed' | 'already_exists';

@Component({
  selector: 'app-status-chip',
  standalone: true,
  imports: [CommonModule, MatChipsModule, MatIconModule],
  template: `
    <mat-chip [class]="chipClass" [disableRipple]="true">
      <mat-icon matChipAvatar>{{ icon }}</mat-icon>
      {{ label }}
    </mat-chip>
  `,
  styles: [`
    mat-chip { font-size: 12px; min-height: 24px; cursor: default; }
    mat-icon[matChipAvatar] { font-size: 14px; height: 14px; width: 14px; }
  `],
})
export class StatusChipComponent {
  @Input() status: AnyStatus = 'pending';

  get chipClass(): string {
    const map: Record<AnyStatus, string> = {
      pending: 'chip-pending',
      success: 'chip-success',
      conflict: 'chip-conflict',
      failed: 'chip-failed',
      already_exists: 'chip-already-exists',
    };
    return map[this.status] ?? 'chip-pending';
  }

  get icon(): string {
    const map: Record<AnyStatus, string> = {
      pending: 'schedule',
      success: 'check_circle',
      conflict: 'warning',
      failed: 'error',
      already_exists: 'info',
    };
    return map[this.status] ?? 'schedule';
  }

  get label(): string {
    const map: Record<AnyStatus, string> = {
      pending: 'Pending',
      success: 'Success',
      conflict: 'Conflict',
      failed: 'Failed',
      already_exists: 'Already Exists',
    };
    return map[this.status] ?? 'Pending';
  }
}
