import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { SongService } from 'src/app/services/song.service';
import { QueueTrack } from 'src/app/services/queue.service';
import { take } from 'rxjs';

interface TopSong {
  id: string;
  name: string;
  artists: { id: string; name: string }[];
  album: {
    id: string;
    name: string;
    images: { url: string }[];
    release_date: string;
  };
  duration_ms: number;
  popularity: number;
  explicit: boolean;
  preview_url: string | null;
  external_urls: { spotify: string };
  flipped?: boolean;
}

@Component({
  selector: 'app-top-songs',
  templateUrl: './top-songs.component.html',
  styleUrls: ['./top-songs.component.scss'],
})
export class TopSongsComponent implements OnInit {
  topSongs: TopSong[] = [];
  loading: boolean = true;
  error: string = '';
  activeTimeRange: 'short_term' | 'medium_term' | 'long_term' = 'short_term';

  timeRanges = [
    { value: 'short_term' as const, label: 'Last 4 Weeks' },
    { value: 'medium_term' as const, label: 'Last 6 Months' },
    { value: 'long_term' as const, label: 'All Time' },
  ];

  constructor(private songService: SongService, private router: Router) {}

  ngOnInit(): void {
    this.loadTopSongs();
  }

  loadTopSongs(): void {
    this.loading = true;
    this.error = '';

    // Check for cached data first
    const cachedData = this.getCachedSongs();
    if (cachedData.length > 0) {
      this.topSongs = cachedData.map((song) => ({ ...song, flipped: false }));
      this.loading = false;
      return;
    }

    this.songService
      .getTopTracks(this.activeTimeRange, 50)
      .pipe(take(1))
      .subscribe({
        next: (response) => {
          this.topSongs = (response.items || []).map((song: any) => ({
            ...song,
            flipped: false,
          }));
          this.cacheSongs(this.topSongs);
          this.loading = false;
        },
        error: (err) => {
          console.error('Error loading top songs:', err);
          this.error = 'Failed to load your top songs. Please try again.';
          this.loading = false;
        },
      });
  }

  private getCachedSongs(): any[] {
    switch (this.activeTimeRange) {
      case 'short_term':
        return this.songService.getShortTermTopTracks();
      case 'medium_term':
        return this.songService.getMediumTermTopTracks();
      case 'long_term':
        return this.songService.getLongTermTopTracks();
      default:
        return [];
    }
  }

  private cacheSongs(songs: any[]): void {
    const short =
      this.activeTimeRange === 'short_term'
        ? songs
        : this.songService.getShortTermTopTracks();
    const medium =
      this.activeTimeRange === 'medium_term'
        ? songs
        : this.songService.getMediumTermTopTracks();
    const long =
      this.activeTimeRange === 'long_term'
        ? songs
        : this.songService.getLongTermTopTracks();
    this.songService.setTopTracks(short, medium, long);
  }

  onTimeRangeChange(range: 'short_term' | 'medium_term' | 'long_term'): void {
    if (range !== this.activeTimeRange) {
      this.activeTimeRange = range;
      this.loadTopSongs();
    }
  }

  flipCard(song: TopSong): void {
    song.flipped = !song.flipped;
  }

  getArtistNames(artists: { id: string; name: string }[]): string {
    return artists
      .slice(0, 2)
      .map((a) => a.name)
      .join(', ');
  }

  goToArtist(artistId: string, event: Event): void {
    event.stopPropagation();
    this.router.navigate(['/artist-profile', artistId]);
  }

  goToAlbum(albumId: string, event: Event): void {
    event.stopPropagation();
    this.router.navigate(['/album', albumId]);
  }

  openInSpotify(url: string, event: Event): void {
    event.stopPropagation();
    window.open(url, '_blank');
  }

  formatDuration(ms: number): string {
    const minutes = Math.floor(ms / 60000);
    const seconds = Math.floor((ms % 60000) / 1000);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  }

  formatReleaseYear(date: string): string {
    return date?.split('-')[0] || '';
  }

  getPopularityLabel(popularity: number): string {
    if (popularity >= 80) return 'Very Popular';
    if (popularity >= 60) return 'Popular';
    if (popularity >= 40) return 'Moderate';
    if (popularity >= 20) return 'Underground';
    return 'Obscure';
  }

  getQueueTrack(song: TopSong): QueueTrack {
    return {
      id: song.id,
      name: song.name,
      artists: song.artists,
      album: song.album,
      duration_ms: song.duration_ms,
      external_urls: song.external_urls,
    };
  }
}
