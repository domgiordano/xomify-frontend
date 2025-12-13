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
  @Input() trackUri?: string; // Full URI like spotify:track:xxx
  @Input() contextUri?: string; // Album/playlist URI for context playback
  @Input() size: 'small' | 'medium' | 'large' = 'medium';
  @Input() variant: 'filled' | 'outline' | 'ghost' = 'filled';
  @Input() spotifyUrl?: string; // Fallback URL

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

    // Subscribe to currently playing track AND playing state
    // Both must match for this button to show as "playing"
    this.subscriptions.push(
      this.playerService.currentTrackId$.subscribe((currentId) => {
        // Only show as playing if this track is current AND player is actually playing
        this.isPlaying =
          currentId === this.trackId && this.playerService.isCurrentlyPlaying;
      })
    );

    // Also subscribe to isPlaying$ to catch pause events
    this.subscriptions.push(
      this.playerService.isPlaying$.subscribe((playing) => {
        // Update isPlaying when play state changes
        this.isPlaying =
          this.playerService.currentTrackId === this.trackId && playing;
      })
    );

    // Subscribe to loading state
    this.subscriptions.push(
      this.playerService.isLoading$.subscribe((loading) => {
        // Only show loading if this track is the one loading
        if (this.playerService.currentTrackId === this.trackId) {
          this.isLoading = loading;
        } else {
          this.isLoading = false;
        }
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

    // If player is ready (SDK connected), use in-browser playback
    if (this.playerReady) {
      if (this.isPlaying) {
        this.playerService.stopSong();
      } else {
        // Play with context if available (for album/playlist playback)
        if (this.contextUri) {
          this.playerService.playContext(this.contextUri, this.trackId);
        } else {
          this.playerService.playSong(this.trackId);
        }
      }
    } else {
      // Fallback: Open in Spotify web player embed (not the app)
      const webPlayerUrl = `https://open.spotify.com/embed/track/${this.trackId}?utm_source=generator&theme=0`;

      // Try to open in a small popup window for in-app feel
      const popup = window.open(
        webPlayerUrl,
        'SpotifyPlayer',
        'width=400,height=160,menubar=no,toolbar=no,location=no,status=no'
      );

      // If popup blocked, fall back to regular link
      if (!popup) {
        const spotifyLink =
          this.spotifyUrl || `https://open.spotify.com/track/${this.trackId}`;
        window.open(spotifyLink, '_blank');
      }
    }
  }
}
