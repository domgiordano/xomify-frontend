import { Component, OnInit } from '@angular/core';
import { AuthService } from 'src/app/services/auth.service';
import { forkJoin, take } from 'rxjs';
import { ArtistService } from 'src/app/services/artist.service';
import { ToastService } from 'src/app/services/toast.service';

@Component({
  selector: 'app-top-artists-page',
  templateUrl: './top-artists.component.html',
  styleUrls: ['./top-artists.component.scss']
})
export class TopArtistsComponent implements OnInit {
  loading = true;
  transitioning = false;
  selectedTerm = 'short_term';
  displayedArtists: any[] = [];
  
  private topArtistsShortTerm: any[] = [];
  private topArtistsMedTerm: any[] = [];
  private topArtistsLongTerm: any[] = [];

  constructor(
    private authService: AuthService,
    private artistService: ArtistService,
    private toastService: ToastService
  ) {}

  ngOnInit(): void {
    const cached = this.artistService.getShortTermTopArtists();
    
    if (cached.length === 0) {
      this.loadTopArtists();
    } else {
      this.topArtistsShortTerm = cached;
      this.topArtistsMedTerm = this.artistService.getMedTermTopArtists();
      this.topArtistsLongTerm = this.artistService.getLongTermTopArtists();
      this.displayedArtists = [...this.topArtistsShortTerm];
      this.loading = false;
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
        this.topArtistsShortTerm = data.short.items;
        this.topArtistsMedTerm = data.medium.items;
        this.topArtistsLongTerm = data.long.items;
        
        this.artistService.setShortTermTopArtists(this.topArtistsShortTerm);
        this.artistService.setMedTermTopArtists(this.topArtistsMedTerm);
        this.artistService.setLongTermTopArtists(this.topArtistsLongTerm);
        
        this.displayedArtists = [...this.topArtistsShortTerm];
        this.loading = false;
      },
      error: (err) => {
        console.error('Error fetching top artists', err);
        this.toastService.showNegativeToast('Error loading top artists');
        this.loading = false;
      }
    });
  }

  selectTerm(term: string): void {
    if (term === this.selectedTerm) return;
    
    this.selectedTerm = term;
    
    // Fade transition
    this.transitioning = true;
    
    setTimeout(() => {
      switch (term) {
        case 'short_term':
          this.displayedArtists = [...this.topArtistsShortTerm];
          break;
        case 'medium_term':
          this.displayedArtists = [...this.topArtistsMedTerm];
          break;
        case 'long_term':
          this.displayedArtists = [...this.topArtistsLongTerm];
          break;
      }
      this.transitioning = false;
    }, 300);
  }
}
