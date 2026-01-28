import { Component, OnInit, OnDestroy } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { Subscription, forkJoin } from 'rxjs';
import { take } from 'rxjs/operators';
import { FriendsService, FriendProfile } from 'src/app/services/friends.service';
import { UserService } from 'src/app/services/user.service';
import { PlayerService } from 'src/app/services/player.service';
import { ToastService } from 'src/app/services/toast.service';
import { QueueService, QueueTrack } from 'src/app/services/queue.service';
import { SongService } from 'src/app/services/song.service';
import { ArtistService } from 'src/app/services/artist.service';

type TabType = 'songs' | 'artists' | 'genres' | 'playlists' | 'compatibility';
type TermType = 'short_term' | 'medium_term' | 'long_term';

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
  activeTerm: TermType = 'short_term';

  // Friend status
  isFriend = false;
  isOutgoingRequest = false;
  isIncomingRequest = false;
  actionLoading = false;

  // Compatibility data
  compatibilityScore = 0;
  sharedArtists: any[] = [];
  sharedSongs: any[] = [];
  sharedGenres: string[] = [];
  compatibilityCalculated = false;

  // Friend stats (fetched from Spotify)
  followersCount = 0;
  followingCount = 0;
  playlistCount = 0;
  friendsCount = 0;
  statsLoaded = false;

  constructor(
    private route: ActivatedRoute,
    public router: Router,
    private friendsService: FriendsService,
    private userService: UserService,
    private playerService: PlayerService,
    private queueService: QueueService,
    private toastService: ToastService,
    private songService: SongService,
    private artistService: ArtistService
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

    const currentEmail = this.userService.getEmail();

    forkJoin({
      profile: this.friendsService.getFriendProfile(this.friendEmail),
      friendsList: this.friendsService.getFriendsList(currentEmail),
    })
      .pipe(take(1))
      .subscribe({
        next: ({ profile, friendsList }) => {
          this.profile = profile;
          console.log('Friend Profile Data:', profile);
          console.log('Avatar URL:', profile.avatar);
          console.log('Top Genres:', profile.topGenres);
          console.log('Current Term Genres:', this.getCurrentGenres());
          console.log('Playlists:', profile.playlists);

          // Check friendship status
          this.isFriend = friendsList.accepted.some((f: any) =>
            (f.email === this.friendEmail || f.friendEmail === this.friendEmail)
          );
          this.isIncomingRequest = friendsList.pending.some((r: any) =>
            (r.email === this.friendEmail || r.friendEmail === this.friendEmail)
          );
          this.isOutgoingRequest = friendsList.requested.some((r: any) =>
            (r.email === this.friendEmail || r.friendEmail === this.friendEmail)
          );

          // Calculate compatibility
          this.calculateCompatibility();

          // Load Spotify stats for this friend
          this.loadFriendStats();

          this.loading = false;
        },
        error: (err) => {
          console.error('Error loading friend profile:', err);
          this.error = 'Could not load profile. They may not be your friend.';
          this.loading = false;
        },
      });
  }

  loadFriendStats(): void {
    // Check cache first
    const cacheKey = `xomify_friend_stats_${this.friendEmail}`;
    const cached = this.getStatsCache(cacheKey);
    if (cached) {
      this.followersCount = cached.followersCount;
      this.followingCount = cached.followingCount;
      this.playlistCount = cached.playlistCount;
      this.friendsCount = cached.friendsCount;
      this.statsLoaded = true;
      return;
    }

    // Build the requests
    const requests: any = {};

    // Only fetch Spotify stats if we have a userId
    if (this.profile?.userId) {
      requests.spotifyProfile = this.userService.getUserProfile(this.profile.userId);
      requests.playlists = this.userService.getUserPublicPlaylists(this.profile.userId, 50);
    }

    // Fetch friend's friends count
    requests.friendsList = this.friendsService.getFriendsList(this.friendEmail);

    forkJoin(requests)
      .pipe(take(1))
      .subscribe({
        next: (data: any) => {
          // Spotify stats (if available)
          if (data.spotifyProfile) {
            this.followersCount = data.spotifyProfile?.followers?.total || 0;
          }
          if (data.playlists) {
            this.playlistCount = data.playlists?.total || 0;
            // Store playlists if profile doesn't have them
            if ((!this.profile.playlists || this.profile.playlists.length === 0) && data.playlists?.items) {
              this.profile.playlists = data.playlists.items;
            }
          }

          // Friend's friends count
          if (data.friendsList) {
            this.friendsCount = data.friendsList.acceptedCount || 0;
          }

          this.statsLoaded = true;

          // Cache the stats
          this.setStatsCache(cacheKey, {
            followersCount: this.followersCount,
            followingCount: this.followingCount,
            playlistCount: this.playlistCount,
            friendsCount: this.friendsCount,
          });
        },
        error: (err) => {
          console.error('Error loading friend stats:', err);
          this.statsLoaded = true;
        },
      });
  }

  private getStatsCache(key: string): any | null {
    try {
      const cached = localStorage.getItem(key);
      if (!cached) return null;

      const data = JSON.parse(cached);
      const now = Date.now();
      const STATS_CACHE_TTL = 10 * 60 * 1000; // 10 minutes

      if (now - data.timestamp > STATS_CACHE_TTL) {
        localStorage.removeItem(key);
        return null;
      }

      return data.stats;
    } catch {
      return null;
    }
  }

  private setStatsCache(key: string, stats: any): void {
    try {
      localStorage.setItem(
        key,
        JSON.stringify({
          stats,
          timestamp: Date.now(),
        })
      );
    } catch {
      console.warn('Failed to cache friend stats');
    }
  }

  switchTab(tab: TabType): void {
    if (tab === this.activeTab) return;
    this.activeTab = tab;
  }

  switchTerm(term: TermType): void {
    if (term === this.activeTerm) return;
    this.activeTerm = term;
  }

  // Get data for current term
  getCurrentSongs(): any[] {
    if (!this.profile?.topSongs) return [];
    return this.profile.topSongs[this.activeTerm] || [];
  }

  getCurrentArtists(): any[] {
    if (!this.profile?.topArtists) return [];
    return this.profile.topArtists[this.activeTerm] || [];
  }

  getCurrentGenres(): any[] {
    if (!this.profile?.topGenres) {
      console.log('No topGenres in profile');
      return [];
    }
    const genresData = this.profile.topGenres[this.activeTerm];
    console.log(`Genres for ${this.activeTerm}:`, genresData);

    // If genres is an object (like {country: 67, rap: 53}), convert to array
    if (genresData && typeof genresData === 'object' && !Array.isArray(genresData)) {
      return Object.entries(genresData)
        .map(([name, count]) => ({ name, count: count as number }))
        .sort((a, b) => b.count - a.count); // Sort by count descending
    }

    // If it's already an array, return it
    return Array.isArray(genresData) ? genresData : [];
  }

  getPlaylists(): any[] {
    if (!this.profile?.playlists) return [];
    return this.profile.playlists;
  }

  getTermLabel(term: TermType): string {
    switch (term) {
      case 'short_term':
        return 'Last 4 Weeks';
      case 'medium_term':
        return 'Last 6 Months';
      case 'long_term':
        return 'All Time';
    }
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
          this.toastService.showNegativeToast('Could not add to queue. Open Spotify on any device and try again.');
        }
      },
      error: () => {
        this.toastService.showNegativeToast('Error adding to queue. Check console for details.');
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

  // Genre helpers
  getGenreName(genre: any): string {
    if (typeof genre === 'string') {
      return genre;
    }
    return genre?.name || genre?.genre || '';
  }

  getGenrePercentage(genre: any, index: number): number {
    // If genre has percentage property, use it
    if (genre?.percentage !== undefined) {
      return genre.percentage;
    }

    // If genre has count, calculate percentage relative to top genre
    if (genre?.count !== undefined) {
      const genres = this.getCurrentGenres();
      if (genres.length === 0) return 0;

      const maxCount = Math.max(...genres.map((g: any) => g.count || 0));
      if (maxCount === 0) return 0;

      return Math.round((genre.count / maxCount) * 100);
    }

    // Fallback: Calculate percentage based on position (top genre = 100%, decreasing by 10% each)
    return Math.max(100 - (index * 10), 10);
  }

  // Friend actions
  sendFriendRequest(): void {
    if (this.actionLoading) return;
    this.actionLoading = true;

    const currentEmail = this.userService.getEmail();
    this.friendsService
      .sendFriendRequest(currentEmail, this.friendEmail)
      .pipe(take(1))
      .subscribe({
        next: () => {
          this.isOutgoingRequest = true;
          this.toastService.showPositiveToast(`Friend request sent to ${this.profile?.displayName}`);
          this.actionLoading = false;
        },
        error: (err) => {
          console.error('Error sending friend request:', err);
          this.toastService.showNegativeToast('Error sending friend request');
          this.actionLoading = false;
        },
      });
  }

  acceptFriendRequest(): void {
    if (this.actionLoading) return;
    this.actionLoading = true;

    const currentEmail = this.userService.getEmail();
    this.friendsService
      .acceptFriendRequest(currentEmail, this.friendEmail)
      .pipe(take(1))
      .subscribe({
        next: () => {
          this.isFriend = true;
          this.isIncomingRequest = false;
          this.toastService.showPositiveToast(`You are now friends with ${this.profile?.displayName}`);
          this.actionLoading = false;
        },
        error: (err) => {
          console.error('Error accepting friend request:', err);
          this.toastService.showNegativeToast('Error accepting friend request');
          this.actionLoading = false;
        },
      });
  }

  rejectFriendRequest(): void {
    if (this.actionLoading) return;
    this.actionLoading = true;

    const currentEmail = this.userService.getEmail();
    this.friendsService
      .rejectFriendRequest(currentEmail, this.friendEmail)
      .pipe(take(1))
      .subscribe({
        next: () => {
          this.isIncomingRequest = false;
          this.toastService.showPositiveToast('Request rejected');
          this.actionLoading = false;
        },
        error: (err) => {
          console.error('Error rejecting request:', err);
          this.toastService.showNegativeToast('Error rejecting request');
          this.actionLoading = false;
        },
      });
  }

  cancelFriendRequest(): void {
    if (this.actionLoading) return;
    this.actionLoading = true;

    const currentEmail = this.userService.getEmail();
    this.friendsService
      .rejectFriendRequest(currentEmail, this.friendEmail)
      .pipe(take(1))
      .subscribe({
        next: () => {
          this.isOutgoingRequest = false;
          this.toastService.showPositiveToast('Request cancelled');
          this.actionLoading = false;
        },
        error: (err) => {
          console.error('Error cancelling request:', err);
          this.toastService.showNegativeToast('Error cancelling request');
          this.actionLoading = false;
        },
      });
  }

  removeFriend(): void {
    if (this.actionLoading) return;
    this.actionLoading = true;

    const currentEmail = this.userService.getEmail();
    this.friendsService
      .removeFriend(currentEmail, this.friendEmail)
      .pipe(take(1))
      .subscribe({
        next: () => {
          this.isFriend = false;
          this.toastService.showPositiveToast(`Removed ${this.profile?.displayName} from friends`);
          this.actionLoading = false;
        },
        error: (err) => {
          console.error('Error removing friend:', err);
          this.toastService.showNegativeToast('Error removing friend');
          this.actionLoading = false;
        },
      });
  }

  // Compatibility calculation
  calculateCompatibility(): void {
    if (!this.profile || this.compatibilityCalculated) return;

    // Collect data from ALL time periods for a more comprehensive comparison
    const myArtistsShort = this.artistService.getShortTermTopArtists() || [];
    const myArtistsMedium = this.artistService.getMedTermTopArtists() || [];
    const myArtistsLong = this.artistService.getLongTermTopArtists() || [];
    const mySongsShort = this.songService.getShortTermTopTracks() || [];
    const mySongsMedium = this.songService.getMediumTermTopTracks() || [];
    const mySongsLong = this.songService.getLongTermTopTracks() || [];

    // Combine all my artists and songs (deduplicated by ID)
    const myArtistIds = new Set<string>();
    [...myArtistsShort, ...myArtistsMedium, ...myArtistsLong].forEach((a: any) => {
      if (a?.id) myArtistIds.add(a.id);
    });

    const mySongIds = new Set<string>();
    [...mySongsShort, ...mySongsMedium, ...mySongsLong].forEach((s: any) => {
      if (s?.id) mySongIds.add(s.id);
    });

    // Extract my genres from all artists
    const myGenres = new Set<string>();
    [...myArtistsShort, ...myArtistsMedium, ...myArtistsLong].forEach((artist: any) => {
      if (artist?.genres && Array.isArray(artist.genres)) {
        artist.genres.forEach((genre: string) => myGenres.add(genre.toLowerCase()));
      }
    });

    // Get friend's data from ALL time periods
    const friendArtistsAll: any[] = [];
    const friendSongsAll: any[] = [];
    const friendGenresAll = new Set<string>();

    ['short_term', 'medium_term', 'long_term'].forEach((term) => {
      const artists = this.profile?.topArtists?.[term as keyof typeof this.profile.topArtists] || [];
      const songs = this.profile?.topSongs?.[term as keyof typeof this.profile.topSongs] || [];
      const genresRaw = this.profile?.topGenres?.[term as keyof typeof this.profile.topGenres];

      friendArtistsAll.push(...artists);
      friendSongsAll.push(...songs);

      // Extract genres
      if (genresRaw && typeof genresRaw === 'object' && !Array.isArray(genresRaw)) {
        Object.keys(genresRaw).forEach((g) => friendGenresAll.add(g.toLowerCase()));
      } else if (Array.isArray(genresRaw)) {
        genresRaw.forEach((g: any) => {
          const name = g?.name || g?.genre || (typeof g === 'string' ? g : '');
          if (name) friendGenresAll.add(name.toLowerCase());
        });
      }
    });

    // Deduplicate friend's data
    const friendArtistIds = new Set<string>();
    const uniqueFriendArtists: any[] = [];
    friendArtistsAll.forEach((a: any) => {
      if (a?.id && !friendArtistIds.has(a.id)) {
        friendArtistIds.add(a.id);
        uniqueFriendArtists.push(a);
      }
    });

    const friendSongIds = new Set<string>();
    const uniqueFriendSongs: any[] = [];
    friendSongsAll.forEach((s: any) => {
      if (s?.id && !friendSongIds.has(s.id)) {
        friendSongIds.add(s.id);
        uniqueFriendSongs.push(s);
      }
    });

    // Find shared items
    this.sharedArtists = uniqueFriendArtists.filter((a: any) => myArtistIds.has(a.id));
    this.sharedSongs = uniqueFriendSongs.filter((s: any) => mySongIds.has(s.id));
    this.sharedGenres = Array.from(friendGenresAll).filter((g) => myGenres.has(g));

    // Calculate compatibility score using a more generous algorithm
    // Points-based system that rewards shared items
    let score = 0;

    // Artists: Each shared artist is worth points (max 40 points)
    // 1 shared = 15, 2 = 25, 3 = 32, 5+ = 40
    const artistPoints = Math.min(40, this.sharedArtists.length * 8 + (this.sharedArtists.length > 0 ? 7 : 0));
    score += artistPoints;

    // Genres: Each shared genre is worth points (max 35 points)
    // Genres are broader so we expect more overlap
    const genrePoints = Math.min(35, this.sharedGenres.length * 3 + (this.sharedGenres.length > 0 ? 5 : 0));
    score += genrePoints;

    // Songs: Shared songs are rare and special (max 25 points)
    // 1 shared = 15, 2 = 20, 3+ = 25
    const songPoints = Math.min(25, this.sharedSongs.length * 7 + (this.sharedSongs.length > 0 ? 8 : 0));
    score += songPoints;

    // Ensure score is between 0 and 100
    this.compatibilityScore = Math.min(100, Math.max(0, score));

    this.compatibilityCalculated = true;

    console.log('Compatibility calculated:', {
      score: this.compatibilityScore,
      sharedArtists: this.sharedArtists.length,
      sharedGenres: this.sharedGenres.length,
      sharedSongs: this.sharedSongs.length,
      breakdown: { artistPoints, genrePoints, songPoints },
    });
  }

  private extractGenresFromArtists(artists: any[]): string[] {
    const genreSet = new Set<string>();
    artists.forEach((artist: any) => {
      if (artist.genres && Array.isArray(artist.genres)) {
        artist.genres.forEach((genre: string) => genreSet.add(genre));
      }
    });
    return Array.from(genreSet);
  }

  getCompatibilityLabel(): string {
    if (this.compatibilityScore >= 80) return 'Excellent Match!';
    if (this.compatibilityScore >= 60) return 'Great Match';
    if (this.compatibilityScore >= 40) return 'Good Match';
    if (this.compatibilityScore >= 20) return 'Some Overlap';
    return 'Different Tastes';
  }

  getCompatibilityColor(): string {
    if (this.compatibilityScore >= 80) return '#1bdc6f';
    if (this.compatibilityScore >= 60) return '#7dd87d';
    if (this.compatibilityScore >= 40) return '#f1c40f';
    if (this.compatibilityScore >= 20) return '#e67e22';
    return '#e74c3c';
  }
}
