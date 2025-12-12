import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { UserService } from 'src/app/services/user.service';
import { ArtistService } from 'src/app/services/artist.service';
import { ToastService } from 'src/app/services/toast.service';
import { forkJoin, of } from 'rxjs';
import { catchError, take } from 'rxjs/operators';

interface Release {
  id: string;
  name: string;
  type: string;
  releaseDate: Date;
  releaseDateStr: string;
  images: any[];
  totalTracks: number;
  artist: {
    id: string;
    name: string;
    image?: string;
  };
  spotifyUrl: string;
}

interface CalendarDay {
  date: Date;
  dayOfMonth: number;
  isCurrentMonth: boolean;
  isToday: boolean;
  releases: Release[];
}

@Component({
  selector: 'app-release-calendar',
  templateUrl: './release-calendar.component.html',
  styleUrls: ['./release-calendar.component.scss'],
})
export class ReleaseCalendarComponent implements OnInit {
  loading = true;
  loadingProgress = 0;
  loadingMessage = 'Loading followed artists...';

  currentDate = new Date();
  viewDate = new Date();
  calendarDays: CalendarDay[] = [];

  allReleases: Release[] = [];
  selectedDay: CalendarDay | null = null;

  viewMode: 'calendar' | 'list' = 'calendar';
  filterType: 'all' | 'album' | 'single' = 'all';

  weekDays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  // Stats
  totalReleases = 0;
  albumCount = 0;
  singleCount = 0;
  artistsWithReleases = 0;

  constructor(
    private userService: UserService,
    private artistService: ArtistService,
    private toastService: ToastService,
    private router: Router
  ) {}

  ngOnInit(): void {
    this.loadReleases();
  }

  loadReleases(): void {
    this.loading = true;
    this.loadingProgress = 0;
    this.loadingMessage = 'Loading followed artists...';

    // First get all followed artists
    this.userService
      .getAllFollowedArtists()
      .pipe(take(1))
      .subscribe({
        next: (artists) => {
          if (artists.length === 0) {
            this.loading = false;
            this.buildCalendar();
            return;
          }

          this.loadingMessage = `Fetching releases from ${artists.length} artists...`;
          this.fetchArtistReleases(artists);
        },
        error: (err) => {
          console.error('Error loading followed artists', err);
          this.toastService.showNegativeToast('Error loading followed artists');
          this.loading = false;
        },
      });
  }

  fetchArtistReleases(artists: any[]): void {
    // Get releases from last 90 days and next 30 days
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - 90);

    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + 30);

    // Batch artists to avoid rate limits (process 5 at a time)
    const batchSize = 5;
    const batches: any[][] = [];

    for (let i = 0; i < artists.length; i += batchSize) {
      batches.push(artists.slice(i, i + batchSize));
    }

    let completedBatches = 0;
    const allReleases: Release[] = [];
    const artistsWithReleasesSet = new Set<string>();

    const processBatch = (batchIndex: number) => {
      if (batchIndex >= batches.length) {
        // All done
        this.allReleases = allReleases.sort(
          (a, b) => b.releaseDate.getTime() - a.releaseDate.getTime()
        );
        this.calculateStats(artistsWithReleasesSet);
        this.buildCalendar();
        this.loading = false;
        return;
      }

      const batch = batches[batchIndex];
      const requests = batch.map((artist) =>
        this.artistService
          .getArtistAlbums(artist.id, 20, 0, 'album,single')
          .pipe(catchError(() => of({ items: [] })))
      );

      forkJoin(requests).subscribe({
        next: (responses) => {
          responses.forEach((response: any, idx) => {
            const artist = batch[idx];
            const albums = response.items || [];

            albums.forEach((album: any) => {
              const releaseDate = this.parseReleaseDate(album.release_date);

              // Only include releases within our date range
              if (releaseDate >= cutoffDate && releaseDate <= futureDate) {
                artistsWithReleasesSet.add(artist.id);

                allReleases.push({
                  id: album.id,
                  name: album.name,
                  type: album.album_type,
                  releaseDate: releaseDate,
                  releaseDateStr: album.release_date,
                  images: album.images || [],
                  totalTracks: album.total_tracks,
                  artist: {
                    id: artist.id,
                    name: artist.name,
                    image: artist.images?.[0]?.url,
                  },
                  spotifyUrl: album.external_urls?.spotify,
                });
              }
            });
          });

          completedBatches++;
          this.loadingProgress = Math.round(
            (completedBatches / batches.length) * 100
          );
          this.loadingMessage = `Processing releases... ${this.loadingProgress}%`;

          // Small delay between batches to avoid rate limits
          setTimeout(() => processBatch(batchIndex + 1), 100);
        },
        error: () => {
          completedBatches++;
          setTimeout(() => processBatch(batchIndex + 1), 100);
        },
      });
    };

    processBatch(0);
  }

  parseReleaseDate(dateStr: string): Date {
    // Spotify dates can be YYYY, YYYY-MM, or YYYY-MM-DD
    const parts = dateStr.split('-');
    const year = parseInt(parts[0], 10);
    const month = parts[1] ? parseInt(parts[1], 10) - 1 : 0;
    const day = parts[2] ? parseInt(parts[2], 10) : 1;
    return new Date(year, month, day);
  }

  calculateStats(artistsSet: Set<string>): void {
    this.totalReleases = this.allReleases.length;
    this.albumCount = this.allReleases.filter((r) => r.type === 'album').length;
    this.singleCount = this.allReleases.filter(
      (r) => r.type === 'single'
    ).length;
    this.artistsWithReleases = artistsSet.size;
  }

  buildCalendar(): void {
    const year = this.viewDate.getFullYear();
    const month = this.viewDate.getMonth();

    // First day of month
    const firstDay = new Date(year, month, 1);
    // Last day of month
    const lastDay = new Date(year, month + 1, 0);

    // Start from the Sunday of the week containing the 1st
    const startDate = new Date(firstDay);
    startDate.setDate(startDate.getDate() - startDate.getDay());

    // End at the Saturday of the week containing the last day
    const endDate = new Date(lastDay);
    endDate.setDate(endDate.getDate() + (6 - endDate.getDay()));

    this.calendarDays = [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const currentDate = new Date(startDate);
    while (currentDate <= endDate) {
      const dayDate = new Date(currentDate);
      dayDate.setHours(0, 0, 0, 0);

      const dayReleases = this.getReleasesForDate(dayDate);

      this.calendarDays.push({
        date: dayDate,
        dayOfMonth: dayDate.getDate(),
        isCurrentMonth: dayDate.getMonth() === month,
        isToday: dayDate.getTime() === today.getTime(),
        releases: dayReleases,
      });

      currentDate.setDate(currentDate.getDate() + 1);
    }
  }

  getReleasesForDate(date: Date): Release[] {
    return this.allReleases.filter((release) => {
      const releaseDate = new Date(release.releaseDate);
      releaseDate.setHours(0, 0, 0, 0);

      const matchesDate = releaseDate.getTime() === date.getTime();
      const matchesFilter =
        this.filterType === 'all' || release.type === this.filterType;

      return matchesDate && matchesFilter;
    });
  }

  getFilteredReleases(): Release[] {
    if (this.filterType === 'all') {
      return this.allReleases;
    }
    return this.allReleases.filter((r) => r.type === this.filterType);
  }

  previousMonth(): void {
    this.viewDate = new Date(
      this.viewDate.getFullYear(),
      this.viewDate.getMonth() - 1,
      1
    );
    this.buildCalendar();
    this.selectedDay = null;
  }

  nextMonth(): void {
    this.viewDate = new Date(
      this.viewDate.getFullYear(),
      this.viewDate.getMonth() + 1,
      1
    );
    this.buildCalendar();
    this.selectedDay = null;
  }

  goToToday(): void {
    this.viewDate = new Date();
    this.buildCalendar();
    this.selectedDay = null;
  }

  selectDay(day: CalendarDay): void {
    if (day.releases.length > 0) {
      this.selectedDay = this.selectedDay === day ? null : day;
    }
  }

  clearSelectedDay(): void {
    this.selectedDay = null;
  }

  setFilterType(type: 'all' | 'album' | 'single'): void {
    this.filterType = type;
    this.buildCalendar();
  }

  setViewMode(mode: 'calendar' | 'list'): void {
    this.viewMode = mode;
    this.selectedDay = null;
  }

  goToAlbum(albumId: string): void {
    this.router.navigate(['/album', albumId]);
  }

  goToArtist(artistId: string): void {
    this.router.navigate(['/artist-profile', artistId]);
  }

  openInSpotify(url: string, event: Event): void {
    event.stopPropagation();
    window.open(url, '_blank');
  }

  getMonthName(): string {
    return this.viewDate.toLocaleString('default', {
      month: 'long',
      year: 'numeric',
    });
  }

  formatDate(date: Date): string {
    return date.toLocaleDateString('default', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
    });
  }

  getRelativeDate(date: Date): string {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const releaseDate = new Date(date);
    releaseDate.setHours(0, 0, 0, 0);

    const diffTime = releaseDate.getTime() - today.getTime();
    const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Tomorrow';
    if (diffDays === -1) return 'Yesterday';
    if (diffDays > 0) return `In ${diffDays} days`;
    return `${Math.abs(diffDays)} days ago`;
  }

  isUpcoming(date: Date): boolean {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return date >= today;
  }
}
