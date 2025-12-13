import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { UserService } from 'src/app/services/user.service';
import { ToastService } from 'src/app/services/toast.service';
import { take } from 'rxjs';

interface CachedFollowing {
  artists: any[];
  timestamp: number;
}

@Component({
  selector: 'app-following-page',
  templateUrl: './following.component.html',
  styleUrls: ['./following.component.scss'],
})
export class FollowingComponent implements OnInit {
  loading = true;
  allArtists: any[] = [];
  filteredArtists: any[] = [];
  searchQuery = '';
  sortBy = 'name';

  // Cache settings
  private readonly CACHE_KEY = 'xomify_following';
  private readonly CACHE_TTL = 30 * 60 * 1000; // 30 minutes

  constructor(
    private userService: UserService,
    private toastService: ToastService,
    private router: Router
  ) {}

  ngOnInit(): void {
    this.loadFollowedArtists();
  }

  loadFollowedArtists(forceRefresh = false): void {
    // Check cache first
    if (!forceRefresh) {
      const cached = this.getCache();
      if (cached) {
        this.allArtists = cached.artists;
        this.filteredArtists = [...cached.artists];
        this.sortArtists();
        this.loading = false;
        console.log(
          `Loaded ${cached.artists.length} followed artists from cache`
        );
        return;
      }
    }

    this.loading = true;

    this.userService
      .getAllFollowedArtists()
      .pipe(take(1))
      .subscribe({
        next: (artists) => {
          this.allArtists = artists;
          this.filteredArtists = [...artists];
          this.sortArtists();
          this.loading = false;

          // Cache the results
          this.setCache(artists);

          console.log(`Loaded ${artists.length} followed artists from API`);

          if (forceRefresh) {
            this.toastService.showPositiveToast('Following list refreshed');
          }
        },
        error: (err) => {
          console.error('Error loading followed artists', err);
          this.toastService.showNegativeToast('Error loading followed artists');
          this.loading = false;
        },
      });
  }

  // Cache methods
  private getCache(): CachedFollowing | null {
    try {
      const cached = localStorage.getItem(this.CACHE_KEY);
      if (!cached) return null;

      const data: CachedFollowing = JSON.parse(cached);
      const now = Date.now();

      // Check if cache is expired
      if (now - data.timestamp > this.CACHE_TTL) {
        localStorage.removeItem(this.CACHE_KEY);
        return null;
      }

      return data;
    } catch {
      return null;
    }
  }

  private setCache(artists: any[]): void {
    const data: CachedFollowing = {
      artists,
      timestamp: Date.now(),
    };
    try {
      localStorage.setItem(this.CACHE_KEY, JSON.stringify(data));
    } catch {
      console.warn('Failed to cache following data');
    }
  }

  private clearCache(): void {
    localStorage.removeItem(this.CACHE_KEY);
  }

  // Refresh button handler
  refresh(): void {
    this.clearCache();
    this.loadFollowedArtists(true);
  }

  filterArtists(): void {
    const query = this.searchQuery.toLowerCase().trim();

    if (!query) {
      this.filteredArtists = [...this.allArtists];
    } else {
      this.filteredArtists = this.allArtists.filter(
        (artist) =>
          artist.name.toLowerCase().includes(query) ||
          artist.genres?.some((g: string) => g.toLowerCase().includes(query))
      );
    }

    this.sortArtists();
  }

  clearSearch(): void {
    this.searchQuery = '';
    this.filterArtists();
  }

  sortArtists(): void {
    switch (this.sortBy) {
      case 'name':
        this.filteredArtists.sort((a, b) => a.name.localeCompare(b.name));
        break;
      case 'name-desc':
        this.filteredArtists.sort((a, b) => b.name.localeCompare(a.name));
        break;
      case 'popularity':
        this.filteredArtists.sort(
          (a, b) => (b.popularity || 0) - (a.popularity || 0)
        );
        break;
      case 'followers':
        this.filteredArtists.sort(
          (a, b) => (b.followers?.total || 0) - (a.followers?.total || 0)
        );
        break;
    }
  }

  goToArtist(artistId: string): void {
    this.router.navigate(['/artist-profile', artistId]);
  }

  unfollowArtist(artist: any, event: Event): void {
    event.stopPropagation();

    if (artist.unfollowing) return;

    artist.unfollowing = true;

    this.userService
      .unfollowArtist(artist.id)
      .pipe(take(1))
      .subscribe({
        next: () => {
          // Remove from lists
          this.allArtists = this.allArtists.filter((a) => a.id !== artist.id);
          this.filteredArtists = this.filteredArtists.filter(
            (a) => a.id !== artist.id
          );

          // Update cache
          this.setCache(this.allArtists);

          // Update count in service
          this.userService.setFollowingCount(this.allArtists.length);

          this.toastService.showPositiveToast(`Unfollowed ${artist.name}`);
        },
        error: (err) => {
          console.error('Error unfollowing artist', err);
          this.toastService.showNegativeToast('Error unfollowing artist');
          artist.unfollowing = false;
        },
      });
  }

  formatNumber(num: number): string {
    if (!num) return '0';
    if (num >= 1000000) {
      return (num / 1000000).toFixed(1) + 'M';
    }
    if (num >= 1000) {
      return (num / 1000).toFixed(1) + 'K';
    }
    return num.toString();
  }
}
