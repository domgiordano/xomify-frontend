import { Component, OnInit, OnDestroy } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { Subscription, forkJoin } from 'rxjs';
import { take } from 'rxjs/operators';
import { FriendsService, FriendProfile } from 'src/app/services/friends.service';
import { UserService } from 'src/app/services/user.service';
import { PlayerService } from 'src/app/services/player.service';
import { ToastService } from 'src/app/services/toast.service';
import { QueueService, QueueTrack } from 'src/app/services/queue.service';

type TabType = 'songs' | 'artists' | 'genres';
type TimeRange = 'short_term' | 'medium_term' | 'long_term';

interface TopTrack {
  id: string;
  name: string;
  artists: { id: string; name: string }[];
  album: {
    id: string;
    name: string;
    images: { url: string }[];
  };
  duration_ms: number;
  external_urls: { spotify: string };
}

interface TopArtist {
  id: string;
  name: string;
  images: { url: string }[];
  genres: string[];
  popularity: number;
  followers: { total: number };
  external_urls: { spotify: string };
}

interface TopGenre {
  name: string;
  count: number;
  percentage: number;
}

@Component({
  selector: 'app-friend-profile',
  templateUrl: './friend-profile.component.html',
  styleUrls: ['./friend-profile.component.scss'],
})
export class FriendProfileComponent implements OnInit, OnDestroy {
  private subscriptions: Subscription[] = [];

  friendEmail = '';
  currentEmail = '';
  profile: FriendProfile | null = null;
  loading = true;
  error = '';

  activeTab: TabType = 'songs';
  activeTimeRange: TimeRange = 'short_term';

  topTracks: TopTrack[] = [];
  topArtists: TopArtist[] = [];
  topGenres: TopGenre[] = [];

  tracksLoading = false;
  artistsLoading = false;
  genresLoading = false;

  timeRanges = [
    { value: 'short_term' as const, label: '4 Weeks' },
    { value: 'medium_term' as const, label: '6 Months' },
    { value: 'long_term' as const, label: 'All Time' },
  ];

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private friendsService: FriendsService,
    private userService: UserService,
    private playerService: PlayerService,
    private queueService: QueueService,
    private toastService: ToastService
  ) {}

  ngOnInit(): void {
    this.currentEmail = this.userService.getEmail();

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
      .getFriendProfile(this.currentEmail, this.friendEmail)
      .pipe(take(1))
      .subscribe({
        next: (profile) => {
          this.profile = profile;
          this.loading = false;
          this.loadTabData();
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
    this.loadTabData();
  }

  onTimeRangeChange(range: TimeRange): void {
    if (range === this.activeTimeRange) return;
    this.activeTimeRange = range;
    this.loadTabData();
  }

  loadTabData(): void {
    switch (this.activeTab) {
      case 'songs':
        this.loadTopTracks();
        break;
      case 'artists':
        this.loadTopArtists();
        break;
      case 'genres':
        this.loadTopGenres();
        break;
    }
  }

  loadTopTracks(): void {
    this.tracksLoading = true;

    this.friendsService
      .getFriendTopTracks(this.friendEmail, this.activeTimeRange, 10)
      .pipe(take(1))
      .subscribe({
        next: (data) => {
          this.topTracks = data.items || [];
          this.tracksLoading = false;
        },
        error: (err) => {
          console.error('Error loading top tracks:', err);
          this.toastService.showNegativeToast('Error loading tracks');
          this.tracksLoading = false;
        },
      });
  }

  loadTopArtists(): void {
    this.artistsLoading = true;

    this.friendsService
      .getFriendTopArtists(this.friendEmail, this.activeTimeRange, 10)
      .pipe(take(1))
      .subscribe({
        next: (data) => {
          this.topArtists = data.items || [];
          this.artistsLoading = false;
        },
        error: (err) => {
          console.error('Error loading top artists:', err);
          this.toastService.showNegativeToast('Error loading artists');
          this.artistsLoading = false;
        },
      });
  }

  loadTopGenres(): void {
    this.genresLoading = true;

    this.friendsService
      .getFriendTopGenres(this.friendEmail, this.activeTimeRange)
      .pipe(take(1))
      .subscribe({
        next: (data) => {
          this.topGenres = data.genres || [];
          this.genresLoading = false;
        },
        error: (err) => {
          console.error('Error loading top genres:', err);
          this.toastService.showNegativeToast('Error loading genres');
          this.genresLoading = false;
        },
      });
  }

  // Track actions
  playSong(track: TopTrack, event: Event): void {
    event.stopPropagation();
    this.playerService.playSong(track.id);
  }

  addToSpotifyQueue(track: TopTrack, event: Event): void {
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

  addToPlaylistBuilder(track: TopTrack, event: Event): void {
    event.stopPropagation();

    const queueTrack: QueueTrack = {
      id: track.id,
      name: track.name,
      artists: track.artists,
      album: track.album,
      duration_ms: track.duration_ms,
      external_urls: track.external_urls,
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
    window.open(url, '_blank');
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
  getArtistNames(artists: { id: string; name: string }[]): string {
    return artists
      .slice(0, 2)
      .map((a) => a.name)
      .join(', ');
  }

  formatDuration(ms: number): string {
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
