import { Component, Input, OnInit, OnDestroy } from '@angular/core';
import { QueueService, QueueTrack } from 'src/app/services/queue.service';
import { ToastService } from 'src/app/services/toast.service';
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-add-to-queue-button',
  templateUrl: './add-to-queue-button.component.html',
  styleUrls: ['./add-to-queue-button.component.scss'],
})
export class AddToQueueButtonComponent implements OnInit, OnDestroy {
  @Input() track!: QueueTrack;
  @Input() size: 'small' | 'medium' = 'small';
  @Input() showLabel: boolean = false;

  isInQueue = false;

  private subscription?: Subscription;

  constructor(
    private queueService: QueueService,
    private toastService: ToastService
  ) {}

  ngOnInit(): void {
    this.subscription = this.queueService.queue$.subscribe(() => {
      this.isInQueue = this.queueService.isInQueue(this.track?.id);
    });
  }

  ngOnDestroy(): void {
    this.subscription?.unsubscribe();
  }

  toggleQueue(event: Event): void {
    event.stopPropagation();
    event.preventDefault();

    if (!this.track) return;

    if (this.isInQueue) {
      this.queueService.removeFromQueue(this.track.id);
      this.toastService.showNegativeToast(
        `Removed "${this.track.name}" from queue`
      );
    } else {
      const added = this.queueService.addToQueue(this.track);
      if (added) {
        this.toastService.showPositiveToast(
          `Added "${this.track.name}" to queue`
        );
      }
    }
  }
}
