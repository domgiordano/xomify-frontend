import { NgModule } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';
import { HttpClientModule } from '@angular/common/http';

import { AppRoutingModule } from './app-routing.module';
import { AppComponent } from './app.component';
import { BrowserAnimationsModule } from '@angular/platform-browser/animations';
import { ToolbarComponent } from './components/toolbar/toolbar.component';
import { FormsModule } from '@angular/forms';
import { MyProfileComponent } from './pages/my-profile/my-profile.component';
import { MyPlaylistsComponent } from './pages/my-playlists/my-playlists.component';
import { PlaylistDetailComponent } from './pages/playlist-detail/playlist-detail.component';
import { TopSongsComponent } from './pages/top-songs/top-songs.component';
import { TopArtistsComponent } from './pages/top-artists/top-artists.component';
import { TopGenresComponent } from './pages/top-genres/top-genres.component';
import { PlaylistGeneratorComponent } from './pages/playlist-generator/playlist-generator.component';
import { WrappedComponent } from './pages/wrapped/wrapped.component';
import { AuthService } from './services/auth.service';
import { LoaderComponent } from './components/loader/loader.component';
import { ToastComponent } from './components/toast/toast.component';
import { CallbackComponent } from './components/callback/callback.component';
import { HomeComponent } from './pages/home/home.component';
import { ArtistProfileComponent } from './pages/artist-profile/artist-profile.component';
import { FollowingComponent } from './pages/following/following.component';
import { SwiperModule } from 'swiper/angular';
import { FooterComponent } from './components/footer/footer.component';

@NgModule({
  declarations: [
    AppComponent,
    ToolbarComponent,
    MyProfileComponent,
    MyPlaylistsComponent,
    PlaylistDetailComponent,
    TopSongsComponent,
    TopArtistsComponent,
    TopGenresComponent,
    PlaylistGeneratorComponent,
    WrappedComponent,
    LoaderComponent,
    ToastComponent,
    CallbackComponent,
    HomeComponent,
    ArtistProfileComponent,
    FollowingComponent,
    FooterComponent,
  ],
  imports: [
    BrowserModule,
    AppRoutingModule,
    FormsModule,
    HttpClientModule,
    SwiperModule,
    BrowserAnimationsModule,
    FormsModule,
  ],
  providers: [AuthService],
  bootstrap: [AppComponent],
})
export class AppModule {}
