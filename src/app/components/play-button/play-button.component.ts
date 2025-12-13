import {
  Component,
  Input,
  OnInit,
  OnDestroy,
  Output,
  EventEmitter,
} from '@angular/core';
import { PlayerService } from 'src/app/services/player.service';
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-play-button',
  templateUrl: './play-button.component.html',
  styleUrls: ['./play-button.component.scss'],
})
export class PlayButtonComponent implements OnInit, OnDestroy {
  @Input() trackId!: string;
  @Input() size: 'small' | 'medium' | 'large' = 'medium';
  @Input() variant: 'filled' | 'outline' | 'ghost' = 'filled';
  @Input() spotifyUrl?: string; // Optional fallback URL

  @Output() playClicked = new EventEmitter<string>();

  isPlaying = false;
  isLoading = false;
  playerReady = false;

  private subscriptions: Subscription[] = [];

  constructor(private playerService: PlayerService) {}

  ngOnInit(): void {
    // Subscribe to player ready state
    this.subscriptions.push(
      this.playerService.playerReady$.subscribe((ready) => {
        this.playerReady = ready;
      })
    );

    // Subscribe to currently playing track
    this.subscriptions.push(
      this.playerService.currentTrackId$.subscribe((currentId) => {
        this.isPlaying = currentId === this.trackId;
      })
    );

    // Subscribe to loading state
    this.subscriptions.push(
      this.playerService.isLoading$.subscribe((loading) => {
        this.isLoading = loading && this.isPlaying;
      })
    );
  }

  ngOnDestroy(): void {
    this.subscriptions.forEach((sub) => sub.unsubscribe());
  }

  togglePlay(event: Event): void {
    event.stopPropagation();
    event.preventDefault();

    // Emit event for parent components
    this.playClicked.emit(this.trackId);

    // If player is ready, use SDK
    if (this.playerReady) {
      if (this.isPlaying) {
        this.playerService.stopSong();
      } else {
        this.playerService.playSong(this.trackId);
      }
    } else {
      // Fallback: Open in Spotify
      const spotifyLink =
        this.spotifyUrl || `https://open.spotify.com/track/${this.trackId}`;
      window.open(spotifyLink, '_blank');
    }
  }
}
