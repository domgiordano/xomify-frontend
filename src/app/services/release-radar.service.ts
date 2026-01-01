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
  finalized?: boolean;
  lastUpdated?: string;
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
  status: 'success' | 'skipped' | 'started';
  reason?: string;
  message?: string;
  weeksBackfilled?: number;
  weeksFound?: number;
  existingWeeks?: number;
  totalReleases?: number;
}

export interface LiveResponse {
  email: string;
  weekKey: string;
  week: ReleaseRadarWeek;
  source: 'spotify' | 'cache' | 'database';
  finalized: boolean;
  needsRefresh: boolean;
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

  private getHeaders(): HttpHeaders {
    return new HttpHeaders({
      Authorization: `Bearer ${environment.apiAuthToken}`,
      'Content-Type': 'application/json',
    });
  }

  /**
   * NEW: Get current week's live data from Spotify (with daily refresh logic).
   * Backend handles the "once per day" check - only fetches from Spotify if needed.
   */
  getCurrentWeekLive(email: string, force: boolean = false): Observable<LiveResponse> {
    let params = new HttpParams().set('email', email);
    if (force) {
      params = params.set('force', 'true');
    }

    return this.http
      .get<LiveResponse>(`${this.baseUrl}/release-radar/live`, {
        headers: this.getHeaders(),
        params,
      })
      .pipe(
        tap((response) => {
          console.log(`[ReleaseRadar] Live data for ${response.weekKey}:`, {
            source: response.source,
            finalized: response.finalized,
            releases: response.week?.releases?.length || 0,
          });
        }),
        catchError((err) => {
          console.error('Error fetching live release radar:', err);
          // Return empty response so we can still load history
          return of({
            email,
            weekKey: this.getCurrentWeekKey(),
            week: {
              email,
              weekKey: this.getCurrentWeekKey(),
              releases: [],
              stats: { totalTracks: 0, albumCount: 0, singleCount: 0, appearsOnCount: 0 },
              playlistId: null,
              finalized: false,
              createdAt: new Date().toISOString(),
            },
            source: 'database' as const,
            finalized: false,
            needsRefresh: false,
          });
        })
      );
  }

  /**
   * Get user's release radar history from DynamoDB.
   * Falls back to Spotify API if no history exists (triggers backfill).
   */
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
   * Load release radar data.
   * 
   * Flow:
   * 1. Check sessionStorage cache first - if valid, return immediately
   * 2. If no cache, call /live (which checks if data needs refresh)
   * 3. Then load /history and merge
   * 
   * The /live endpoint handles:
   * - If user has < 30 weeks history: fetches 6 months in ONE pass
   * - If user has enough history: just fetches/updates current week
   * - If already updated today: returns cached data from DB (no Spotify calls)
   */
  loadReleaseRadar(
    email: string,
    user: any
  ): Observable<ReleaseRadarHistoryResponse> {
    // Check frontend cache first - avoid ALL API calls if cache is valid
    const cached = this.getCache();
    if (cached && cached.weeks.length > 0) {
      console.log('[ReleaseRadar] Using cached data, skipping API calls');
      return of(cached);
    }

    // No valid cache, load from API
    return this.loadWithLiveCurrentWeek(email);
  }

  /**
   * Load history and merge with live current week data.
   * Only called when cache is invalid/missing.
   */
  private loadWithLiveCurrentWeek(email: string): Observable<ReleaseRadarHistoryResponse> {
    // First get live current week data (backend handles daily refresh check)
    return this.getCurrentWeekLive(email).pipe(
      switchMap((liveResponse) => {
        // Then get history (skip frontend cache since we're refreshing)
        return this.loadFreshHistory(email).pipe(
          map((historyResponse) => {
            // Merge current week into history
            return this.mergeCurrentWeekIntoHistory(liveResponse, historyResponse);
          })
        );
      })
    );
  }

  /**
   * Load history directly from API, bypassing frontend cache.
   */
  private loadFreshHistory(email: string, limit: number = 30): Observable<ReleaseRadarHistoryResponse> {
    const params = new HttpParams()
      .set('email', email)
      .set('limit', limit.toString());

    return this.http
      .get<ReleaseRadarHistoryResponse>(
        `${this.baseUrl}/release-radar/history`,
        { headers: this.getHeaders(), params }
      )
      .pipe(
        catchError((err) => {
          console.error('Error fetching release radar history:', err);
          return of({ email, weeks: [], count: 0, currentWeek: '' });
        })
      );
  }

  /**
   * NEW: Merge the live current week data into the history response.
   * Replaces the current week in history with fresh data from /live.
   */
  private mergeCurrentWeekIntoHistory(
    liveResponse: LiveResponse,
    historyResponse: ReleaseRadarHistoryResponse
  ): ReleaseRadarHistoryResponse {
    const currentWeekKey = liveResponse.weekKey;
    const liveWeek = liveResponse.week;

    // Filter out the current week from history (we'll replace it with live data)
    const historicalWeeks = historyResponse.weeks.filter(
      (w) => w.weekKey !== currentWeekKey
    );

    // Add live current week at the beginning if it has releases
    const mergedWeeks: ReleaseRadarWeek[] = [];
    
    if (liveWeek && liveWeek.releases && liveWeek.releases.length > 0) {
      mergedWeeks.push(liveWeek);
    }
    
    // Add historical weeks
    mergedWeeks.push(...historicalWeeks);

    // Sort by weekKey descending (newest first)
    mergedWeeks.sort((a, b) => b.weekKey.localeCompare(a.weekKey));

    // Update cache with merged data
    const mergedResponse: ReleaseRadarHistoryResponse = {
      email: historyResponse.email,
      weeks: mergedWeeks,
      count: mergedWeeks.length,
      currentWeek: currentWeekKey,
    };

    this.setCache(mergedResponse);

    return mergedResponse;
  }

  /**
   * NEW: Force refresh current week from Spotify (bypasses daily check).
   * Use for manual "Refresh" button.
   */
  forceRefreshCurrentWeek(email: string): Observable<ReleaseRadarHistoryResponse> {
    // Clear cache first
    this.clearCache();
    
    return this.getCurrentWeekLive(email, true).pipe(
      switchMap((liveResponse) => {
        return this.getHistory(email).pipe(
          map((historyResponse) => {
            return this.mergeCurrentWeekIntoHistory(liveResponse, historyResponse);
          })
        );
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
   * Calculate the current week key (Sunday-Saturday).
   */
  getCurrentWeekKey(): string {
    return this.getWeekKey(new Date());
  }

  /**
   * Get week key for a specific date (Sunday-Saturday weeks).
   */
  getWeekKey(date: Date): string {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);

    // Find the Sunday that starts this week
    // getDay(): Sun=0, Mon=1, ..., Sat=6
    const dayOfWeek = d.getDay();

    const sunday = new Date(d);
    sunday.setDate(d.getDate() - dayOfWeek);

    // Get ISO week number based on the Sunday
    const jan4 = new Date(sunday.getFullYear(), 0, 4);
    const startOfYear = new Date(jan4);
    startOfYear.setDate(jan4.getDate() - jan4.getDay()); // Sunday of week containing Jan 4

    const diffMs = sunday.getTime() - startOfYear.getTime();
    const weekNum = Math.floor(diffMs / (7 * 24 * 60 * 60 * 1000)) + 1;

    return `${sunday.getFullYear()}-${weekNum.toString().padStart(2, '0')}`;
  }

  /**
   * Get the date range for a week key (Sunday-Saturday).
   */
  getWeekDateRange(weekKey: string): { start: Date; end: Date } {
    const [year, week] = weekKey.split('-').map(Number);

    // Find Sunday of the first week
    const jan4 = new Date(year, 0, 4);
    const startOfYear = new Date(jan4);
    startOfYear.setDate(jan4.getDate() - jan4.getDay()); // Sunday of week containing Jan 4

    // Get Sunday of the target week
    const sunday = new Date(startOfYear);
    sunday.setDate(startOfYear.getDate() + (week - 1) * 7);

    // Saturday is 6 days after Sunday
    const saturday = new Date(sunday);
    saturday.setDate(sunday.getDate() + 6);

    return { start: sunday, end: saturday };
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
