import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { UserService } from 'src/app/services/user.service';
import { ArtistService } from 'src/app/services/artist.service';
import { ToastService } from 'src/app/services/toast.service';
import { forkJoin, of } from 'rxjs';
import { catchError, switchMap, take } from 'rxjs/operators';

interface CalendarDay {
  date: Date;
  dayOfMonth: number;
  isCurrentMonth: boolean;
  isToday: boolean;
  releases: any[];
}

interface CachedData {
  releases: any[];
  timestamp: number;
  artistIds: string[];
}

@Component({
  selector: 'app-release-radar',
  templateUrl: './release-radar.component.html',
  styleUrls: ['./release-radar.component.scss'],
})
export class ReleaseRadarComponent implements OnInit {
  releases: any[] = [];
  filteredReleases: any[] = [];
  loading = true;
  error: string | null = null;

  // Enrollment state
  isEnrolled = false;
  enrollmentLoading = false;

  viewMode: 'calendar' | 'list' = 'calendar';
  filterType: 'all' | 'album' | 'single' = 'all';

  // Calendar state
  viewDate = new Date();
  calendarDays: CalendarDay[] = [];
  selectedDay: CalendarDay | null = null;
  weekDays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  // Stats
  totalReleases = 0;
  albumCount = 0;
  singleCount = 0;
  upcomingCount = 0;

  // Cache settings
  private readonly CACHE_KEY = 'xomify_release_radar';
  private readonly CACHE_TTL = 30 * 60 * 1000; // 30 minutes

  constructor(
    private router: Router,
    private userService: UserService,
    private artistService: ArtistService,
    private toastService: ToastService
  ) {}

  ngOnInit(): void {
    this.isEnrolled = this.userService.getReleaseRadarEnrollment();
    this.loadReleases();
  }

  toggleEnrollment(): void {
    this.enrollmentLoading = true;
    const newStatus = !this.isEnrolled;

    this.userService
      .updateUserTableEnrollments(
        this.userService.getWrappedEnrollment(),
        newStatus
      )
      .pipe(take(1))
      .subscribe({
        next: () => {
          this.isEnrolled = newStatus;
          this.userService.setReleaseRadarEnrollment(newStatus);
          this.toastService.showPositiveToast(
            newStatus
              ? 'Enrolled in Release Radar!'
              : 'Unenrolled from Release Radar'
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

  loadReleases(forceRefresh = false): void {
    // Check cache first
    if (!forceRefresh) {
      const cached = this.getCache();
      if (cached) {
        this.releases = cached.releases;
        this.processReleases();
        this.loading = false;
        return;
      }
    }

    this.loading = true;
    this.error = null;

    // Get followed artists, then fetch their albums
    this.userService
      .getFollowedArtists(50)
      .pipe(
        switchMap((response: any) => {
          const artists = response.artists?.items || [];
          if (artists.length === 0) {
            return of([]);
          }

          // Fetch albums for each artist (last 6 months)
          const albumRequests = artists.map((artist: any) =>
            this.artistService
              .getArtistAlbums(artist.id, 20)
              .pipe(catchError(() => of({ items: [] })))
          );

          return forkJoin(albumRequests);
        })
      )
      .subscribe({
        next: (albumsResponses: any) => {
          const sixMonthsAgo = new Date();
          sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

          // Flatten and filter releases from last 6 months
          const allReleases: any[] = [];
          const seenIds = new Set<string>();

          albumsResponses.forEach((response: any) => {
            const albums = response.items || [];
            albums.forEach((album: any) => {
              if (seenIds.has(album.id)) return;

              const releaseDate = new Date(album.release_date);
              if (releaseDate >= sixMonthsAgo) {
                seenIds.add(album.id);
                allReleases.push({
                  ...album,
                  releaseDate,
                  type: album.album_type,
                });
              }
            });
          });

          // Sort by release date (newest first)
          this.releases = allReleases.sort(
            (a, b) => b.releaseDate.getTime() - a.releaseDate.getTime()
          );

          // Cache results
          this.setCache(this.releases);

          this.processReleases();
          this.loading = false;

          if (forceRefresh) {
            this.toastService.showPositiveToast('Releases refreshed');
          }
        },
        error: (err) => {
          console.error('Error loading releases:', err);
          this.error = 'Failed to load releases. Please try again.';
          this.loading = false;
        },
      });
  }

  private processReleases(): void {
    // Calculate stats
    this.totalReleases = this.releases.length;
    this.albumCount = this.releases.filter(
      (r) => r.album_type === 'album'
    ).length;
    this.singleCount = this.releases.filter(
      (r) => r.album_type === 'single'
    ).length;

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    this.upcomingCount = this.releases.filter(
      (r) => r.releaseDate >= today
    ).length;

    this.applyFilter();
    this.buildCalendar();
  }

  private applyFilter(): void {
    if (this.filterType === 'all') {
      this.filteredReleases = [...this.releases];
    } else {
      this.filteredReleases = this.releases.filter(
        (r) => r.album_type === this.filterType
      );
    }
  }

  buildCalendar(): void {
    const year = this.viewDate.getFullYear();
    const month = this.viewDate.getMonth();

    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);

    const startDate = new Date(firstDay);
    startDate.setDate(startDate.getDate() - startDate.getDay());

    const endDate = new Date(lastDay);
    endDate.setDate(endDate.getDate() + (6 - endDate.getDay()));

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    this.calendarDays = [];
    const current = new Date(startDate);

    while (current <= endDate) {
      const dayReleases = this.getReleasesForDate(current);
      let currentDate = new Date(current);
      this.calendarDays.push({
        date: currentDate,
        dayOfMonth: current.getDate(),
        isCurrentMonth: current.getMonth() === month,
        isToday: current.getTime() === today.getTime(),
        releases: dayReleases,
      });
      if (today.getDate() == currentDate.getDate()) {
        this.selectedDay = this.calendarDays[this.calendarDays.length - 1];
      }
      current.setDate(current.getDate() + 1);
    }
  }

  private getReleasesForDate(date: Date): any[] {
    const dateStr = date.toISOString().split('T')[0];
    return this.filteredReleases.filter((release) => {
      const releaseStr = release.release_date;
      return releaseStr === dateStr;
    });
  }

  // Cache methods
  private getCache(): CachedData | null {
    try {
      const cached = localStorage.getItem(this.CACHE_KEY);
      if (!cached) return null;

      const data: CachedData = JSON.parse(cached);
      const now = Date.now();

      if (now - data.timestamp > this.CACHE_TTL) {
        localStorage.removeItem(this.CACHE_KEY);
        return null;
      }

      // Restore Date objects
      data.releases = data.releases.map((r) => ({
        ...r,
        releaseDate: new Date(r.releaseDate),
      }));

      return data;
    } catch {
      return null;
    }
  }

  private setCache(releases: any[]): void {
    const data: CachedData = {
      releases,
      timestamp: Date.now(),
      artistIds: [],
    };
    localStorage.setItem(this.CACHE_KEY, JSON.stringify(data));
  }

  // Navigation
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

  setFilterType(type: 'all' | 'album' | 'single'): void {
    this.filterType = type;
    this.applyFilter();
    this.buildCalendar();
  }

  setViewMode(mode: 'calendar' | 'list'): void {
    this.viewMode = mode;
    this.selectedDay = null;
  }

  refresh(): void {
    this.loadReleases(true);
  }

  goToAlbum(albumId: string): void {
    this.router.navigate(['/album', albumId]);
  }

  goToArtist(artistId: string, event?: Event): void {
    if (event) {
      event.stopPropagation();
    }
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

  formatReleaseDate(dateString: string): string {
    if (!dateString) return '';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  }

  getRelativeDate(release: any): string {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const releaseDate = new Date(release.releaseDate);
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
