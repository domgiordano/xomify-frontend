import { Injectable } from '@angular/core';
import { HttpClient, HttpParams, HttpHeaders } from '@angular/common/http';
import { Observable, of, BehaviorSubject } from 'rxjs';
import { map, tap, catchError, switchMap } from 'rxjs/operators';
import { environment } from 'src/environments/environment';

export interface ReleaseRadarRelease {
  id: string;
  name: string;
  artistName: string;
  artistId: string;
  imageUrl: string | null;
  albumType: 'album' | 'single' | 'appears_on';
  releaseDate: string;
  totalTracks: number;
  uri: string;
}

export interface ReleaseRadarStats {
  totalTracks: number;
  albumCount: number;
  singleCount: number;
  appearsOnCount: number;
}

export interface ReleaseRadarWeek {
  email: string;
  weekKey: string;
  releases: ReleaseRadarRelease[];
  stats: ReleaseRadarStats;
  playlistId: string | null;
  createdAt: string;
}

export interface ReleaseRadarHistoryResponse {
  email: string;
  weeks: ReleaseRadarWeek[];
  count: number;
  currentWeek: string;
}

export interface BackfillResponse {
  email: string;
  status: 'success' | 'skipped';
  reason?: string;
  weeksBackfilled?: number;
  totalReleases?: number;
}

@Injectable({
  providedIn: 'root',
})
export class ReleaseRadarService {
  private readonly baseUrl = environment.xomifyApiUrl;
  private readonly cacheKey = 'xomify_release_radar_history';
  private readonly cacheTTL = 30 * 60 * 1000; // 30 minutes

  // Loading state for backfill
  private backfillInProgress = new BehaviorSubject<boolean>(false);
  public backfillInProgress$ = this.backfillInProgress.asObservable();

  constructor(private http: HttpClient) {}

  /**
   * Get user's release radar history from DynamoDB.
   * Falls back to Spotify API if no history exists (triggers backfill).
   */

  private getHeaders(): HttpHeaders {
    return new HttpHeaders({
      Authorization: `Bearer ${environment.apiAuthToken}`,
      'Content-Type': 'application/json',
    });
  }
  getHistory(
    email: string,
    limit: number = 26
  ): Observable<ReleaseRadarHistoryResponse> {
    // Check session cache first
    const cached = this.getCache();
    if (cached) {
      return of(cached);
    }

    const params = new HttpParams()
      .set('email', email)
      .set('limit', limit.toString());

    return this.http
      .get<ReleaseRadarHistoryResponse>(
        `${this.baseUrl}/release-radar/history`,
        { headers: this.getHeaders(), params }
      )
      .pipe(
        tap((response) => {
          if (response.weeks && response.weeks.length > 0) {
            this.setCache(response);
          }
        }),
        catchError((err) => {
          console.error('Error fetching release radar history:', err);
          return of({ email, weeks: [], count: 0, currentWeek: '' });
        })
      );
  }

  /**
   * Get a specific week's release radar data.
   */
  getWeek(email: string, weekKey: string): Observable<ReleaseRadarWeek | null> {
    const params = new HttpParams().set('email', email);

    return this.http
      .get<ReleaseRadarWeek>(`${this.baseUrl}/release-radar/week/${weekKey}`, {
        headers: this.getHeaders(),
        params,
      })
      .pipe(
        catchError((err) => {
          console.error(`Error fetching week ${weekKey}:`, err);
          return of(null);
        })
      );
  }

  /**
   * Get release radar data for a date range.
   */
  getHistoryInRange(
    email: string,
    startWeek: string,
    endWeek: string
  ): Observable<ReleaseRadarHistoryResponse> {
    const params = new HttpParams()
      .set('email', email)
      .set('startWeek', startWeek)
      .set('endWeek', endWeek);

    return this.http
      .get<ReleaseRadarHistoryResponse>(
        `${this.baseUrl}/release-radar/history`,
        { headers: this.getHeaders(), params }
      )
      .pipe(
        catchError((err) => {
          console.error('Error fetching release radar range:', err);
          return of({ email, weeks: [], count: 0, currentWeek: '' });
        })
      );
  }

  /**
   * Check if user has any release radar history.
   */
  checkHasHistory(
    email: string
  ): Observable<{ hasHistory: boolean; currentWeek: string }> {
    const params = new HttpParams().set('email', email);

    return this.http
      .get<{ email: string; hasHistory: boolean; currentWeek: string }>(
        `${this.baseUrl}/release-radar/check`,
        { headers: this.getHeaders(), params }
      )
      .pipe(
        map((response) => ({
          hasHistory: response.hasHistory,
          currentWeek: response.currentWeek,
        })),
        catchError((err) => {
          console.error('Error checking history:', err);
          return of({ hasHistory: false, currentWeek: '' });
        })
      );
  }

  /**
   * Trigger backfill for a user who has no history.
   * This will populate 6 months of historical data.
   */
  triggerBackfill(user: any): Observable<BackfillResponse> {
    this.backfillInProgress.next(true);

    return this.http
      .post<BackfillResponse>(
        `${this.baseUrl}/release-radar/backfill`,
        { user: user },
        {
          headers: this.getHeaders(),
        }
      )
      .pipe(
        tap((response) => {
          this.backfillInProgress.next(false);
          // Clear cache so next load gets fresh data
          this.clearCache();
        }),
        catchError((err) => {
          console.error('Error triggering backfill:', err);
          this.backfillInProgress.next(false);
          return of({
            email: user.email,
            status: 'skipped' as const,
            reason: 'error',
          });
        })
      );
  }

  /**
   * Load release radar data, triggering backfill if needed.
   * This is the main method components should use.
   */
  loadReleaseRadar(
    email: string,
    user: any
  ): Observable<ReleaseRadarHistoryResponse> {
    return this.checkHasHistory(email).pipe(
      switchMap(({ hasHistory, currentWeek }) => {
        if (hasHistory) {
          // User has history, just load it
          return this.getHistory(email);
        } else {
          // No history, trigger backfill first
          console.log('No history found, triggering backfill...');
          return this.triggerBackfill(user).pipe(
            switchMap(() => this.getHistory(email))
          );
        }
      })
    );
  }

  /**
   * Get all releases from history as a flat array.
   * Useful for calendar view that shows all releases.
   */
  getAllReleasesFromHistory(
    history: ReleaseRadarHistoryResponse
  ): ReleaseRadarRelease[] {
    const allReleases: ReleaseRadarRelease[] = [];
    const seenIds = new Set<string>();

    for (const week of history.weeks) {
      for (const release of week.releases) {
        if (!seenIds.has(release.id)) {
          seenIds.add(release.id);
          allReleases.push(release);
        }
      }
    }

    // Sort by release date (newest first)
    return allReleases.sort(
      (a, b) =>
        new Date(b.releaseDate).getTime() - new Date(a.releaseDate).getTime()
    );
  }

  /**
   * Get releases for a specific week from history.
   */
  getReleasesForWeek(
    history: ReleaseRadarHistoryResponse,
    weekKey: string
  ): ReleaseRadarRelease[] {
    const week = history.weeks.find((w) => w.weekKey === weekKey);
    return week?.releases || [];
  }

  /**
   * Calculate the current week key (Saturday-Friday).
   */
  getCurrentWeekKey(): string {
    return this.getWeekKey(new Date());
  }

  /**
   * Get week key for a specific date.
   */
  getWeekKey(date: Date): string {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);

    // Find the Saturday that starts this week
    // getDay(): Sun=0, Mon=1, ..., Sat=6
    const dayOfWeek = d.getDay();
    const daysSinceSaturday = (dayOfWeek + 1) % 7;

    const saturday = new Date(d);
    saturday.setDate(d.getDate() - daysSinceSaturday);

    // Get ISO week number
    const jan4 = new Date(saturday.getFullYear(), 0, 4);
    const startOfWeek1 = new Date(jan4);
    startOfWeek1.setDate(jan4.getDate() - jan4.getDay() + 1); // Monday of week 1

    const diffMs = saturday.getTime() - startOfWeek1.getTime();
    const weekNum = Math.floor(diffMs / (7 * 24 * 60 * 60 * 1000)) + 1;

    return `${saturday.getFullYear()}-${weekNum.toString().padStart(2, '0')}`;
  }

  /**
   * Get the date range for a week key.
   */
  getWeekDateRange(weekKey: string): { start: Date; end: Date } {
    const [year, week] = weekKey.split('-').map(Number);

    // Find Monday of ISO week 1
    const jan4 = new Date(year, 0, 4);
    const startOfWeek1 = new Date(jan4);
    startOfWeek1.setDate(jan4.getDate() - jan4.getDay() + 1);

    // Get Monday of the target week
    const monday = new Date(startOfWeek1);
    monday.setDate(startOfWeek1.getDate() + (week - 1) * 7);

    // Saturday is 2 days before Monday
    const saturday = new Date(monday);
    saturday.setDate(monday.getDate() - 2);

    // Friday is 6 days after Saturday
    const friday = new Date(saturday);
    friday.setDate(saturday.getDate() + 6);

    return { start: saturday, end: friday };
  }

  /**
   * Format a week key for display.
   */
  formatWeekKey(weekKey: string): string {
    try {
      const { start, end } = this.getWeekDateRange(weekKey);
      const startMonth = start.toLocaleDateString('en-US', { month: 'short' });
      const endMonth = end.toLocaleDateString('en-US', { month: 'short' });

      if (startMonth === endMonth) {
        return `${startMonth} ${start.getDate()} - ${end.getDate()}, ${end.getFullYear()}`;
      } else {
        return `${startMonth} ${start.getDate()} - ${endMonth} ${end.getDate()}, ${end.getFullYear()}`;
      }
    } catch {
      return `Week ${weekKey}`;
    }
  }

  /**
   * Build week options for dropdown (last 8 weeks).
   */
  buildWeekOptions(): { weekKey: string; label: string }[] {
    const options: { weekKey: string; label: string }[] = [];
    const today = new Date();

    for (let i = 0; i < 8; i++) {
      const targetDate = new Date(today);
      targetDate.setDate(today.getDate() - i * 7);

      const weekKey = this.getWeekKey(targetDate);

      let label: string;
      if (i === 0) {
        label = 'This Week';
      } else if (i === 1) {
        label = 'Last Week';
      } else {
        label = this.formatWeekKey(weekKey);
      }

      // Avoid duplicates
      if (!options.find((o) => o.weekKey === weekKey)) {
        options.push({ weekKey, label });
      }
    }

    return options;
  }

  // ============================================
  // Cache Methods (Session Storage)
  // ============================================

  private getCache(): ReleaseRadarHistoryResponse | null {
    try {
      const cached = sessionStorage.getItem(this.cacheKey);
      if (!cached) return null;

      const data = JSON.parse(cached);
      const now = Date.now();

      if (now - data.timestamp > this.cacheTTL) {
        sessionStorage.removeItem(this.cacheKey);
        return null;
      }

      return data.response;
    } catch {
      return null;
    }
  }

  private setCache(response: ReleaseRadarHistoryResponse): void {
    const data = {
      response,
      timestamp: Date.now(),
    };
    sessionStorage.setItem(this.cacheKey, JSON.stringify(data));
  }

  clearCache(): void {
    sessionStorage.removeItem(this.cacheKey);
  }
}
