import { Component, Input, HostListener } from '@angular/core';
import { QueueService, QueueTrack } from 'src/app/services/queue.service';
import { ToastService } from 'src/app/services/toast.service';

@Component({
  selector: 'app-add-to-queue-button',
  template: `
    <button
      class="add-to-queue-btn"
      [class.small]="size === 'small'"
      [class.in-queue]="isInQueue"
      [disabled]="isInQueue"
      (click)="onClick($event)"
      [title]="isInQueue ? 'Already in queue' : 'Add to queue'"
    >
      <!-- Plus icon -->
      <svg
        *ngIf="!isInQueue"
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
      >
        <line x1="12" y1="5" x2="12" y2="19" />
        <line x1="5" y1="12" x2="19" y2="12" />
      </svg>
      <!-- Check icon -->
      <svg
        *ngIf="isInQueue"
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="currentColor"
      >
        <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
      </svg>
    </button>
  `,
  styles: [`
    .add-to-queue-btn {
      width: 36px;
      height: 36px;
      background: rgba(27, 220, 111, 0.1);
      border: 1px solid rgba(27, 220, 111, 0.3);
      border-radius: 50%;
      color: #1bdc6f;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: all 0.3s ease;

      &:hover:not(:disabled) {
        background: #1bdc6f;
        color: #000;
        transform: scale(1.1);
      }

      &:disabled {
        opacity: 0.7;
        cursor: default;
      }

      &.small {
        width: 28px;
        height: 28px;

        svg {
          width: 14px;
          height: 14px;
        }
      }

      &.in-queue {
        background: rgba(27, 220, 111, 0.2);
        border-color: rgba(27, 220, 111, 0.5);
      }
    }
  `]
})
export class AddToQueueButtonComponent {
  @Input() track!: QueueTrack;
  @Input() size: 'small' | 'normal' = 'normal';

  constructor(
    private queueService: QueueService,
    private toastService: ToastService
  ) {}

  get isInQueue(): boolean {
    return this.track ? this.queueService.isInQueue(this.track.id) : false;
  }

  onClick(event: Event): void {
    // CRITICAL: Stop event propagation to prevent card flip
    event.stopPropagation();
    event.preventDefault();

    if (!this.track) {
      console.error('No track provided to add-to-queue-button');
      return;
    }

    if (this.isInQueue) {
      return;
    }

    this.queueService.addToQueue(this.track);
    this.toastService.showPositiveToast(`Added "${this.track.name}" to queue`);
  }
}
