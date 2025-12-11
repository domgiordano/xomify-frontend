import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { AuthGuard } from './guards/auth.guard';

// Pages
import { HomeComponent } from './pages/home/home.component';
import { CallbackComponent } from './components/callback/callback.component';
import { MyProfileComponent } from './pages/my-profile/my-profile.component';
import { TopSongsComponent } from './pages/top-songs/top-songs.component';
import { TopArtistsComponent } from './pages/top-artists/top-artists.component';
import { TopGenresComponent } from './pages/top-genres/top-genres.component';
import { ArtistProfileComponent } from './pages/artist-profile/artist-profile.component';
import { FollowingComponent } from './pages/following/following.component';

const routes: Routes = [
  { path: '', component: HomeComponent },
  { path: 'callback', component: CallbackComponent },
  { 
    path: 'my-profile', 
    component: MyProfileComponent, 
    canActivate: [AuthGuard] 
  },
  { 
    path: 'top-songs', 
    component: TopSongsComponent, 
    canActivate: [AuthGuard] 
  },
  { 
    path: 'top-artists', 
    component: TopArtistsComponent, 
    canActivate: [AuthGuard] 
  },
  { 
    path: 'top-genres', 
    component: TopGenresComponent, 
    canActivate: [AuthGuard] 
  },
  { 
    path: 'artist-profile/:id', 
    component: ArtistProfileComponent, 
    canActivate: [AuthGuard] 
  },
  { 
    path: 'following', 
    component: FollowingComponent, 
    canActivate: [AuthGuard] 
  },
  // Catch-all redirect
  { path: '**', redirectTo: '' }
];

@NgModule({
  imports: [RouterModule.forRoot(routes)],
  exports: [RouterModule]
})
export class AppRoutingModule { }
