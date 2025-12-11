import { Component, OnInit, ViewChild, ElementRef, OnDestroy } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { ArtistService } from 'src/app/services/artist.service';
import { UserService } from 'src/app/services/user.service';
import { PlayerService } from 'src/app/services/player.service';
import { ToastService } from 'src/app/services/toast.service';
import { forkJoin, take, Subscription } from 'rxjs';

interface Artist {
  id?: string;
  name?: string;
  image?: string;
  images?: any[];
  genres?: string[];
  followers?: number;
  popularity?: number;
  external_urls?: { spotify?: string };
  topTracks?: any[];
  relatedArtists?: any[];
}

@Component({
  selector: 'app-artist-profile',
  templateUrl: './artist-profile.component.html',
  styleUrls: ['./artist-profile.component.scss']
})
export class ArtistProfileComponent implements OnInit, OnDestroy {
  @ViewChild('carouselTrack') carouselTrack!: ElementRef<HTMLDivElement>;
  
  artist: Artist = {};
  topTracks: any[] = [];
  relatedArtists: any[] = [];
  
  isLoading = true;
  error: string | null = null;
  
  // Follow state
  isFollowing = false;
  followLoading = false;
  
  // Ticker
  tickerPaused = false;
  
  // Carousel
  carouselPosition = 0;
  maxCarouselPosition = 0;
  
  private routeSub!: Subscription;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private artistService: ArtistService,
    private userService: UserService,
    private playerService: PlayerService,
    private toastService: ToastService
  ) {}

  ngOnInit(): void {
    // Support both route params (/artist/:id) and query params (/artist?id=xxx)
    this.routeSub = this.route.params.subscribe(params => {
      const artistId = params['id'];
      if (artistId) {
        this.loadArtistDetails(artistId);
      } else {
        // Fallback to query params for backwards compatibility
        this.route.queryParams.pipe(take(1)).subscribe(queryParams => {
          const queryId = queryParams['id'];
          if (queryId) {
            this.loadArtistDetails(queryId);
          } else {
            this.error = 'No artist ID provided';
            this.isLoading = false;
          }
        });
      }
    });
  }

  ngOnDestroy(): void {
    if (this.routeSub) {
      this.routeSub.unsubscribe();
    }
    this.playerService.stopSong();
  }

  loadArtist(): void {
    const id = this.route.snapshot.params['id'] || this.route.snapshot.queryParams['id'];
    if (id) {
      this.loadArtistDetails(id);
    }
  }

  private loadArtistDetails(artistId: string): void {
    this.isLoading = true;
    this.error = null;
    this.artist = { id: artistId, relatedArtists: [] };

    forkJoin({
      details: this.artistService.getArtistDetails(artistId),
      tracks: this.artistService.getArtistTopTracks(artistId),
      related: this.artistService.getRelatedArtists(artistId)
    }).pipe(take(1)).subscribe({
      next: (data) => {
        this.buildArtist(data.details, data.tracks, data.related);
        this.checkFollowStatus(artistId);
        this.isLoading = false;
      },
      error: (err) => {
        console.error('Error loading artist:', err);
        this.error = 'Failed to load artist. Please try again.';
        this.toastService.showNegativeToast('Failed to load artist');
        this.isLoading = false;
      }
    });
  }

  private buildArtist(details: any, tracks: any, related: any): void {
    this.artist = {
      id: details.id,
      name: details.name,
      image: details.images?.[0]?.url,
      images: details.images,
      genres: details.genres || [],
      followers: details.followers?.total || 0,
      popularity: details.popularity || 0,
      external_urls: details.external_urls,
      topTracks: [],
      relatedArtists: []
    };

    this.topTracks = (tracks.tracks || []).map((track: any) => ({
      id: track.id,
      name: track.name,
      album: track.album,
      duration_ms: track.duration_ms,
      popularity: track.popularity,
      preview_url: track.preview_url,
      artists: track.artists
    }));
    
    // Related artists from API
    this.relatedArtists = (related.artists || []).map((artist: any) => ({
      id: artist.id,
      name: artist.name,
      images: artist.images,
      genres: artist.genres,
      followers: artist.followers,
      popularity: artist.popularity
    }));
    
    this.calculateCarouselMax();
  }

  private checkFollowStatus(artistId: string): void {
    this.userService.checkFollowingArtists([artistId]).pipe(take(1)).subscribe({
      next: (result) => {
        // Result is an array of booleans
        this.isFollowing = result[0] === true;
      },
      error: (err) => {
        console.error('Error checking follow status:', err);
      }
    });
  }

  toggleFollow(): void {
    if (!this.artist.id || this.followLoading) return;
    
    this.followLoading = true;
    
    const action = this.isFollowing 
      ? this.userService.unfollowArtist(this.artist.id)
      : this.userService.followArtist(this.artist.id);
    
    action.pipe(take(1)).subscribe({
      next: () => {
        this.isFollowing = !this.isFollowing;
        this.toastService.showPositiveToast(
          this.isFollowing ? `Following ${this.artist.name}` : `Unfollowed ${this.artist.name}`
        );
        this.followLoading = false;
      },
      error: (err) => {
        console.error('Error toggling follow:', err);
        this.toastService.showNegativeToast('Failed to update follow status');
        this.followLoading = false;
      }
    });
  }

  goBack(): void {
    this.router.navigate(['/top-artists']);
  }

  formatNumber(num: number): string {
    if (num >= 1000000) {
      return (num / 1000000).toFixed(1) + 'M';
    } else if (num >= 1000) {
      return (num / 1000).toFixed(1) + 'K';
    }
    return num.toString();
  }

  formatDuration(ms: number): string {
    const minutes = Math.floor(ms / 60000);
    const seconds = Math.floor((ms % 60000) / 1000);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  }

  onTrackHover(track: any): void {
    this.playerService.playerReady$.pipe(take(1)).subscribe(ready => {
      if (ready) {
        this.playerService.playSong(track.id);
      }
    });
  }

  onTrackLeave(): void {
    this.playerService.playerReady$.pipe(take(1)).subscribe(ready => {
      if (ready) {
        this.playerService.stopSong();
      }
    });
  }

  scrollCarousel(direction: 'prev' | 'next'): void {
    if (!this.carouselTrack) return;
    
    const track = this.carouselTrack.nativeElement;
    const cardWidth = 180; // card width + gap
    const scrollAmount = cardWidth * 3;
    
    if (direction === 'next') {
      track.scrollLeft += scrollAmount;
      this.carouselPosition = Math.min(this.carouselPosition + 1, this.maxCarouselPosition);
    } else {
      track.scrollLeft -= scrollAmount;
      this.carouselPosition = Math.max(this.carouselPosition - 1, 0);
    }
  }

  private calculateCarouselMax(): void {
    const visibleCards = 5;
    this.maxCarouselPosition = Math.max(0, Math.ceil((this.relatedArtists.length - visibleCards) / 3));
  }
}
