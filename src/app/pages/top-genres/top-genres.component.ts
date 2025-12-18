import { Component, OnInit } from '@angular/core';
import { forkJoin, take } from 'rxjs';
import { ArtistService } from 'src/app/services/artist.service';
import {
  GenresService,
  GenreItem,
  GenreGroup,
} from 'src/app/services/genre.service';
import { ToastService } from 'src/app/services/toast.service';

@Component({
  selector: 'app-top-genres-page',
  templateUrl: './top-genres.component.html',
  styleUrls: ['./top-genres.component.scss'],
})
export class TopGenresComponent implements OnInit {
  loading = true;
  transitioning = false;
  selectedTerm = 'short_term';
  viewMode: 'detailed' | 'grouped' = 'detailed';

  // Detailed genres (weighted)
  genreList: GenreItem[] = [];
  private genresShortTerm: GenreItem[] = [];
  private genresMedTerm: GenreItem[] = [];
  private genresLongTerm: GenreItem[] = [];

  // Grouped genres
  groupedGenres: GenreGroup[] = [];
  private groupedShortTerm: GenreGroup[] = [];
  private groupedMedTerm: GenreGroup[] = [];
  private groupedLongTerm: GenreGroup[] = [];

  // Artists cache
  private artistsShortTerm: any[] = [];
  private artistsMedTerm: any[] = [];
  private artistsLongTerm: any[] = [];

  // Expanded genre groups (for showing sub-genres)
  expandedGroups: Set<string> = new Set();

  constructor(
    private artistService: ArtistService,
    private genreService: GenresService,
    private toastService: ToastService
  ) {}

  ngOnInit(): void {
    this.artistsShortTerm = this.artistService.getShortTermTopArtists();

    if (this.artistsShortTerm.length === 0) {
      this.loadTopArtists();
    } else {
      this.artistsMedTerm = this.artistService.getMedTermTopArtists();
      this.artistsLongTerm = this.artistService.getLongTermTopArtists();
      this.processGenres();
    }
  }

  loadTopArtists(): void {
    this.loading = true;

    forkJoin({
      short: this.artistService.getTopArtists('short_term'),
      medium: this.artistService.getTopArtists('medium_term'),
      long: this.artistService.getTopArtists('long_term'),
    })
      .pipe(take(1))
      .subscribe({
        next: (data) => {
          this.artistsShortTerm = data.short.items;
          this.artistsMedTerm = data.medium.items;
          this.artistsLongTerm = data.long.items;

          this.artistService.setShortTermTopArtists(this.artistsShortTerm);
          this.artistService.setMedTermTopArtists(this.artistsMedTerm);
          this.artistService.setLongTermTopArtists(this.artistsLongTerm);

          this.processGenres();
        },
        error: (err) => {
          console.error('Error fetching artists', err);
          this.toastService.showNegativeToast('Error loading genres');
          this.loading = false;
        },
      });
  }

  private processGenres(): void {
    // Process weighted genres for each term
    this.genresShortTerm = this.genreService.getTopGenres(
      this.artistsShortTerm,
      'short_term'
    );
    this.genresMedTerm = this.genreService.getTopGenres(
      this.artistsMedTerm,
      'medium_term'
    );
    this.genresLongTerm = this.genreService.getTopGenres(
      this.artistsLongTerm,
      'long_term'
    );

    // Process grouped genres for each term
    this.groupedShortTerm = this.genreService.getGroupedGenres(
      this.genresShortTerm,
      'short_term'
    );
    this.groupedMedTerm = this.genreService.getGroupedGenres(
      this.genresMedTerm,
      'medium_term'
    );
    this.groupedLongTerm = this.genreService.getGroupedGenres(
      this.genresLongTerm,
      'long_term'
    );

    // Set initial display data
    this.genreList = [...this.genresShortTerm];
    this.groupedGenres = [...this.groupedShortTerm];
    this.loading = false;
  }

  selectTerm(term: string): void {
    if (term === this.selectedTerm) return;

    this.selectedTerm = term;
    this.transitioning = true;

    setTimeout(() => {
      switch (term) {
        case 'short_term':
          this.genreList = [...this.genresShortTerm];
          this.groupedGenres = [...this.groupedShortTerm];
          break;
        case 'medium_term':
          this.genreList = [...this.genresMedTerm];
          this.groupedGenres = [...this.groupedMedTerm];
          break;
        case 'long_term':
          this.genreList = [...this.genresLongTerm];
          this.groupedGenres = [...this.groupedLongTerm];
          break;
      }
      this.transitioning = false;
    }, 300);
  }

  setViewMode(mode: 'detailed' | 'grouped'): void {
    if (mode === this.viewMode) return;

    this.transitioning = true;
    setTimeout(() => {
      this.viewMode = mode;
      this.expandedGroups.clear();
      this.transitioning = false;
    }, 200);
  }

  toggleGroupExpand(groupName: string): void {
    if (this.expandedGroups.has(groupName)) {
      this.expandedGroups.delete(groupName);
    } else {
      this.expandedGroups.add(groupName);
    }
  }

  isGroupExpanded(groupName: string): boolean {
    return this.expandedGroups.has(groupName);
  }

  // Format genre name for display (capitalize)
  formatGenreName(name: string): string {
    return name
      .split(' ')
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  }

  // Get icon for genre group
  getGroupIcon(groupName: string): string {
    const icons: { [key: string]: string } = {
      rock: '🎸',
      pop: '🎤',
      'hip-hop': '🎧',
      'r&b': '🎹',
      electronic: '🎛️',
      metal: '🤘',
      country: '🤠',
      jazz: '🎷',
      classical: '🎻',
      folk: '🪕',
      latin: '💃',
      punk: '⚡',
      reggae: '🌴',
      funk: '🕺',
      blues: '🎺',
      world: '🌍',
      other: '🎵',
    };
    return icons[groupName] || '🎵';
  }

  // Get artists text (truncated if too many)
  getArtistsPreview(artists: string[], max: number = 3): string {
    if (artists.length <= max) {
      return artists.join(', ');
    }
    return artists.slice(0, max).join(', ') + ` +${artists.length - max} more`;
  }
}
