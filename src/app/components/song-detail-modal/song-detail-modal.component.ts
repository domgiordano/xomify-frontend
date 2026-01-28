import { Component, OnInit, OnDestroy } from '@angular/core';
import { Router } from '@angular/router';
import { Subscription } from 'rxjs';
import { take } from 'rxjs/operators';
import { RatingsService, FriendRating } from 'src/app/services/ratings.service';
import { UserService } from 'src/app/services/user.service';
import { PlayerService } from 'src/app/services/player.service';
import { QueueService, QueueTrack } from 'src/app/services/queue.service';
import { ToastService } from 'src/app/services/toast.service';

export interface SongDetailTrack {
  id: string;
  name: string;
  artists: { id: string; name: string }[];
  album: {
    id: string;
    name: string;
    images: { url: string }[];
    release_date?: string;
  };
  duration_ms?: number;
  popularity?: number;
  explicit?: boolean;
  external_urls?: { spotify: string };
}

@Component({
  selector: 'app-song-detail-modal',
  templateUrl: './song-detail-modal.component.html',
  styleUrls: ['./song-detail-modal.component.scss'],
})
export class SongDetailModalComponent implements OnInit, OnDestroy {
  private subscriptions: Subscription[] = [];

  isVisible = false;
  track: SongDetailTrack | null = null;
  currentEmail = '';

  // Rating state
  userRating = 0;
  loadingRating = false;
  savingRating = false;

  // Friends ratings
  friendsRatings: FriendRating[] = [];
  loadingFriendsRatings = false;

  // Playing state
  isPlaying = false;

  constructor(
    private ratingsService: RatingsService,
    private userService: UserService,
    private playerService: PlayerService,
    private queueService: QueueService,
    private toastService: ToastService,
    private router: Router
  ) {}

  ngOnInit(): void {
    this.currentEmail = this.userService.getEmail();

    // Subscribe to currently playing track
    this.subscriptions.push(
      this.playerService.currentTrackId$.subscribe((currentId) => {
        this.isPlaying =
          this.track?.id === currentId && this.playerService.isCurrentlyPlaying;
      })
    );

    this.subscriptions.push(
      this.playerService.isPlaying$.subscribe((playing) => {
        this.isPlaying =
          this.track?.id === this.playerService.currentTrackId && playing;
      })
    );
  }

  ngOnDestroy(): void {
    this.subscriptions.forEach((sub) => sub.unsubscribe());
  }

  open(track: SongDetailTrack): void {
    this.track = track;
    this.isVisible = true;
    this.userRating = this.ratingsService.getCachedRating(track.id);
    this.loadFriendsRatings();
    document.body.classList.add('modal-open');
  }

  close(): void {
    this.isVisible = false;
    this.track = null;
    this.friendsRatings = [];
    document.body.classList.remove('modal-open');
  }

  onBackdropClick(event: MouseEvent): void {
    if ((event.target as HTMLElement).classList.contains('modal-backdrop')) {
      this.close();
    }
  }

  loadFriendsRatings(): void {
    if (!this.track) return;

    this.loadingFriendsRatings = true;
    this.ratingsService
      .getFriendsRatings(this.currentEmail, this.track.id)
      .pipe(take(1))
      .subscribe({
        next: (ratings) => {
          this.friendsRatings = ratings;
          this.loadingFriendsRatings = false;
        },
        error: () => {
          this.loadingFriendsRatings = false;
        },
      });
  }

  onRatingChange(rating: number): void {
    if (!this.track || this.savingRating) return;

    this.savingRating = true;
    const previousRating = this.userRating;
    this.userRating = rating;

    this.ratingsService
      .rateTrack(
        this.currentEmail,
        this.track.id,
        rating,
        this.track.name,
        this.getArtistNames(this.track.artists),
        this.track.album?.images?.[0]?.url,
        this.track.album?.id
      )
      .pipe(take(1))
      .subscribe({
        next: () => {
          this.toastService.showPositiveToast(
            `Rated "${this.track?.name}" ${rating} stars`
          );
          this.savingRating = false;
        },
        error: () => {
          this.userRating = previousRating;
          this.toastService.showNegativeToast('Failed to save rating');
          this.savingRating = false;
        },
      });
  }

  removeRating(): void {
    if (!this.track || this.savingRating) return;

    this.savingRating = true;
    const previousRating = this.userRating;
    this.userRating = 0;

    this.ratingsService
      .deleteRating(this.currentEmail, this.track.id)
      .pipe(take(1))
      .subscribe({
        next: () => {
          this.toastService.showPositiveToast('Rating removed');
          this.savingRating = false;
        },
        error: () => {
          this.userRating = previousRating;
          this.toastService.showNegativeToast('Failed to remove rating');
          this.savingRating = false;
        },
      });
  }

  togglePlay(): void {
    if (!this.track) return;

    if (this.isPlaying) {
      this.playerService.stopSong();
    } else {
      this.playerService.playSong(this.track.id);
    }
  }

  addToQueue(): void {
    if (!this.track) return;

    const queueTrack: QueueTrack = {
      id: this.track.id,
      name: this.track.name,
      artists: this.track.artists,
      album: this.track.album,
      duration_ms: this.track.duration_ms || 0,
      external_urls: this.track.external_urls || { spotify: '' },
    };

    if (this.queueService.isInQueue(this.track.id)) {
      this.queueService.removeFromQueue(this.track.id);
      this.toastService.showPositiveToast(
        `Removed "${this.track.name}" from queue`
      );
    } else {
      this.queueService.addToQueue(queueTrack);
      this.toastService.showPositiveToast(
        `Added "${this.track.name}" to queue`
      );
    }
  }

  addToSpotifyQueue(): void {
    if (!this.track) return;

    this.playerService
      .addToSpotifyQueue(this.track.id)
      .pipe(take(1))
      .subscribe({
        next: (success) => {
          if (success) {
            this.toastService.showPositiveToast(
              `Added "${this.track?.name}" to Spotify queue`
            );
          } else {
            this.toastService.showNegativeToast(
              'Could not add to queue. Open Spotify and try again.'
            );
          }
        },
        error: () => {
          this.toastService.showNegativeToast('Error adding to queue');
        },
      });
  }

  isInQueue(): boolean {
    return this.track ? this.queueService.isInQueue(this.track.id) : false;
  }

  goToArtist(artistId: string): void {
    this.close();
    this.router.navigate(['/artist-profile', artistId]);
  }

  goToAlbum(): void {
    if (!this.track?.album?.id) return;
    this.close();
    this.router.navigate(['/album', this.track.album.id]);
  }

  openInSpotify(): void {
    if (this.track?.external_urls?.spotify) {
      window.open(this.track.external_urls.spotify, '_blank');
    }
  }

  goToFriendProfile(email: string): void {
    this.close();
    this.router.navigate(['/friend', email]);
  }

  getArtistNames(artists: { id: string; name: string }[]): string {
    return artists.map((a) => a.name).join(', ');
  }

  getAlbumArt(): string {
    return (
      this.track?.album?.images?.[0]?.url ||
      this.track?.album?.images?.[1]?.url ||
      'assets/default-album.png'
    );
  }

  formatDuration(ms?: number): string {
    if (!ms) return '';
    const minutes = Math.floor(ms / 60000);
    const seconds = Math.floor((ms % 60000) / 1000);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  }

  formatReleaseYear(): string {
    return this.track?.album?.release_date?.split('-')[0] || '';
  }

  getDefaultAvatar(): string {
    return 'assets/img/no-image.png';
  }
}
