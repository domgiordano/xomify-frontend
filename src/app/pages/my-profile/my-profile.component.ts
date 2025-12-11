import { Component, OnInit } from '@angular/core';
import { AuthService } from 'src/app/services/auth.service';
import { UserService } from 'src/app/services/user.service';
import { forkJoin, take } from 'rxjs';
import { ToastService } from 'src/app/services/toast.service';

@Component({
  selector: 'app-my-profile-page',
  templateUrl: './my-profile.component.html',
  styleUrls: ['./my-profile.component.scss']
})
export class MyProfileComponent implements OnInit {
  loading: boolean = true;
  profilePicture: string = '';
  userName: string = '';
  email: string = '';
  followersCount: number = 0;
  followingCount: number = 0;
  playlistCount: number = 0;
  country: string = '';
  product: string = '';
  userId: string = '';
  spotifyProfileUrl: string = '';
  user: any;
  accessToken: string = '';
  wrappedEnrolled: boolean = false;
  releaseRadarEnrolled: boolean = false;
  maxEnrollAttempts = 5;
  enrollAttempts = 0;
  disableEnrollButtons: boolean = false;
  maxReached: boolean = false;

  constructor(
    private AuthService: AuthService,
    private UserService: UserService,
    private ToastService: ToastService
  ) {}

  ngOnInit(): void {
    this.accessToken = this.AuthService.getAccessToken();
    this.userName = this.UserService.getUserName();
    
    if (this.userName.length === 0) {
      console.log("Need User.");
      this.loadUser();
    } else {
      console.log("We got dat user.");
      this.populateUserData();
      this.loadAdditionalData();
    }
  }

  private populateUserData(): void {
    this.user = this.UserService.getUser();
    this.userName = this.UserService.getUserName();
    this.profilePicture = this.UserService.getProfilePic();
    this.email = this.UserService.getEmail();
    this.followersCount = this.UserService.getFollowers();
    this.wrappedEnrolled = this.UserService.getWrappedEnrollment();
    this.releaseRadarEnrolled = this.UserService.getReleaseRadarEnrollment();
    
    // Check cached counts first
    const cachedPlaylistCount = this.UserService.getPlaylistCount();
    const cachedFollowingCount = this.UserService.getFollowingCount();
    
    if (cachedPlaylistCount > 0) {
      this.playlistCount = cachedPlaylistCount;
    }
    if (cachedFollowingCount > 0) {
      this.followingCount = cachedFollowingCount;
    }
    
    // Additional user data
    if (this.user) {
      this.country = this.user.country || 'Unknown';
      this.product = this.user.product || 'free';
      this.userId = this.user.id || '';
      this.spotifyProfileUrl = this.user.external_urls?.spotify || 'https://open.spotify.com';
    }
  }

  loadUser(): void {
    this.loading = true;
    this.UserService.getUserData().pipe(take(1)).subscribe({
      next: data => {
        console.log("USER------", data);
        this.UserService.setUser(data);
        this.populateUserData();
        this.loadAdditionalData();
        this.updateUserTable();
      },
      error: err => {
        console.error('Error fetching User', err);
        this.ToastService.showNegativeToast('Error fetching User');
        this.loading = false;
      },
      complete: () => {
        console.log('User Loaded.');
      }
    });
  }

  private loadAdditionalData(): void {
    // Load playlist count and following count in parallel
    forkJoin({
      playlists: this.UserService.getUserPlaylists(1),
      following: this.UserService.getFollowedArtists(1)
    }).pipe(take(1)).subscribe({
      next: (data) => {
        // Playlists total
        this.playlistCount = data.playlists?.total || 0;
        this.UserService.setPlaylistCount(this.playlistCount);
        
        // Following total (artists)
        this.followingCount = data.following?.artists?.total || 0;
        this.UserService.setFollowingCount(this.followingCount);
        
        console.log('Playlist count:', this.playlistCount);
        console.log('Following count:', this.followingCount);
        
        this.loading = false;
      },
      error: (err) => {
        console.error('Error fetching additional data', err);
        this.loading = false;
      }
    });
  }

  updateUserTable(): void {
    console.log('Updating User Table ...');
    this.UserService.updateUserTableRefreshToken().pipe(take(1)).subscribe({
      next: xomUser => {
        console.log("Updated Xomify USER Table------", xomUser);
        this.wrappedEnrolled = xomUser.activeWrapped ?? false;
        this.releaseRadarEnrolled = xomUser.activeReleaseRadar ?? false;
        this.UserService.setReleaseRadarEnrollment(this.releaseRadarEnrolled);
        this.UserService.setWrappedEnrollment(this.wrappedEnrolled);
      },
      error: err => {
        console.error('Error Updating User Table', err);
        // Don't show toast for this, it's a background operation
      },
      complete: () => {
        console.log('User Table Updated.');
      }
    });
  }

  toggleWrapped(): void {
    console.log("Toggling Wrapped Enrollment...");
    this.wrappedEnrolled = !this.wrappedEnrolled;
    this.toggleEnrollments();
  }

  toggleReleaseRadar(): void {
    console.log("Toggling Release Radar Enrollment...");
    this.releaseRadarEnrolled = !this.releaseRadarEnrolled;
    this.toggleEnrollments();
  }

  toggleEnrollments(): void {
    if (this.maxReached) {
      return;
    }

    console.log("Updating Enrollments..");
    this.disableEnrollButtons = true;
    this.enrollAttempts++;

    this.UserService.updateUserTableEnrollments(this.wrappedEnrolled, this.releaseRadarEnrolled)
      .pipe(take(1))
      .subscribe({
        next: xomUser => {
          console.log("Updated Xomify USER Table------", xomUser);
          this.UserService.setReleaseRadarEnrollment(this.releaseRadarEnrolled);
          this.UserService.setWrappedEnrollment(this.wrappedEnrolled);
        },
        error: err => {
          console.error('Error Updating User Table', err);
          this.ToastService.showNegativeToast('Error Updating User Table');
          // Revert on error
          if (this.wrappedEnrolled !== this.UserService.getWrappedEnrollment()) {
            this.wrappedEnrolled = !this.wrappedEnrolled;
          }
          if (this.releaseRadarEnrolled !== this.UserService.getReleaseRadarEnrollment()) {
            this.releaseRadarEnrolled = !this.releaseRadarEnrolled;
          }
          this.disableEnrollButtons = false;
        },
        complete: () => {
          console.log('User Table Updated.');
          this.ToastService.showPositiveToast('Preferences updated successfully!');
          if (this.enrollAttempts >= this.maxEnrollAttempts) {
            this.maxReached = true;
            this.disableEnrollButtons = true;
          } else {
            setTimeout(() => {
              if (!this.maxReached) {
                this.disableEnrollButtons = false;
              }
            }, 1000);
          }
        }
      });
  }
}
