import { Injectable } from '@angular/core';
import { HttpClient, HttpParams, HttpHeaders } from '@angular/common/http';
import { Observable, of } from 'rxjs';
import { map, tap, catchError } from 'rxjs/operators';
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
  artistCount: number;
  releaseCount: number;
  trackCount: number;
  albumCount: number;
  singleCount: number;
}

export interface ReleaseRadarWeek {
  email: string;
  weekKey: string;
  weekDisplay?: string;
  startDate?: string;
  endDate?: string;
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
  currentWeekDisplay?: string;
}

export interface ReleaseRadarCheckResponse {
  email: string;
  enrolled: boolean;
  hasHistory: boolean;
  currentWeek: string;
  currentWeekDisplay: string;
  weekStartDate: string;
  weekEndDate: string;
}

@Injectable({
  providedIn: 'root',
})
export class ReleaseRadarService {
  private readonly baseUrl = environment.xomifyApiUrl;
  private readonly cacheKey = 'xomify_release_radar_history';
  private readonly cacheTTL = 30 * 60 * 1000; // 30 minutes

  constructor(private http: HttpClient) {}

  private getHeaders(): HttpHeaders {
    return new HttpHeaders({
      Authorization: `Bearer ${environment.apiAuthToken}`,
      'Content-Type': 'application/json',
    });
  }

  // ============================================
  // API Methods
  // ============================================

  /**
   * Get user's release radar history from database.
   */
  getHistory(
    email: string,
    limit: number = 26
  ): Observable<ReleaseRadarHistoryResponse> {
    const params = new HttpParams()
      .set('email', email)
      .set('limit', limit.toString());

    return this.http
      .get<ReleaseRadarHistoryResponse>(
        `${this.baseUrl}/release-radar/history`,
        {
          headers: this.getHeaders(),
          params,
        }
      )
      .pipe(
        tap((response) => {
          console.log(
            `[ReleaseRadar] History: ${response.weeks?.length || 0} weeks`
          );
        }),
        catchError((err) => {
          console.error('Error fetching release radar history:', err);
          return of({
            email,
            weeks: [],
            count: 0,
            currentWeek: this.getCurrentWeekKey(),
            currentWeekDisplay: '',
          });
        })
      );
  }

  /**
   * Check user's release radar status.
   */
  checkStatus(email: string): Observable<ReleaseRadarCheckResponse> {
    const params = new HttpParams().set('email', email);

    return this.http
      .get<ReleaseRadarCheckResponse>(`${this.baseUrl}/release-radar/check`, {
        headers: this.getHeaders(),
        params,
      })
      .pipe(
        catchError((err) => {
          console.error('Error checking release radar status:', err);
          return of({
            email,
            enrolled: false,
            hasHistory: false,
            currentWeek: this.getCurrentWeekKey(),
            currentWeekDisplay: '',
            weekStartDate: '',
            weekEndDate: '',
          });
        })
      );
  }

  // ============================================
  // Main Load Method
  // ============================================

  /**
   * Load release radar data from history.
   * Uses session cache for performance.
   */
  loadReleaseRadar(email: string): Observable<ReleaseRadarHistoryResponse> {
    // Check frontend cache first
    const cached = this.getCache();
    if (cached && cached.weeks.length > 0) {
      console.log('[ReleaseRadar] Using cached data');
      return of(cached);
    }

    // Load from API
    return this.getHistory(email).pipe(
      tap((response) => {
        if (response.weeks && response.weeks.length > 0) {
          this.setCache(response);
        }
      })
    );
  }

  /**
   * Force refresh - clears cache and reloads from API.
   */
  forceRefresh(email: string): Observable<ReleaseRadarHistoryResponse> {
    this.clearCache();
    return this.getHistory(email).pipe(
      tap((response) => {
        if (response.weeks && response.weeks.length > 0) {
          this.setCache(response);
        }
      })
    );
  }

  // ============================================
  // Helper Methods
  // ============================================

  /**
   * Get all releases from history as a flat array.
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

  // ============================================
  // Week Key Calculations (Saturday-Friday)
  // ============================================

  /**
   * Calculate the current week key.
   * Week runs Saturday 00:00:00 to Friday 23:59:59.
   */
  getCurrentWeekKey(): string {
    return this.getWeekKey(new Date());
  }

  /**
   * Get week key for a specific date (Saturday-Friday weeks).
   */
  getWeekKey(date: Date): string {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);

    // Find the Saturday that starts this week
    // getDay(): Sun=0, Mon=1, Tue=2, Wed=3, Thu=4, Fri=5, Sat=6
    const dayOfWeek = d.getDay();

    // Days since Saturday: Sat=0, Sun=1, Mon=2, Tue=3, Wed=4, Thu=5, Fri=6
    const daysSinceSaturday = (dayOfWeek + 1) % 7;

    const saturday = new Date(d);
    saturday.setDate(d.getDate() - daysSinceSaturday);

    // Get ISO week number of the Saturday
    const isoWeek = this.getISOWeekNumber(saturday);
    const year = saturday.getFullYear();

    return `${year}-${isoWeek.toString().padStart(2, '0')}`;
  }

  /**
   * Get ISO week number for a date.
   */
  private getISOWeekNumber(date: Date): number {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() + 4 - (d.getDay() || 7)); // Thursday of this week
    const yearStart = new Date(d.getFullYear(), 0, 1);
    return Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  }

  /**
   * Get the date range for a week key (Saturday-Friday).
   */
  getWeekDateRange(weekKey: string): { start: Date; end: Date } {
    const [year, week] = weekKey.split('-').map(Number);

    // Find Monday of that ISO week
    const jan4 = new Date(year, 0, 4);
    const startOfWeek1 = new Date(jan4);
    startOfWeek1.setDate(jan4.getDate() - jan4.getDay() + 1); // Monday of week 1

    // Get Monday of target week
    const mondayOfWeek = new Date(startOfWeek1);
    mondayOfWeek.setDate(startOfWeek1.getDate() + (week - 1) * 7);

    // Our week starts on Saturday (5 days after Monday)
    const saturday = new Date(mondayOfWeek);
    saturday.setDate(mondayOfWeek.getDate() + 5);
    saturday.setHours(0, 0, 0, 0);

    // Friday is 6 days after Saturday
    const friday = new Date(saturday);
    friday.setDate(saturday.getDate() + 6);
    friday.setHours(23, 59, 59, 999);

    return { start: saturday, end: friday };
  }

  /**
   * Format a week key for display.
   */
  formatWeekDisplay(weekKey: string): string {
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
   * Build week options for dropdown.
   * Uses history weeks when available.
   */
  buildWeekOptions(
    history?: ReleaseRadarHistoryResponse
  ): { weekKey: string; label: string }[] {
    const options: { weekKey: string; label: string }[] = [];
    const currentWeekKey = this.getCurrentWeekKey();

    // If we have history, build options from that
    if (history?.weeks && history.weeks.length > 0) {
      for (const week of history.weeks) {
        const isCurrentWeek = week.weekKey === currentWeekKey;
        const label = isCurrentWeek
          ? 'This Week'
          : week.weekDisplay || this.formatWeekDisplay(week.weekKey);

        options.push({
          weekKey: week.weekKey,
          label,
        });
      }
    } else {
      // Fallback: generate last 8 weeks
      const today = new Date();
      for (let i = 0; i < 8; i++) {
        const targetDate = new Date(today);
        targetDate.setDate(today.getDate() - i * 7);
        const weekKey = this.getWeekKey(targetDate);

        if (!options.find((o) => o.weekKey === weekKey)) {
          options.push({
            weekKey,
            label: i === 0 ? 'This Week' : this.formatWeekDisplay(weekKey),
          });
        }
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
