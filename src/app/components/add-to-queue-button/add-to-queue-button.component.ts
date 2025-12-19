import { Component, Input, HostListener } from '@angular/core';
import { QueueService, QueueTrack } from 'src/app/services/queue.service';
import { ToastService } from 'src/app/services/toast.service';

@Component({
  selector: 'app-add-to-queue-button',
  templateUrl: './add-to-queue-button.component.html',
  styleUrls: ['./add-to-queue-button.component.scss']
})
export class AddToQueueButtonComponent {
  @Input() track!: QueueTrack;
  @Input() size: 'small' | 'medium' | 'large' = 'small';

  constructor(
    private queueService: QueueService,
    private toastService: ToastService
  ) {}

  get isInQueue(): boolean {
    return this.track ? this.queueService.isInQueue(this.track.id) : false;
  }

  // Capture click on the host element itself to prevent bubbling
  @HostListener('click', ['$event'])
  onHostClick(event: Event): void {
    event.stopPropagation();
    event.preventDefault();
  }

  toggleQueue(event: Event): void {
    // CRITICAL: Stop propagation to prevent parent click handlers (card flip, navigation)
    event.stopPropagation();
    event.preventDefault();

    if (!this.track) {
      console.warn('AddToQueueButton: No track provided');
      return;
    }

    if (this.isInQueue) {
      this.queueService.removeFromQueue(this.track.id);
      this.toastService.showPositiveToast(`Removed "${this.track.name}" from queue`);
    } else {
      this.queueService.addToQueue(this.track);
      this.toastService.showPositiveToast(`Added "${this.track.name}" to queue`);
    }
  }
}
