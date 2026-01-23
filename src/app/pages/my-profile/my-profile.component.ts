import { Component, OnInit, OnDestroy } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from 'src/app/services/auth.service';
import { UserService } from 'src/app/services/user.service';
import { SongService } from 'src/app/services/song.service';
import { ArtistService } from 'src/app/services/artist.service';
import { FriendsService } from 'src/app/services/friends.service';
import { forkJoin, take, interval, Subscription } from 'rxjs';
import { ToastService } from 'src/app/services/toast.service';

interface TickerItem {
  id: string;
  name: string;
  image?: string;
  subtitle?: string;
  type: 'song' | 'artist' | 'genre';
}

@Component({
  selector: 'app-my-profile-page',
  templateUrl: './my-profile.component.html',
  styleUrls: ['./my-profile.component.scss'],
})
export class MyProfileComponent implements OnInit, OnDestroy {
  loading: boolean = true;
  profilePicture: string = '';
  userName: string = '';
  email: string = '';
  followersCount: number = 0;
  followingCount: number = 0;
  friendsCount: number = 0;
  playlistCount: number = 0;
  country: string = '';
  product: string = '';
  userId: string = '';
  spotifyProfileUrl: string = '';
  user: any;
  accessToken: string = '';
  wrappedEnrolled: boolean = false;
  releaseRadarEnrolled: boolean = false;
  maxEnrollAttempts = 5;
  enrollAttempts = 0;
  disableEnrollButtons: boolean = false;
  maxReached: boolean = false;

  // Ticker state
  tickerItems: TickerItem[] = [];
  currentTickerType: 'song' | 'artist' | 'genre' = 'song';
  tickerLabel: string = 'Top Songs';
  tickerPaused: boolean = false;
  tickerLoaded: boolean = false;

  private topSongs: any[] = [];
  private topArtists: any[] = [];
  private topGenres: { name: string; count: number }[] = [];
  private tickerRotationSub?: Subscription;

  constructor(
    private AuthService: AuthService,
    private UserService: UserService,
    private SongService: SongService,
    private ArtistService: ArtistService,
    private FriendsService: FriendsService,
    private ToastService: ToastService,
    private router: Router
  ) {}

  ngOnInit(): void {
    this.accessToken = this.AuthService.getAccessToken();
    this.userName = this.UserService.getUserName();

    if (this.userName.length === 0) {
      console.log('Need User.');
      this.loadUser();
    } else {
      console.log('We got dat user.');
      this.populateUserData();
      this.loadAdditionalData();
    }
  }

  ngOnDestroy(): void {
    if (this.tickerRotationSub) {
      this.tickerRotationSub.unsubscribe();
    }
  }

  private populateUserData(): void {
    this.user = this.UserService.getUser();
    this.userName = this.UserService.getUserName();
    this.profilePicture = this.UserService.getProfilePic();
    this.email = this.UserService.getEmail();
    this.followersCount = this.UserService.getFollowers();
    this.wrappedEnrolled = this.UserService.getWrappedEnrollment();
    this.releaseRadarEnrolled = this.UserService.getReleaseRadarEnrollment();

    const cachedPlaylistCount = this.UserService.getPlaylistCount();
    const cachedFollowingCount = this.UserService.getFollowingCount();
    const cachedFriendsList = this.FriendsService.getCachedFriendsList();

    if (cachedPlaylistCount > 0) {
      this.playlistCount = cachedPlaylistCount;
    }
    if (cachedFollowingCount > 0) {
      this.followingCount = cachedFollowingCount;
    }
    if (cachedFriendsList) {
      this.friendsCount = cachedFriendsList.acceptedCount || 0;
    }

    if (this.user) {
      this.country = this.user.country || 'Unknown';
      this.product = this.user.product || 'free';
      this.userId = this.user.id || '';
      this.spotifyProfileUrl =
        this.user.external_urls?.spotify || 'https://open.spotify.com';
    }
  }

  loadUser(): void {
    this.loading = true;
    this.UserService.getUserData()
      .pipe(take(1))
      .subscribe({
        next: (data) => {
          console.log('USER------', data);
          this.UserService.setUser(data);
          this.populateUserData();
          this.loadAdditionalData();
          this.updateUserTable();

          // Fetch Xomify enrollment status
          this.UserService.getUserTableData(data.email)
            .pipe(take(1))
            .subscribe({
              next: (xomifyData) => {
                console.log('XOMIFY USER DATA------', xomifyData);
                this.wrappedEnrolled = xomifyData?.activeWrapped ?? false;
                this.releaseRadarEnrolled =
                  xomifyData?.activeReleaseRadar ?? false;
                this.UserService.setWrappedEnrollment(this.wrappedEnrolled);
                this.UserService.setReleaseRadarEnrollment(
                  this.releaseRadarEnrolled
                );
              },
              error: (err) => {
                console.log('No Xomify user data found (new user)', err);
              },
            });
        },
        error: (err) => {
          console.error('Error fetching User', err);
          this.ToastService.showNegativeToast('Error fetching User');
          this.loading = false;
        },
        complete: () => {
          console.log('User Loaded.');
        },
      });
  }

  private loadAdditionalData(): void {
    forkJoin({
      playlists: this.UserService.getUserPlaylists(1),
      following: this.UserService.getFollowedArtists(1),
    })
      .pipe(take(1))
      .subscribe({
        next: (data) => {
          this.playlistCount = data.playlists?.total || 0;
          this.UserService.setPlaylistCount(this.playlistCount);

          this.followingCount = data.following?.artists?.total || 0;
          this.UserService.setFollowingCount(this.followingCount);

          console.log('Playlist count:', this.playlistCount);
          console.log('Following count:', this.followingCount);

          this.loading = false;

          // Load ticker data after main data is loaded
          this.loadTickerData();

          // Load friends count after user data is confirmed loaded
          this.loadFriendsCount();
        },
        error: (err) => {
          console.error('Error fetching additional data', err);
          this.loading = false;
        },
      });
  }

  private loadFriendsCount(): void {
    // Get email directly from service to ensure we have it
    const email = this.email || this.UserService.getEmail();
    if (!email) {
      console.warn('No email available for loading friends count');
      return;
    }

    // First, use cached data if available for instant display
    const cached = this.FriendsService.getCachedFriendsList();
    if (cached) {
      this.friendsCount = cached.acceptedCount || 0;
      console.log('Friends count (from cache):', this.friendsCount);
    }

    // Then fetch fresh data to update cache and display
    this.FriendsService.getFriendsList(email, true) // forceRefresh to get latest
      .pipe(take(1))
      .subscribe({
        next: (response) => {
          this.friendsCount = response.acceptedCount || 0;
          console.log('Friends count (fresh):', this.friendsCount);
        },
        error: (err) => {
          console.error('Error fetching friends count', err);
        },
      });
  }

  private loadTickerData(): void {
    // Check if we have cached data first
    const cachedSongs = this.SongService.getShortTermTopTracks();
    const cachedArtists = this.ArtistService.getShortTermTopArtists();

    if (cachedSongs.length > 0 && cachedArtists.length > 0) {
      this.topSongs = cachedSongs.slice(0, 10);
      this.topArtists = cachedArtists.slice(0, 10);
      this.topGenres = this.extractTopGenres(cachedArtists);
      this.initializeTicker();
      return;
    }

    // Load fresh data
    forkJoin({
      songs: this.SongService.getTopTracks('short_term'),
      artists: this.ArtistService.getTopArtists('short_term'),
    })
      .pipe(take(1))
      .subscribe({
        next: (data) => {
          this.topSongs = (data.songs.items || []).slice(0, 10);
          this.topArtists = (data.artists.items || []).slice(0, 10);
          this.topGenres = this.extractTopGenres(data.artists.items || []);

          // Cache the data
          if (data.songs.items) {
            this.SongService.setTopTracks(data.songs.items, [], []);
          }
          if (data.artists.items) {
            this.ArtistService.setShortTermTopArtists(data.artists.items);
          }

          this.initializeTicker();
        },
        error: (err) => {
          console.error('Error loading ticker data', err);
        },
      });
  }

  private extractTopGenres(artists: any[]): { name: string; count: number }[] {
    const genreMap = new Map<string, number>();

    artists.forEach((artist) => {
      (artist.genres || []).forEach((genre: string) => {
        genreMap.set(genre, (genreMap.get(genre) || 0) + 1);
      });
    });

    return Array.from(genreMap.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([name, count]) => ({ name, count }));
  }

  private initializeTicker(): void {
    this.updateTickerItems('song');
    this.tickerLoaded = true;

    // Rotate ticker every 15 seconds
    this.tickerRotationSub = interval(15000).subscribe(() => {
      this.rotateTickerType();
    });
  }

  private rotateTickerType(): void {
    switch (this.currentTickerType) {
      case 'song':
        this.updateTickerItems('artist');
        break;
      case 'artist':
        this.updateTickerItems('genre');
        break;
      case 'genre':
        this.updateTickerItems('song');
        break;
    }
  }

  private updateTickerItems(type: 'song' | 'artist' | 'genre'): void {
    this.currentTickerType = type;

    switch (type) {
      case 'song':
        this.tickerLabel = 'Top Songs';
        this.tickerItems = this.topSongs.map((song) => ({
          id: song.id,
          name: song.name,
          image: song.album?.images?.[2]?.url || song.album?.images?.[0]?.url,
          subtitle: song.artists?.map((a: any) => a.name).join(', '),
          type: 'song' as const,
        }));
        break;

      case 'artist':
        this.tickerLabel = 'Top Artists';
        this.tickerItems = this.topArtists.map((artist) => ({
          id: artist.id,
          name: artist.name,
          image: artist.images?.[2]?.url || artist.images?.[0]?.url,
          subtitle: artist.genres?.[0] || 'Artist',
          type: 'artist' as const,
        }));
        break;

      case 'genre':
        this.tickerLabel = 'Top Genres';
        this.tickerItems = this.topGenres.map((genre, index) => ({
          id: `genre-${index}`,
          name: genre.name,
          subtitle: `${genre.count} artists`,
          type: 'genre' as const,
        }));
        break;
    }
  }

  onTickerItemClick(item: TickerItem): void {
    switch (item.type) {
      case 'song':
        this.router.navigate(['/top-songs']);
        break;
      case 'artist':
        this.router.navigate(['/artist-profile', item.id]);
        break;
      case 'genre':
        this.router.navigate(['/top-genres']);
        break;
    }
  }

  updateUserTable(): void {
    console.log('Updating User Table ...');
    this.UserService.updateUserTableRefreshToken()
      .pipe(take(1))
      .subscribe({
        next: (xomUser) => {
          console.log('Updated Xomify USER Table------', xomUser);
          this.wrappedEnrolled = xomUser.activeWrapped ?? false;
          this.releaseRadarEnrolled = xomUser.activeReleaseRadar ?? false;
          this.UserService.setReleaseRadarEnrollment(this.releaseRadarEnrolled);
          this.UserService.setWrappedEnrollment(this.wrappedEnrolled);
        },
        error: (err) => {
          console.error('Error Updating User Table', err);
        },
        complete: () => {
          console.log('User Table Updated.');
        },
      });
  }

  toggleWrapped(): void {
    console.log('Toggling Wrapped Enrollment...');
    this.wrappedEnrolled = !this.wrappedEnrolled;
    this.toggleEnrollments();
  }

  toggleReleaseRadar(): void {
    console.log('Toggling Release Radar Enrollment...');
    this.releaseRadarEnrolled = !this.releaseRadarEnrolled;
    this.toggleEnrollments();
  }

  toggleEnrollments(): void {
    if (this.maxReached) {
      return;
    }

    console.log('Updating Enrollments..');
    this.disableEnrollButtons = true;
    this.enrollAttempts++;

    this.UserService.updateUserTableEnrollments(
      this.wrappedEnrolled,
      this.releaseRadarEnrolled
    )
      .pipe(take(1))
      .subscribe({
        next: (xomUser) => {
          console.log('Updated Xomify USER Table------', xomUser);
          this.UserService.setReleaseRadarEnrollment(this.releaseRadarEnrolled);
          this.UserService.setWrappedEnrollment(this.wrappedEnrolled);
        },
        error: (err) => {
          console.error('Error Updating User Table', err);
          this.ToastService.showNegativeToast('Error Updating User Table');
          if (
            this.wrappedEnrolled !== this.UserService.getWrappedEnrollment()
          ) {
            this.wrappedEnrolled = !this.wrappedEnrolled;
          }
          if (
            this.releaseRadarEnrolled !==
            this.UserService.getReleaseRadarEnrollment()
          ) {
            this.releaseRadarEnrolled = !this.releaseRadarEnrolled;
          }
          this.disableEnrollButtons = false;
        },
        complete: () => {
          console.log('User Table Updated.');
          this.ToastService.showPositiveToast(
            'Preferences updated successfully!'
          );
          if (this.enrollAttempts >= this.maxEnrollAttempts) {
            this.maxReached = true;
            this.disableEnrollButtons = true;
          } else {
            setTimeout(() => {
              if (!this.maxReached) {
                this.disableEnrollButtons = false;
              }
            }, 1000);
          }
        },
      });
  }
}
