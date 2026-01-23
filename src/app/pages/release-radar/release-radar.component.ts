import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { UserService } from 'src/app/services/user.service';
import { PlayerService } from 'src/app/services/player.service';
import { ToastService } from 'src/app/services/toast.service';
import { QueueService, QueueTrack } from 'src/app/services/queue.service';
import { AlbumService } from 'src/app/services/album.service';
import {
  ReleaseRadarService,
  ReleaseRadarHistoryResponse,
  ReleaseRadarRelease,
  ReleaseRadarWeek,
} from 'src/app/services/release-radar.service';
import { take, catchError } from 'rxjs/operators';
import { of } from 'rxjs';

interface CalendarDay {
  date: Date;
  dayOfMonth: number;
  isCurrentMonth: boolean;
  isToday: boolean;
  releases: ReleaseRadarRelease[];
}

interface WeekOption {
  weekKey: string;
  label: string;
}

@Component({
  selector: 'app-release-radar',
  templateUrl: './release-radar.component.html',
  styleUrls: ['./release-radar.component.scss'],
})
export class ReleaseRadarComponent implements OnInit {
  // Data
  history: ReleaseRadarHistoryResponse | null = null;
  releases: ReleaseRadarRelease[] = [];
  filteredReleases: ReleaseRadarRelease[] = [];

  // State
  loading = true;
  error: string | null = null;

  // Enrollment state
  isEnrolled = false;
  enrollmentLoading = false;

  // View controls
  viewMode: 'calendar' | 'list' = 'calendar';
  filterType: 'all' | 'album' | 'single' = 'all';

  // Week filter for list view
  weekOptions: WeekOption[] = [];
  selectedWeekKey: string = '';

  // Calendar state
  viewDate = new Date();
  calendarDays: CalendarDay[] = [];
  selectedDay: CalendarDay | null = null;
  weekDays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  // Stats - dynamic based on view
  totalReleases = 0;
  albumCount = 0;
  singleCount = 0;
  upcomingCount = 0;
  statsLabel = '';

  // User info
  private userEmail: string = '';

  constructor(
    private router: Router,
    private userService: UserService,
    private releaseRadarService: ReleaseRadarService,
    private playerService: PlayerService,
    private toastService: ToastService,
    private queueService: QueueService,
    private albumService: AlbumService
  ) {}

  ngOnInit(): void {
    this.isEnrolled = this.userService.getReleaseRadarEnrollment();
    this.selectedWeekKey = this.releaseRadarService.getCurrentWeekKey();
    this.loadUserAndReleases();
  }

  private loadUserAndReleases(): void {
    this.loading = true;
    this.userEmail = this.userService.getEmail();

    if (!this.userEmail) {
      this.error = 'User email not available.';
      this.loading = false;
      return;
    }

    this.loadReleases();
  }

  loadReleases(forceRefresh = false): void {
    if (!this.userEmail) {
      this.error = 'User email not available.';
      this.loading = false;
      return;
    }

    if (forceRefresh) {
      this.releaseRadarService.clearCache();
    }

    this.loading = true;
    this.error = null;

    const loadObservable = forceRefresh
      ? this.releaseRadarService.forceRefresh(this.userEmail)
      : this.releaseRadarService.loadReleaseRadar(this.userEmail);

    loadObservable.pipe(take(1)).subscribe({
      next: (response) => {
        this.history = response;
        this.releases =
          this.releaseRadarService.getAllReleasesFromHistory(response);

        // Build week options from history
        this.weekOptions = this.releaseRadarService.buildWeekOptions(response);

        // Set current week as default if not already set
        if (
          !this.selectedWeekKey ||
          !this.weekOptions.find((w) => w.weekKey === this.selectedWeekKey)
        ) {
          this.selectedWeekKey =
            response.currentWeek ||
            this.releaseRadarService.getCurrentWeekKey();
        }

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
    this.applyFilter();
    this.buildCalendar();
    this.updateStats();
  }

  /**
   * Update stats based on current view mode and selection
   */
  private updateStats(): void {
    let releasesToCount: ReleaseRadarRelease[] = [];

    if (this.viewMode === 'calendar') {
      // Calendar view: show stats for the currently viewed MONTH
      releasesToCount = this.getReleasesForMonth(this.viewDate);
      this.statsLabel = this.viewDate.toLocaleString('default', {
        month: 'long',
        year: 'numeric',
      });
    } else {
      // List view: show stats for the selected WEEK
      if (this.history && this.selectedWeekKey) {
        const weekData = this.history.weeks.find(
          (w) => w.weekKey === this.selectedWeekKey
        );
        if (weekData) {
          releasesToCount = weekData.releases;
          // Get week label from options or weekDisplay
          const weekOption = this.weekOptions.find(
            (w) => w.weekKey === this.selectedWeekKey
          );
          this.statsLabel =
            weekOption?.label || weekData.weekDisplay || this.selectedWeekKey;
        }
      }
    }

    // Calculate stats from the relevant releases
    this.totalReleases = releasesToCount.length;
    this.albumCount = releasesToCount.filter(
      (r) => r.albumType === 'album'
    ).length;
    this.singleCount = releasesToCount.filter(
      (r) => r.albumType === 'single'
    ).length;

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    this.upcomingCount = releasesToCount.filter(
      (r) => new Date(r.releaseDate) >= today
    ).length;
  }

  /**
   * Get all releases for a specific month
   */
  private getReleasesForMonth(date: Date): ReleaseRadarRelease[] {
    const year = date.getFullYear();
    const month = date.getMonth();

    return this.releases.filter((release) => {
      const releaseDate = new Date(release.releaseDate);
      return (
        releaseDate.getFullYear() === year && releaseDate.getMonth() === month
      );
    });
  }

  private applyFilter(): void {
    let filtered = [...this.releases];

    // Apply type filter
    if (this.filterType !== 'all') {
      filtered = filtered.filter((r) => r.albumType === this.filterType);
    }

    // Apply week filter (only in list view)
    if (this.viewMode === 'list' && this.selectedWeekKey && this.history) {
      const weekData = this.history.weeks.find(
        (w) => w.weekKey === this.selectedWeekKey
      );
      if (weekData) {
        // Use albumId (the actual field from DynamoDB)
        const weekReleaseIds = new Set(weekData.releases.map((r) => r.albumId));
        filtered = filtered.filter((r) => weekReleaseIds.has(r.albumId));
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
        : this.releases.filter((r) => r.albumType === this.filterType);

    while (current <= endDate) {
      const dayReleases = this.getReleasesForDate(current, calendarReleases);
      const currentDate = new Date(current);

      this.calendarDays.push({
        date: currentDate,
        dayOfMonth: current.getDate(),
        isCurrentMonth: current.getMonth() === month,
        isToday: current.getTime() === today.getTime(),
        releases: dayReleases,
      });

      if (
        today.getDate() === currentDate.getDate() &&
        today.getMonth() === currentDate.getMonth() &&
        today.getFullYear() === currentDate.getFullYear()
      ) {
        this.selectedDay = this.calendarDays[this.calendarDays.length - 1];
      }

      current.setDate(current.getDate() + 1);
    }
  }

  private getReleasesForDate(
    date: Date,
    releases: ReleaseRadarRelease[]
  ): ReleaseRadarRelease[] {
    const dateStr = date.toISOString().split('T')[0];
    return releases.filter((release) => {
      const releaseStr = release.releaseDate;
      return releaseStr === dateStr;
    });
  }

  // ============================================
  // Enrollment
  // ============================================

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

  // ============================================
  // View Controls
  // ============================================

  setWeekFilter(weekKey: string): void {
    this.selectedWeekKey = weekKey;
    this.applyFilter();
    this.updateStats();
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
    this.updateStats();
  }

  // ============================================
  // Calendar Navigation
  // ============================================

  previousMonth(): void {
    this.viewDate = new Date(
      this.viewDate.getFullYear(),
      this.viewDate.getMonth() - 1,
      1
    );
    this.buildCalendar();
    this.updateStats();
    this.selectedDay = null;
  }

  nextMonth(): void {
    this.viewDate = new Date(
      this.viewDate.getFullYear(),
      this.viewDate.getMonth() + 1,
      1
    );
    this.buildCalendar();
    this.updateStats();
    this.selectedDay = null;
  }

  goToToday(): void {
    this.viewDate = new Date();
    this.buildCalendar();
    this.updateStats();
    this.selectedDay = null;
  }

  selectDay(day: CalendarDay): void {
    if (day.releases.length > 0) {
      this.selectedDay = this.selectedDay === day ? null : day;
    }
  }

  // ============================================
  // Actions
  // ============================================

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

  openInSpotify(uri: string, event: Event): void {
    event.stopPropagation();
    const parts = uri.split(':');
    if (parts.length === 3) {
      const url = `https://open.spotify.com/${parts[1]}/${parts[2]}`;
      window.open(url, '_blank');
    }
  }

  // ============================================
  // Helpers
  // ============================================

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

  getRelativeDate(release: ReleaseRadarRelease): string {
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
    if (!this.history || !this.selectedWeekKey) return 0;

    const weekData = this.history.weeks.find(
      (w) => w.weekKey === this.selectedWeekKey
    );
    if (!weekData) return 0;

    if (this.filterType === 'all') {
      return weekData.releases.length;
    }

    return weekData.releases.filter((r) => r.albumType === this.filterType)
      .length;
  }

  getSelectedWeekStats(): ReleaseRadarWeek['stats'] | null {
    if (!this.history || !this.selectedWeekKey) return null;

    const weekData = this.history.weeks.find(
      (w) => w.weekKey === this.selectedWeekKey
    );
    return weekData?.stats || null;
  }

  // ============================================
  // Queue Management
  // ============================================

  addAlbumToQueue(release: ReleaseRadarRelease, event?: Event): void {
    if (event) {
      event.stopPropagation();
    }

    this.toastService.showPositiveToast('Adding tracks to Playlist Builder...');

    this.albumService
      .getAlbumTracks(release.albumId)
      .pipe(
        take(1),
        catchError((error) => {
          console.error('Error fetching album tracks:', error);
          this.toastService.showNegativeToast('Failed to add tracks to Playlist Builder');
          return of(null);
        })
      )
      .subscribe((response) => {
        if (!response || !response.items) {
          return;
        }

        let addedCount = 0;
        response.items.forEach((track: any) => {
          const queueTrack: QueueTrack = {
            id: track.id,
            name: track.name,
            artists: track.artists || [],
            album: {
              id: release.albumId,
              name: release.albumName,
              images: release.imageUrl ? [{ url: release.imageUrl }] : [],
            },
            duration_ms: track.duration_ms,
            external_urls: track.external_urls,
          };

          const added = this.queueService.addToQueue(queueTrack);
          if (added) {
            addedCount++;
          }
        });

        if (addedCount > 0) {
          this.toastService.showPositiveToast(
            `Added ${addedCount} track${addedCount !== 1 ? 's' : ''} to Playlist Builder`
          );
        } else {
          this.toastService.showPositiveToast('Tracks already in Playlist Builder');
        }
      });
  }

  // Add first track of album to Spotify queue
  addAlbumToSpotifyQueue(release: ReleaseRadarRelease, event?: Event): void {
    if (event) {
      event.stopPropagation();
    }

    // For albums, add the first track to Spotify queue
    this.albumService
      .getAlbumTracks(release.albumId)
      .pipe(
        take(1),
        catchError((error) => {
          console.error('Error fetching album tracks:', error);
          this.toastService.showNegativeToast('Failed to add to Spotify queue');
          return of(null);
        })
      )
      .subscribe((response) => {
        if (!response || !response.items || response.items.length === 0) {
          this.toastService.showNegativeToast('No tracks found in album');
          return;
        }

        const firstTrack = response.items[0];
        this.playerService.addToSpotifyQueue(firstTrack.id).pipe(take(1)).subscribe({
          next: (success) => {
            if (success) {
              this.toastService.showPositiveToast(`Added "${release.albumName}" to Spotify queue`);
            } else {
              this.toastService.showNegativeToast('Could not add to queue. Open Spotify on any device and try again.');
            }
          },
          error: () => {
            this.toastService.showNegativeToast('Error adding to queue. Check console for details.');
          },
        });
      });
  }
}
