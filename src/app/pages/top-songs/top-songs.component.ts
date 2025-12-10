import { Component, OnInit, OnDestroy } from '@angular/core';
import { SongService } from 'src/app/services/song.service';
import { AuthService } from 'src/app/services/auth.service';
import { PlayerService } from 'src/app/services/player.service';
import { forkJoin, take } from 'rxjs';
import { ToastService } from 'src/app/services/toast.service';

@Component({
  selector: 'app-top-songs-page',
  templateUrl: './top-songs.component.html',
  styleUrls: ['./top-songs.component.scss']
})
export class TopSongsComponent implements OnInit, OnDestroy {
  loading = true;
  transitioning = false;
  selectedTerm = 'short_term';
  displayedSongs: any[] = [];
  selectedSong: any = null;
  
  private topTracksShortTerm: any[] = [];
  private topTracksMedTerm: any[] = [];
  private topTracksLongTerm: any[] = [];

  constructor(
    private authService: AuthService,
    private songService: SongService,
    private toastService: ToastService,
    private playerService: PlayerService
  ) {}

  ngOnInit(): void {
    const cached = this.songService.getShortTermTopTracks();
    
    if (cached.length === 0) {
      this.loadTopTracks();
    } else {
      this.topTracksShortTerm = cached;
      this.topTracksMedTerm = this.songService.getMedTermTopTracks();
      this.topTracksLongTerm = this.songService.getLongTermTopTracks();
      this.displayedSongs = [...this.topTracksShortTerm];
      this.loading = false;
    }
  }

  ngOnDestroy(): void {
    this.playerService.stopSong();
  }

  loadTopTracks(): void {
    this.loading = true;
    
    forkJoin({
      short: this.songService.getTopTracks('short_term'),
      medium: this.songService.getTopTracks('medium_term'),
      long: this.songService.getTopTracks('long_term')
    }).pipe(take(1)).subscribe({
      next: (data) => {
        this.topTracksShortTerm = data.short.items;
        this.topTracksMedTerm = data.medium.items;
        this.topTracksLongTerm = data.long.items;
        
        this.songService.setTopTracks(
          this.topTracksShortTerm,
          this.topTracksMedTerm,
          this.topTracksLongTerm
        );
        
        this.displayedSongs = [...this.topTracksShortTerm];
        this.loading = false;
      },
      error: (err) => {
        console.error('Error fetching top tracks', err);
        this.toastService.showNegativeToast('Error loading top songs');
        this.loading = false;
      }
    });
  }

  selectTerm(term: string): void {
    if (term === this.selectedTerm) return;
    
    this.selectedTerm = term;
    this.songService.setCurrentTerm(term);
    
    // Fade transition
    this.transitioning = true;
    
    setTimeout(() => {
      switch (term) {
        case 'short_term':
          this.displayedSongs = [...this.topTracksShortTerm];
          break;
        case 'medium_term':
          this.displayedSongs = [...this.topTracksMedTerm];
          break;
        case 'long_term':
          this.displayedSongs = [...this.topTracksLongTerm];
          break;
      }
      this.transitioning = false;
    }, 300);
  }

  flipCard(song: any, event: Event): void {
    event.stopPropagation();
    
    // Reset other flipped cards
    this.displayedSongs.forEach(s => {
      if (s !== song) s.flipped = false;
    });
    
    song.flipped = !song.flipped;
    
    if (song.flipped && !song.duration) {
      this.loadSongStats(song);
    }
    
    this.selectedSong = song.flipped ? song : null;
  }

  private loadSongStats(song: any): void {
    this.songService.getSongStats(song.id).pipe(take(1)).subscribe({
      next: (stats) => {
        song.duration = this.formatDuration(stats.duration_ms);
        song.acousticness = stats.acousticness;
        song.danceability = stats.danceability;
        song.energy = stats.energy;
        song.instrumentalness = stats.instrumentalness;
        song.liveness = stats.liveness;
        song.loudness = stats.loudness;
        song.speechiness = stats.speechiness;
        song.tempo = stats.tempo;
        song.valence = stats.valence;
        this.selectedSong = song;
      },
      error: (err) => {
        console.error('Error fetching song stats', err);
      }
    });
  }

  private formatDuration(ms: number): string {
    const minutes = Math.floor(ms / 60000);
    const seconds = Math.floor((ms % 60000) / 1000);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  }

  onSongHover(song: any): void {
    this.playerService.playerReady$.pipe(take(1)).subscribe(ready => {
      if (ready) {
        this.playerService.playSong(song.id);
      }
    });
  }

  onSongLeave(): void {
    this.playerService.playerReady$.pipe(take(1)).subscribe(ready => {
      if (ready) {
        this.playerService.stopSong();
      }
    });
  }

  formatArtists(artists: any[]): string {
    return artists?.map(a => a.name).join(', ') || '';
  }
}
