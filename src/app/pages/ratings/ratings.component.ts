import { Component, OnInit, OnDestroy, ViewChild } from '@angular/core';
import { Router } from '@angular/router';
import { Subscription } from 'rxjs';
import { take } from 'rxjs/operators';
import { RatingsService, TrackRating } from 'src/app/services/ratings.service';
import { UserService } from 'src/app/services/user.service';
import { PlayerService } from 'src/app/services/player.service';
import { ToastService } from 'src/app/services/toast.service';
import {
  SongDetailModalComponent,
  SongDetailTrack,
} from 'src/app/components/song-detail-modal/song-detail-modal.component';

type SortOption = 'recent' | 'rating' | 'name' | 'artist';

@Component({
  selector: 'app-ratings',
  templateUrl: './ratings.component.html',
  styleUrls: ['./ratings.component.scss'],
})
export class RatingsComponent implements OnInit, OnDestroy {
  @ViewChild('songDetailModal') songDetailModal!: SongDetailModalComponent;

  private subscriptions: Subscription[] = [];

  ratings: TrackRating[] = [];
  filteredRatings: TrackRating[] = [];
  loading = true;
  currentEmail = '';

  // Filtering
  searchQuery = '';
  minRating = 0;
  sortBy: SortOption = 'recent';

  // Stats
  totalRatings = 0;
  averageRating = 0;
  fiveStarCount = 0;

  sortOptions: { value: SortOption; label: string }[] = [
    { value: 'recent', label: 'Most Recent' },
    { value: 'rating', label: 'Highest Rated' },
    { value: 'name', label: 'Song Name' },
    { value: 'artist', label: 'Artist' },
  ];

  ratingFilters = [
    { value: 0, label: 'All Ratings' },
    { value: 4.5, label: '4.5+ Stars' },
    { value: 4, label: '4+ Stars' },
    { value: 3, label: '3+ Stars' },
  ];

  constructor(
    private ratingsService: RatingsService,
    private userService: UserService,
    private playerService: PlayerService,
    private toastService: ToastService,
    private router: Router
  ) {}

  ngOnInit(): void {
    this.currentEmail = this.userService.getEmail();
    this.loadRatings();

    // Subscribe to ratings updates
    this.subscriptions.push(
      this.ratingsService.ratings$.subscribe((ratings) => {
        this.ratings = ratings;
        this.calculateStats();
        this.applyFilters();
      })
    );
  }

  ngOnDestroy(): void {
    this.subscriptions.forEach((sub) => sub.unsubscribe());
  }

  loadRatings(forceRefresh = false): void {
    this.loading = true;

    this.ratingsService
      .getAllRatings(this.currentEmail, forceRefresh)
      .pipe(take(1))
      .subscribe({
        next: () => {
          this.loading = false;
          if (forceRefresh) {
            this.toastService.showPositiveToast('Ratings refreshed');
          }
        },
        error: () => {
          this.loading = false;
          this.toastService.showNegativeToast('Error loading ratings');
        },
      });
  }

  calculateStats(): void {
    this.totalRatings = this.ratings.length;
    this.fiveStarCount = this.ratings.filter((r) => r.rating === 5).length;

    if (this.totalRatings > 0) {
      const sum = this.ratings.reduce((acc, r) => acc + r.rating, 0);
      this.averageRating = Math.round((sum / this.totalRatings) * 10) / 10;
    } else {
      this.averageRating = 0;
    }
  }

  applyFilters(): void {
    let filtered = [...this.ratings];

    // Search filter
    if (this.searchQuery.trim()) {
      const query = this.searchQuery.toLowerCase();
      filtered = filtered.filter(
        (r) =>
          r.trackName.toLowerCase().includes(query) ||
          r.artistName.toLowerCase().includes(query)
      );
    }

    // Rating filter
    if (this.minRating > 0) {
      filtered = filtered.filter((r) => r.rating >= this.minRating);
    }

    // Sort
    switch (this.sortBy) {
      case 'recent':
        filtered.sort(
          (a, b) =>
            new Date(b.ratedAt).getTime() - new Date(a.ratedAt).getTime()
        );
        break;
      case 'rating':
        filtered.sort((a, b) => b.rating - a.rating);
        break;
      case 'name':
        filtered.sort((a, b) => a.trackName.localeCompare(b.trackName));
        break;
      case 'artist':
        filtered.sort((a, b) => a.artistName.localeCompare(b.artistName));
        break;
    }

    this.filteredRatings = filtered;
  }

  onSearchChange(): void {
    this.applyFilters();
  }

  onSortChange(sort: SortOption): void {
    this.sortBy = sort;
    this.applyFilters();
  }

  onRatingFilterChange(minRating: number): void {
    this.minRating = minRating;
    this.applyFilters();
  }

  clearSearch(): void {
    this.searchQuery = '';
    this.applyFilters();
  }

  openTrackDetail(rating: TrackRating): void {
    const track: SongDetailTrack = {
      id: rating.trackId,
      name: rating.trackName,
      artists: [{ id: '', name: rating.artistName }],
      album: {
        id: rating.albumId || '',
        name: '',
        images: rating.albumArt ? [{ url: rating.albumArt }] : [],
      },
    };
    this.songDetailModal.open(track);
  }

  playTrack(rating: TrackRating, event: Event): void {
    event.stopPropagation();
    this.playerService.playSong(rating.trackId);
  }

  removeRating(rating: TrackRating, event: Event): void {
    event.stopPropagation();

    this.ratingsService
      .deleteRating(this.currentEmail, rating.trackId)
      .pipe(take(1))
      .subscribe({
        next: () => {
          this.toastService.showPositiveToast(
            `Removed rating for "${rating.trackName}"`
          );
        },
        error: () => {
          this.toastService.showNegativeToast('Error removing rating');
        },
      });
  }

  goToAlbum(albumId: string, event: Event): void {
    event.stopPropagation();
    if (albumId) {
      this.router.navigate(['/album', albumId]);
    }
  }

  refresh(): void {
    this.loadRatings(true);
  }

  formatDate(dateString: string): string {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return `${diffDays} days ago`;
    if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;
    if (diffDays < 365) return `${Math.floor(diffDays / 30)} months ago`;
    return date.toLocaleDateString();
  }

  getDefaultAlbumArt(): string {
    return 'assets/default-album.png';
  }
}
