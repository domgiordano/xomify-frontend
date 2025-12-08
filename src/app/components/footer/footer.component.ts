import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { PlaylistService } from 'src/app/services/playlist.service';
import { SongService } from 'src/app/services/song.service';
import { UserService } from 'src/app/services/user.service';
import { Observable, take } from 'rxjs';
import { ToastService } from 'src/app/services/toast.service';
import { environment } from 'src/environments/environment.prod';

@Component({
  selector: 'app-footer',
  templateUrl: './footer.component.html',
  styleUrls: ['./footer.component.scss'],
})
export class FooterComponent implements OnInit {
  showDynamicButton: boolean = false;
  footerButtonText: string = '';
  githubRepoUrl: string = 'https://github.com/domgiordano/xomify-frontend';
  userId: string;

  constructor(
    private router: Router,
    private SongService: SongService,
    private PlaylistService: PlaylistService,
    private UserService: UserService,
    private ToastService: ToastService
  ) {}

  ngOnInit() {
    this.userId = this.UserService.getUserId();
    this.router.events.subscribe(() => {
      const url = this.router.url;

      // Example logic to show/hide button based on the route
      if (url.includes('/artist')) {
        this.showDynamicButton = true;
        this.footerButtonText = 'Go Back';
      } else if (url.includes('/top-songs')) {
        this.showDynamicButton = true;
        this.footerButtonText = 'Download Playlist';
      } else {
        this.showDynamicButton = false;
      }
    });
  }

  private uploadImage$(
    playlistId: string,
    base64Image: string
  ): Observable<any> {
    return new Observable((observer) => {
      // Extract the base64 string if it includes the data URL prefix
      //const base64String = base64Image.split(',')[1];
      const base64String = base64Image.replace(/\n/g, '');

      this.PlaylistService.uploadPlaylistImage(
        playlistId,
        base64String
      ).subscribe({
        next: (data) => {
          observer.next(data);
          observer.complete();
        },
        error: (err) => {
          observer.error(err);
        },
      });
    });
  }

  handleDynamicButtonClick() {
    const url = this.router.url;

    if (url.includes('/artist')) {
      this.router.navigate(['/top-artists']);
    } else if (url.includes('/top-songs')) {
      // Get Top Tracks by term
      const currentTerm = this.SongService.getCurrentTerm();
      const today = new Date();
      const formattedDate = today.toISOString().split('T')[0];
      let currentTopSongs = [];
      let playlistName = '';
      let playlistDesc = 'Top songs created by https://xomify.com';

      if (currentTerm == 'short_term') {
        currentTopSongs = this.SongService.getShortTermTopTracks();
        playlistName = `Last Month Top Songs: ${formattedDate}`;
      } else if (currentTerm == 'medium_term') {
        currentTopSongs = this.SongService.getMedTermTopTracks();
        playlistName = `Last 6 Months Top Songs: ${formattedDate}`;
      } else {
        currentTopSongs = this.SongService.getLongTermTopTracks();
        playlistName = `Last Year Top Songs: ${formattedDate}`;
      }

      let currentTopSongsUriList: string[] = currentTopSongs.map(
        (track) => track.uri
      );
      this.userId = this.UserService.getUserId();
      this.PlaylistService.createPlaylist(
        this.userId,
        playlistName,
        playlistDesc
      )
        .pipe(take(1))
        .subscribe({
          next: (playlist) => {
            this.PlaylistService.addPlaylistSongs(
              playlist,
              currentTopSongsUriList
            )
              .pipe(take(1))
              .subscribe({
                next: (data) => {
                  console.log(data);
                  // Now upload the image
                  this.uploadImage$(
                    playlist.id,
                    environment.logoBase64
                  ).subscribe({
                    next: (imageData) => {
                      console.log('Image uploaded successfully:', imageData);
                    },
                    error: (err) => {
                      console.error('Error uploading image:', err);
                      this.ToastService.showNegativeToast(
                        'Error uploading playlist image'
                      );
                    },
                    complete: () => {
                      console.log('Image upload complete.');
                    },
                  });
                },
                error: (err) => {
                  console.error('Error Adding Items to Playlist', err);
                  this.ToastService.showNegativeToast(
                    'Error adding songs to playlist'
                  );
                },
                complete: () => {
                  console.log('Adding Items to Playlist Complete.');
                  this.ToastService.showPositiveToast(
                    'Playlist successfully added to your Spotify account!'
                  );
                },
              });
          },
          error: (err) => {
            console.error('Error Creating Playlist', err);
            this.ToastService.showNegativeToast('Error creating playlist');
          },
          complete: () => {
            console.log('Playlist Created.');
          },
        });
    }
  }

  openGitHubRepo() {
    window.open(this.githubRepoUrl, '_blank');
  }
}
