import { Component, OnInit, OnDestroy } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { Subscription } from 'rxjs';
import { take } from 'rxjs/operators';
import { FriendsService, FriendProfile } from 'src/app/services/friends.service';
import { PlayerService } from 'src/app/services/player.service';
import { ToastService } from 'src/app/services/toast.service';
import { QueueService, QueueTrack } from 'src/app/services/queue.service';

type TabType = 'songs' | 'artists' | 'genres';

@Component({
  selector: 'app-friend-profile',
  templateUrl: './friend-profile.component.html',
  styleUrls: ['./friend-profile.component.scss'],
})
export class FriendProfileComponent implements OnInit, OnDestroy {
  private subscriptions: Subscription[] = [];

  friendEmail = '';
  profile: FriendProfile | null = null;
  loading = true;
  error = '';

  activeTab: TabType = 'songs';

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private friendsService: FriendsService,
    private playerService: PlayerService,
    private queueService: QueueService,
    private toastService: ToastService
  ) {}

  ngOnInit(): void {
    this.subscriptions.push(
      this.route.params.subscribe((params) => {
        this.friendEmail = params['email'];
        this.loadProfile();
      })
    );
  }

  ngOnDestroy(): void {
    this.subscriptions.forEach((sub) => sub.unsubscribe());
    this.playerService.stopSong();
  }

  loadProfile(): void {
    this.loading = true;
    this.error = '';

    this.friendsService
      .getFriendProfile(this.friendEmail)
      .pipe(take(1))
      .subscribe({
        next: (profile) => {
          this.profile = profile;
          this.loading = false;
        },
        error: (err) => {
          console.error('Error loading friend profile:', err);
          this.error = 'Could not load profile. They may not be your friend.';
          this.loading = false;
        },
      });
  }

  switchTab(tab: TabType): void {
    if (tab === this.activeTab) return;
    this.activeTab = tab;
  }

  // Track actions
  playSong(track: any, event: Event): void {
    event.stopPropagation();
    this.playerService.playSong(track.id);
  }

  addToSpotifyQueue(track: any, event: Event): void {
    event.stopPropagation();
    this.playerService.addToSpotifyQueue(track.id).pipe(take(1)).subscribe({
      next: (success) => {
        if (success) {
          this.toastService.showPositiveToast(`Added "${track.name}" to queue`);
        } else {
          this.toastService.showNegativeToast('Could not add to queue. Is Spotify active?');
        }
      },
    });
  }

  addToPlaylistBuilder(track: any, event: Event): void {
    event.stopPropagation();

    const queueTrack: QueueTrack = {
      id: track.id,
      name: track.name,
      artists: track.artists || [],
      album: track.album || {},
      duration_ms: track.duration_ms || 0,
      external_urls: track.external_urls || {},
    };

    if (this.queueService.isInQueue(track.id)) {
      this.queueService.removeFromQueue(track.id);
      this.toastService.showPositiveToast(`Removed "${track.name}" from playlist builder`);
    } else {
      this.queueService.addToQueue(queueTrack);
      this.toastService.showPositiveToast(`Added "${track.name}" to playlist builder`);
    }
  }

  isInQueue(trackId: string): boolean {
    return this.queueService.isInQueue(trackId);
  }

  openInSpotify(url: string, event: Event): void {
    event.stopPropagation();
    if (url) {
      window.open(url, '_blank');
    }
  }

  // Artist actions
  goToArtist(artistId: string, event?: Event): void {
    if (event) event.stopPropagation();
    this.router.navigate(['/artist-profile', artistId]);
  }

  // Navigation
  goBack(): void {
    this.router.navigate(['/friends']);
  }

  // Helpers
  getArtistNames(artists: any[]): string {
    if (!artists) return '';
    return artists
      .slice(0, 2)
      .map((a) => a.name)
      .join(', ');
  }

  formatDuration(ms: number): string {
    if (!ms) return '0:00';
    const minutes = Math.floor(ms / 60000);
    const seconds = Math.floor((ms % 60000) / 1000);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  }

  formatNumber(num: number): string {
    if (!num) return '0';
    if (num >= 1000000) {
      return (num / 1000000).toFixed(1) + 'M';
    }
    if (num >= 1000) {
      return (num / 1000).toFixed(1) + 'K';
    }
    return num.toString();
  }

  getDefaultAvatar(): string {
    return 'assets/img/no-image.png';
  }

  getDefaultArtist(): string {
    return 'assets/img/no-image.png';
  }
}
