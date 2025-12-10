import { Component, OnInit } from '@angular/core';
import { AuthService } from 'src/app/services/auth.service';
import { forkJoin, take } from 'rxjs';
import { ArtistService } from 'src/app/services/artist.service';
import { GenresService } from 'src/app/services/genre.service';
import { ToastService } from 'src/app/services/toast.service';

interface GenreItem {
  name: string;
  count: number;
  percentage: number;
}

@Component({
  selector: 'app-top-genres-page',
  templateUrl: './top-genres.component.html',
  styleUrls: ['./top-genres.component.scss']
})
export class TopGenresComponent implements OnInit {
  loading = true;
  transitioning = false;
  selectedTerm = 'short_term';
  genreList: GenreItem[] = [];
  
  private genresShortTerm: GenreItem[] = [];
  private genresMedTerm: GenreItem[] = [];
  private genresLongTerm: GenreItem[] = [];
  
  private artistsShortTerm: any[] = [];
  private artistsMedTerm: any[] = [];
  private artistsLongTerm: any[] = [];

  constructor(
    private authService: AuthService,
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
      long: this.artistService.getTopArtists('long_term')
    }).pipe(take(1)).subscribe({
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
      }
    });
  }

  private processGenres(): void {
    this.genresShortTerm = this.extractGenres(this.artistsShortTerm);
    this.genresMedTerm = this.extractGenres(this.artistsMedTerm);
    this.genresLongTerm = this.extractGenres(this.artistsLongTerm);
    
    this.genreList = [...this.genresShortTerm];
    this.loading = false;
  }

  private extractGenres(artists: any[]): GenreItem[] {
    const genreMap = new Map<string, number>();
    
    artists.forEach(artist => {
      (artist.genres || []).forEach((genre: string) => {
        genreMap.set(genre, (genreMap.get(genre) || 0) + 1);
      });
    });
    
    const sorted = Array.from(genreMap.entries())
      .sort((a, b) => b[1] - a[1]);
    
    const maxCount = sorted.length > 0 ? sorted[0][1] : 1;
    
    return sorted.map(([name, count]) => ({
      name,
      count,
      percentage: (count / maxCount) * 100
    }));
  }

  selectTerm(term: string): void {
    if (term === this.selectedTerm) return;
    
    this.selectedTerm = term;
    
    // Fade transition
    this.transitioning = true;
    
    setTimeout(() => {
      switch (term) {
        case 'short_term':
          this.genreList = [...this.genresShortTerm];
          break;
        case 'medium_term':
          this.genreList = [...this.genresMedTerm];
          break;
        case 'long_term':
          this.genreList = [...this.genresLongTerm];
          break;
      }
      this.transitioning = false;
    }, 300);
  }
}
