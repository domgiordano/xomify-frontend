import { Component, OnInit, ViewChild } from '@angular/core';
import { Router } from '@angular/router';
import { UserService } from 'src/app/services/user.service';
import { WrappedService } from 'src/app/services/wrapped.service';
import { SongService } from 'src/app/services/song.service';
import { ArtistService } from 'src/app/services/artist.service';
import { PlayerService } from 'src/app/services/player.service';
import { ToastService } from 'src/app/services/toast.service';
import { QueueService, QueueTrack } from 'src/app/services/queue.service';
import { RatingsService } from 'src/app/services/ratings.service';
import {
  SongDetailModalComponent,
  SongDetailTrack,
} from 'src/app/components/song-detail-modal/song-detail-modal.component';
import { forkJoin, of } from 'rxjs';
import { take, catchError } from 'rxjs/operators';

interface MonthlyWrap {
  month: string;
  year: number;
  monthKey: string; // e.g., "2024-11"
  topSongIds: { short_term: string[]; medium_term: string[]; long_term: string[] };
  topArtistIds: { short_term: string[]; medium_term: string[]; long_term: string[] };
  topGenres: { 
    short_term: { [genre: string]: number }; 
    medium_term: { [genre: string]: number }; 
    long_term: { [genre: string]: number }; 
  };
}

interface DisplayTrack {
  id: string;
  name: string;
  artists: { id: string; name: string }[];
  album: { id: string; name: string; images: { url: string }[] };
  duration_ms: number;
}

interface DisplayArtist {
  id: string;
  name: string;
  images: { url: string }[];
  genres: string[];
}

@Component({
  selector: 'app-wrapped',
  templateUrl: './wrapped.component.html',
  styleUrls: ['./wrapped.component.scss']
})
export class WrappedComponent implements OnInit {
  @ViewChild('songDetailModal') songDetailModal!: SongDetailModalComponent;

  loading = true;
  loadingDetails = false;
  error: string | null = null;
  
  // Enrollment state
  isEnrolled = false;
  enrollmentLoading = false;
  
  // Monthly wraps
  availableWraps: MonthlyWrap[] = [];
  selectedWrap: MonthlyWrap | null = null;
  
  // Always use short_term (Last 4 Weeks) - no longer selectable
  private readonly selectedTerm: 'short_term' = 'short_term';
  
  // Display data for selected month
  displayTracks: DisplayTrack[] = [];
  displayArtists: DisplayArtist[] = [];
  displayGenres: { name: string; count: number }[] = [];
  
  // View mode
  viewMode: 'tracks' | 'artists' | 'genres' = 'tracks';

  constructor(
    private router: Router,
    private userService: UserService,
    private wrappedService: WrappedService,
    private songService: SongService,
    private artistService: ArtistService,
    private playerService: PlayerService,
    private queueService: QueueService,
    private toastService: ToastService,
    private ratingsService: RatingsService
  ) {}

  ngOnInit(): void {
    // Get enrollment status from user service (same pattern as Release Radar)
    this.isEnrolled = this.userService.getWrappedEnrollment();
    this.loadWrappedData();
  }

  toggleEnrollment(): void {
    this.enrollmentLoading = true;
    const newStatus = !this.isEnrolled;
    
    this.userService.updateUserTableEnrollments(
      newStatus,
      this.userService.getReleaseRadarEnrollment()
    ).pipe(take(1)).subscribe({
      next: () => {
        this.isEnrolled = newStatus;
        this.userService.setWrappedEnrollment(newStatus);
        this.toastService.showPositiveToast(
          newStatus ? 'Enrolled in Monthly Wrapped!' : 'Unenrolled from Monthly Wrapped'
        );
        this.enrollmentLoading = false;
      },
      error: (err) => {
        console.error('Error updating enrollment:', err);
        this.toastService.showNegativeToast('Failed to update enrollment');
        this.enrollmentLoading = false;
      }
    });
  }

  loadWrappedData(): void {
    this.loading = true;
    this.error = null;
    
    const email = this.userService.getEmail();
    if (!email) {
      this.loading = false;
      return;
    }

    this.wrappedService.getUserWrappedData(email).pipe(
      take(1),
      catchError((err) => {
        console.error('Error loading wrapped data:', err);
        return of(null);
      })
    ).subscribe({
      next: (data: any) => {
        if (data && data.wraps && Array.isArray(data.wraps)) {
          this.availableWraps = this.parseWrapsData(data.wraps);
          
          // Auto-select most recent wrap
          if (this.availableWraps.length > 0) {
            this.selectWrap(this.availableWraps[0]);
          }
        }
        this.loading = false;
      },
      error: () => {
        this.loading = false;
      }
    });
  }

  private parseWrapsData(wraps: any[]): MonthlyWrap[] {
    const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 
                        'July', 'August', 'September', 'October', 'November', 'December'];
    
    return wraps.map(wrap => {
      const [year, month] = wrap.monthKey.split('-').map(Number);
      return {
        month: monthNames[month - 1],
        year: year,
        monthKey: wrap.monthKey,
        topSongIds: wrap.topSongIds || { short_term: [], medium_term: [], long_term: [] },
        topArtistIds: wrap.topArtistIds || { short_term: [], medium_term: [], long_term: [] },
        topGenres: wrap.topGenres || { short_term: {}, medium_term: {}, long_term: {} }
      };
    }).sort((a, b) => {
      // Sort by most recent first
      const dateA = new Date(a.year, parseInt(a.monthKey.split('-')[1]) - 1);
      const dateB = new Date(b.year, parseInt(b.monthKey.split('-')[1]) - 1);
      return dateB.getTime() - dateA.getTime();
    });
  }

  selectWrap(wrap: MonthlyWrap): void {
    this.selectedWrap = wrap;
    this.loadWrapDetails();
  }

  selectWrapByMonthKey(monthKey: string): void {
    const wrap = this.availableWraps.find(w => w.monthKey === monthKey);
    if (wrap) {
      this.selectWrap(wrap);
    }
  }

  setViewMode(mode: 'tracks' | 'artists' | 'genres'): void {
    this.viewMode = mode;
  }

  private loadWrapDetails(): void {
    if (!this.selectedWrap) return;
    
    this.loadingDetails = true;
    
    // Always use short_term data (Last 4 Weeks / that month's data)
    const songIds = this.selectedWrap.topSongIds[this.selectedTerm] || [];
    const artistIds = this.selectedWrap.topArtistIds[this.selectedTerm] || [];
    const genresData = this.selectedWrap.topGenres[this.selectedTerm] || {};

    // Process genres - convert from { genre: count } to array sorted by count
    this.displayGenres = Object.entries(genresData)
      .map(([name, count]) => ({ name, count: count as number }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10); // Top 10 genres

    // Fetch track and artist details from Spotify
    const requests: any = {};
    
    if (songIds.length > 0) {
      // Spotify allows max 50 IDs per request
      requests.tracks = this.songService.getTracksByIds(songIds.slice(0, 50).join(','));
    }
    
    if (artistIds.length > 0) {
      requests.artists = this.artistService.getArtistsByIds(artistIds.slice(0, 50).join(','));
    }

    if (Object.keys(requests).length === 0) {
      this.displayTracks = [];
      this.displayArtists = [];
      this.loadingDetails = false;
      return;
    }

    forkJoin(requests).pipe(
      take(1),
      catchError(() => of({ tracks: { tracks: [] }, artists: { artists: [] } }))
    ).subscribe({
      next: (data: any) => {
        this.displayTracks = (data.tracks?.tracks || []).map((track: any) => ({
          id: track.id,
          name: track.name,
          artists: track.artists,
          album: track.album,
          duration_ms: track.duration_ms
        }));

        this.displayArtists = (data.artists?.artists || []).map((artist: any) => ({
          id: artist.id,
          name: artist.name,
          images: artist.images,
          genres: artist.genres
        }));

        this.loadingDetails = false;
      },
      error: () => {
        this.loadingDetails = false;
      }
    });
  }

  goToArtist(artistId: string): void {
    this.router.navigate(['/artist-profile', artistId]);
  }

  goToAlbum(albumId: string): void {
    this.router.navigate(['/album', albumId]);
  }

  openInSpotify(type: 'track' | 'artist', id: string, event?: Event): void {
    if (event) event.stopPropagation();
    window.open(`https://open.spotify.com/${type}/${id}`, '_blank');
  }

  formatDuration(ms: number): string {
    const minutes = Math.floor(ms / 60000);
    const seconds = Math.floor((ms % 60000) / 1000);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  }

  getPreviousMonth(): void {
    const currentIndex = this.availableWraps.findIndex(w => w.monthKey === this.selectedWrap?.monthKey);
    if (currentIndex < this.availableWraps.length - 1) {
      this.selectWrap(this.availableWraps[currentIndex + 1]);
    }
  }

  getNextMonth(): void {
    const currentIndex = this.availableWraps.findIndex(w => w.monthKey === this.selectedWrap?.monthKey);
    if (currentIndex > 0) {
      this.selectWrap(this.availableWraps[currentIndex - 1]);
    }
  }

  hasPreviousMonth(): boolean {
    const currentIndex = this.availableWraps.findIndex(w => w.monthKey === this.selectedWrap?.monthKey);
    return currentIndex < this.availableWraps.length - 1;
  }

  hasNextMonth(): boolean {
    const currentIndex = this.availableWraps.findIndex(w => w.monthKey === this.selectedWrap?.monthKey);
    return currentIndex > 0;
  }

  // ============================================
  // Queue Management
  // ============================================

  getQueueTrack(track: DisplayTrack): QueueTrack {
    return {
      id: track.id,
      name: track.name,
      artists: track.artists || [],
      album: track.album || { id: '', name: '', images: [] },
      duration_ms: track.duration_ms,
      external_urls: undefined,
    };
  }

  addToSpotifyQueue(track: DisplayTrack, event: Event): void {
    event.stopPropagation();
    this.playerService.addToSpotifyQueue(track.id).pipe(take(1)).subscribe({
      next: (success) => {
        if (success) {
          this.toastService.showPositiveToast(`Added "${track.name}" to Spotify queue`);
        } else {
          this.toastService.showNegativeToast('Could not add to queue. Open Spotify on any device and try again.');
        }
      },
      error: () => {
        this.toastService.showNegativeToast('Error adding to queue. Check console for details.');
      },
    });
  }

  addToPlaylistBuilder(track: DisplayTrack, event: Event): void {
    event.stopPropagation();

    const queueTrack: QueueTrack = {
      id: track.id,
      name: track.name,
      artists: track.artists || [],
      album: track.album || { id: '', name: '', images: [] },
      duration_ms: track.duration_ms,
      external_urls: undefined,
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

  // ============================================
  // Rating Methods
  // ============================================

  openSongDetail(track: DisplayTrack, event: Event): void {
    event.stopPropagation();
    const detailTrack: SongDetailTrack = {
      id: track.id,
      name: track.name,
      artists: track.artists || [],
      album: track.album || { id: '', name: '', images: [] },
      duration_ms: track.duration_ms,
    };
    this.songDetailModal.open(detailTrack);
  }

  getRating(trackId: string): number {
    return this.ratingsService.getCachedRating(trackId);
  }

  isRated(trackId: string): boolean {
    return this.ratingsService.isRated(trackId);
  }
}
