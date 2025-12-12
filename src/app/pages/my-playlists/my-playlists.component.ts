import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { UserService } from 'src/app/services/user.service';
import { PlaylistService } from 'src/app/services/playlist.service';
import { ToastService } from 'src/app/services/toast.service';
import { take } from 'rxjs';

@Component({
  selector: 'app-my-playlists',
  templateUrl: './my-playlists.component.html',
  styleUrls: ['./my-playlists.component.scss'],
})
export class MyPlaylistsComponent implements OnInit {
  loading = true;
  allPlaylists: any[] = [];
  filteredPlaylists: any[] = [];
  searchQuery = '';
  sortBy = 'recent';
  userId: string = '';

  constructor(
    private userService: UserService,
    private playlistService: PlaylistService,
    private toastService: ToastService,
    private router: Router
  ) {}

  ngOnInit(): void {
    this.userId = this.userService.getUserId();
    this.loadPlaylists();
  }

  loadPlaylists(): void {
    this.loading = true;

    this.playlistService
      .getAllUserPlaylists()
      .pipe(take(1))
      .subscribe({
        next: (playlists) => {
          this.allPlaylists = playlists;
          this.filteredPlaylists = [...playlists];
          this.sortPlaylists();
          this.loading = false;
          console.log(`Loaded ${playlists.length} playlists`);
        },
        error: (err) => {
          console.error('Error loading playlists', err);
          this.toastService.showNegativeToast('Error loading playlists');
          this.loading = false;
        },
      });
  }

  filterPlaylists(): void {
    const query = this.searchQuery.toLowerCase().trim();

    if (!query) {
      this.filteredPlaylists = [...this.allPlaylists];
    } else {
      this.filteredPlaylists = this.allPlaylists.filter(
        (playlist) =>
          playlist.name.toLowerCase().includes(query) ||
          playlist.description?.toLowerCase().includes(query)
      );
    }

    this.sortPlaylists();
  }

  clearSearch(): void {
    this.searchQuery = '';
    this.filterPlaylists();
  }

  sortPlaylists(): void {
    switch (this.sortBy) {
      case 'name':
        this.filteredPlaylists.sort((a, b) => a.name.localeCompare(b.name));
        break;
      case 'name-desc':
        this.filteredPlaylists.sort((a, b) => b.name.localeCompare(a.name));
        break;
      case 'tracks':
        this.filteredPlaylists.sort(
          (a, b) => (b.tracks?.total || 0) - (a.tracks?.total || 0)
        );
        break;
      case 'recent':
        // Keep original order (API returns most recent first)
        break;
    }
  }

  goToPlaylist(playlistId: string): void {
    this.router.navigate(['/playlist', playlistId]);
  }
}
