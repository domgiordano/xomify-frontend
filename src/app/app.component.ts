// Main file - Angular Spotify
import { Component, OnDestroy, OnInit } from '@angular/core';
import { AuthService } from './services/auth.service';
import { Router, NavigationStart } from '@angular/router';
import { PlayerService } from './services/player.service';
import { filter } from 'rxjs/operators';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.scss'],
})
export class AppComponent implements OnDestroy, OnInit {
  title = 'XOMIFY';

  constructor(
    private AuthService: AuthService,
    private router: Router,
    private playerService: PlayerService
  ) {}
  ngOnInit(): void {
    // Stop music playback when navigating between pages
    this.router.events
      .pipe(filter((event) => event instanceof NavigationStart))
      .subscribe(() => {
        this.playerService.stopSong();
      });
  }
  ngOnDestroy(): void {
    this.AuthService.logout();
  }
}
