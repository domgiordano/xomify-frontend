import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { UserService } from 'src/app/services/user.service';
import { WrappedService } from 'src/app/services/wrapped.service';
import { SongService } from 'src/app/services/song.service';
import { ArtistService } from 'src/app/services/artist.service';
import { ToastService } from 'src/app/services/toast.service';
import { forkJoin, of } from 'rxjs';
import { take, catchError } from 'rxjs/operators';

interface MonthlyWrap {
  month: string;
  year: number;
  monthKey: string; // e.g., "2024-11"
  topSongIds: { short_term: string[]; med_term: string[]; long_term: string[] };
  topArtistIds: {
    short_term: string[];
    med_term: string[];
    long_term: string[];
  };
  topGenres: { short_term: string[]; med_term: string[]; long_term: string[] };
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
  styleUrls: ['./wrapped.component.scss'],
})
export class WrappedComponent implements OnInit {
  loading = true;
  loadingDetails = false;
  error: string | null = null;

  // Enrollment state
  isEnrolled = false;
  enrollmentLoading = false;

  // Monthly wraps
  availableWraps: MonthlyWrap[] = [];
  selectedWrap: MonthlyWrap | null = null;
  selectedTerm: 'short_term' | 'med_term' | 'long_term' = 'short_term';

  // Display data for selected month
  displayTracks: DisplayTrack[] = [];
  displayArtists: DisplayArtist[] = [];
  displayGenres: { name: string; count: number }[] = [];

  // View mode
  viewMode: 'tracks' | 'artists' | 'genres' = 'tracks';

  termLabels = {
    short_term: 'Last 4 Weeks',
    med_term: 'Last 6 Months',
    long_term: 'All Time',
  };

  constructor(
    private router: Router,
    private userService: UserService,
    private wrappedService: WrappedService,
    private songService: SongService,
    private artistService: ArtistService,
    private toastService: ToastService
  ) {}

  ngOnInit(): void {
    this.isEnrolled = this.userService.getWrappedEnrollment();
    this.loadWrappedData();
  }

  toggleEnrollment(): void {
    this.enrollmentLoading = true;
    const newStatus = !this.isEnrolled;

    this.userService
      .updateUserTableEnrollments(
        newStatus,
        this.userService.getReleaseRadarEnrollment()
      )
      .pipe(take(1))
      .subscribe({
        next: () => {
          this.isEnrolled = newStatus;
          this.userService.setWrappedEnrollment(newStatus);
          this.toastService.showPositiveToast(
            newStatus
              ? 'Enrolled in Monthly Wrapped!'
              : 'Unenrolled from Monthly Wrapped'
          );
          this.enrollmentLoading = false;
        },
        error: (err) => {
          console.error('Error updating enrollment:', err);
          this.toastService.showNegativeToast('Failed to update enrollment');
          this.enrollmentLoading = false;
        },
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

    this.wrappedService
      .getUserWrappedData(email)
      .pipe(
        take(1),
        catchError((err) => {
          console.error('Error loading wrapped data:', err);
          return of(null);
        })
      )
      .subscribe({
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
        },
      });
  }

  private parseWrapsData(wraps: any[]): MonthlyWrap[] {
    const monthNames = [
      'January',
      'February',
      'March',
      'April',
      'May',
      'June',
      'July',
      'August',
      'September',
      'October',
      'November',
      'December',
    ];

    return wraps
      .map((wrap) => {
        const [year, month] = wrap.monthKey.split('-').map(Number);
        return {
          month: monthNames[month - 1],
          year: year,
          monthKey: wrap.monthKey,
          topSongIds: wrap.topSongIds || {
            short_term: [],
            med_term: [],
            long_term: [],
          },
          topArtistIds: wrap.topArtistIds || {
            short_term: [],
            med_term: [],
            long_term: [],
          },
          topGenres: wrap.topGenres || {
            short_term: [],
            med_term: [],
            long_term: [],
          },
        };
      })
      .sort((a, b) => {
        // Sort by most recent first
        const dateA = new Date(a.year, parseInt(a.monthKey.split('-')[1]) - 1);
        const dateB = new Date(b.year, parseInt(b.monthKey.split('-')[1]) - 1);
        return dateB.getTime() - dateA.getTime();
      });
  }

  handleMonthChange(monthKey: string) {
    const wrap = this.availableWraps.find((w) => w.monthKey === monthKey);
    if (wrap) {
      this.selectWrap(wrap);
    }
  }
  selectWrap(wrap: MonthlyWrap): void {
    this.selectedWrap = wrap;
    this.loadWrapDetails();
  }

  selectTerm(term: 'short_term' | 'med_term' | 'long_term'): void {
    this.selectedTerm = term;
    this.loadWrapDetails();
  }

  setViewMode(mode: 'tracks' | 'artists' | 'genres'): void {
    this.viewMode = mode;
  }

  private loadWrapDetails(): void {
    if (!this.selectedWrap) return;

    this.loadingDetails = true;

    const songIds = this.selectedWrap.topSongIds[this.selectedTerm] || [];
    const artistIds = this.selectedWrap.topArtistIds[this.selectedTerm] || [];
    const genres = this.selectedWrap.topGenres[this.selectedTerm] || [];

    // Process genres immediately (they're just strings)
    this.displayGenres = genres.map((genre: string, index: number) => ({
      name: genre,
      count: genres.length - index, // Fake count for visual ranking
    }));

    // Fetch track and artist details from Spotify
    const requests: any = {};

    if (songIds.length > 0) {
      // Spotify allows max 50 IDs per request
      requests.tracks = this.songService.getTracksByIds(
        songIds.slice(0, 50).join(',')
      );
    }

    if (artistIds.length > 0) {
      requests.artists = this.artistService.getArtistsByIds(
        artistIds.slice(0, 50).join(',')
      );
    }

    if (Object.keys(requests).length === 0) {
      this.displayTracks = [];
      this.displayArtists = [];
      this.loadingDetails = false;
      return;
    }

    forkJoin(requests)
      .pipe(
        take(1),
        catchError(() =>
          of({ tracks: { tracks: [] }, artists: { artists: [] } })
        )
      )
      .subscribe({
        next: (data: any) => {
          this.displayTracks = (data.tracks?.tracks || []).map(
            (track: any) => ({
              id: track.id,
              name: track.name,
              artists: track.artists,
              album: track.album,
              duration_ms: track.duration_ms,
            })
          );

          this.displayArtists = (data.artists?.artists || []).map(
            (artist: any) => ({
              id: artist.id,
              name: artist.name,
              images: artist.images,
              genres: artist.genres,
            })
          );

          this.loadingDetails = false;
        },
        error: () => {
          this.loadingDetails = false;
        },
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
    const currentIndex = this.availableWraps.findIndex(
      (w) => w.monthKey === this.selectedWrap?.monthKey
    );
    if (currentIndex < this.availableWraps.length - 1) {
      this.selectWrap(this.availableWraps[currentIndex + 1]);
    }
  }

  getNextMonth(): void {
    const currentIndex = this.availableWraps.findIndex(
      (w) => w.monthKey === this.selectedWrap?.monthKey
    );
    if (currentIndex > 0) {
      this.selectWrap(this.availableWraps[currentIndex - 1]);
    }
  }

  hasPreviousMonth(): boolean {
    const currentIndex = this.availableWraps.findIndex(
      (w) => w.monthKey === this.selectedWrap?.monthKey
    );
    return currentIndex < this.availableWraps.length - 1;
  }

  hasNextMonth(): boolean {
    const currentIndex = this.availableWraps.findIndex(
      (w) => w.monthKey === this.selectedWrap?.monthKey
    );
    return currentIndex > 0;
  }
}
