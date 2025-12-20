import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { UserService } from 'src/app/services/user.service';
import { ArtistService } from 'src/app/services/artist.service';
import { ToastService } from 'src/app/services/toast.service';
import { forkJoin, Observable, of } from 'rxjs';
import { catchError, switchMap, take } from 'rxjs/operators';

interface CalendarDay {
  date: Date;
  dayOfMonth: number;
  isCurrentMonth: boolean;
  isToday: boolean;
  releases: any[];
}

interface WeekOption {
  label: string;
  startDate: Date;
  endDate: Date;
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

  // Week filter for list view
  weekOptions: WeekOption[] = [];
  selectedWeekIndex: number = 0; // 0 = This Week

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
    this.buildWeekOptions();
    this.loadReleases();
  }

  /**
   * Build week options for the dropdown filter.
   * "This Week" = last 7 days, "Last Week" = 8-14 days ago, etc.
   */
  private buildWeekOptions(): void {
    this.weekOptions = [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    for (let i = 0; i < 8; i++) {
      // Each "week" is a 7-day window going backwards
      const endDate = new Date(today);
      endDate.setDate(today.getDate() - i * 7);

      const startDate = new Date(endDate);
      startDate.setDate(endDate.getDate() - 6);

      let label: string;
      if (i === 0) {
        label = 'This Week';
      } else if (i === 1) {
        label = 'Last Week';
      } else {
        label = this.formatWeekLabel(startDate, endDate);
      }

      this.weekOptions.push({ label, startDate, endDate });
    }
  }

  private formatWeekLabel(start: Date, end: Date): string {
    const startMonth = start.toLocaleDateString('en-US', { month: 'short' });
    const endMonth = end.toLocaleDateString('en-US', { month: 'short' });

    if (startMonth === endMonth) {
      return `${startMonth} ${start.getDate()} - ${end.getDate()}`;
    } else {
      return `${startMonth} ${start.getDate()} - ${endMonth} ${end.getDate()}`;
    }
  }

  setWeekFilter(index: number): void {
    this.selectedWeekIndex = index;
    this.applyFilter();
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

  // =====================================================
  // loadReleases - fetches ALL followed artists and each
  // release type separately to avoid Spotify sorting issue
  // =====================================================
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

    // Get ALL followed artists (paginated), then fetch their albums
    this.getAllFollowedArtists()
      .pipe(
        switchMap((artists: any[]) => {
          console.log('Total followed artists:', artists.length);

          if (artists.length === 0) {
            return of([]);
          }

          // Fetch albums, singles, and appears_on SEPARATELY for each artist
          // This avoids Spotify's issue where include_groups=album,single
          // returns all albums first, then all singles (not by release date)
          const releaseTypes = ['album', 'single', 'appears_on'];
          const allRequests: any[] = [];

          artists.forEach((artist: any) => {
            releaseTypes.forEach((type) => {
              allRequests.push(
                this.artistService
                  .getArtistAlbums(artist.id, 10, 0, type)
                  .pipe(catchError(() => of({ items: [] })))
              );
            });
          });

          console.log('Making', allRequests.length, 'API calls for releases');
          return forkJoin(allRequests);
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

          console.log('Total unique releases found:', allReleases.length);

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

  /**
   * Get ALL followed artists using cursor-based pagination
   */
  private getAllFollowedArtists(): Observable<any[]> {
    return new Observable((observer) => {
      const allArtists: any[] = [];

      const fetchPage = (after?: string) => {
        this.userService.getFollowedArtists(50, after).subscribe({
          next: (response: any) => {
            const artists = response.artists?.items || [];
            allArtists.push(...artists);

            // Check for next page using cursor
            const nextCursor = response.artists?.cursors?.after;
            if (nextCursor && artists.length === 50) {
              fetchPage(nextCursor);
            } else {
              observer.next(allArtists);
              observer.complete();
            }
          },
          error: (err) => {
            console.error('Error fetching followed artists:', err);
            // Return what we have so far
            observer.next(allArtists);
            observer.complete();
          },
        });
      };

      fetchPage();
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
    let filtered = [...this.releases];

    // Apply type filter
    if (this.filterType !== 'all') {
      filtered = filtered.filter((r) => r.album_type === this.filterType);
    }

    // Apply week filter (only in list view)
    if (this.viewMode === 'list' && this.weekOptions.length > 0) {
      const week = this.weekOptions[this.selectedWeekIndex];
      if (week) {
        filtered = filtered.filter((r) => {
          const releaseDate = new Date(r.releaseDate);
          releaseDate.setHours(0, 0, 0, 0);
          return releaseDate >= week.startDate && releaseDate <= week.endDate;
        });
      }
    }

    this.filteredReleases = filtered;
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

    // For calendar, use type-filtered releases (not week-filtered)
    const calendarReleases =
      this.filterType === 'all'
        ? this.releases
        : this.releases.filter((r) => r.album_type === this.filterType);

    while (current <= endDate) {
      const dayReleases = this.getReleasesForDate(current, calendarReleases);
      let currentDate = new Date(current);
      this.calendarDays.push({
        date: currentDate,
        dayOfMonth: current.getDate(),
        isCurrentMonth: current.getMonth() === month,
        isToday: current.getTime() === today.getTime(),
        releases: dayReleases,
      });
      if (
        today.getDate() == currentDate.getDate() &&
        today.getMonth() === currentDate.getMonth()
      ) {
        this.selectedDay = this.calendarDays[this.calendarDays.length - 1];
      }
      current.setDate(current.getDate() + 1);
    }
  }

  private getReleasesForDate(date: Date, releases: any[]): any[] {
    const dateStr = date.toISOString().split('T')[0];
    return releases.filter((release) => {
      const releaseStr = release.release_date;
      return releaseStr === dateStr;
    });
  }

  // Cache methods - uses sessionStorage so cache clears when browser closes
  private getCache(): CachedData | null {
    try {
      const cached = sessionStorage.getItem(this.CACHE_KEY);
      if (!cached) return null;

      const data: CachedData = JSON.parse(cached);
      const now = Date.now();

      if (now - data.timestamp > this.CACHE_TTL) {
        sessionStorage.removeItem(this.CACHE_KEY);
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
    sessionStorage.setItem(this.CACHE_KEY, JSON.stringify(data));
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
    this.applyFilter();
  }

  refresh(): void {
    sessionStorage.removeItem(this.CACHE_KEY);
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

  getSelectedWeekCount(): number {
    if (this.weekOptions.length === 0) return 0;
    const week = this.weekOptions[this.selectedWeekIndex];
    if (!week) return 0;

    let releases = this.releases;
    if (this.filterType !== 'all') {
      releases = releases.filter((r) => r.album_type === this.filterType);
    }

    return releases.filter((r) => {
      const releaseDate = new Date(r.releaseDate);
      releaseDate.setHours(0, 0, 0, 0);
      return releaseDate >= week.startDate && releaseDate <= week.endDate;
    }).length;
  }
}
