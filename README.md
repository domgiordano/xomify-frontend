# Xomify Frontend

A Spotify-powered music analytics and discovery application built with Angular.

## Features

### 🎵 Music Analytics

- **Top Songs** - View your most played tracks across different time ranges (4 weeks, 6 months, all time)
- **Top Artists** - Discover your most listened-to artists with detailed stats
- **Top Genres** - See which genres dominate your listening habits

### 📊 Monthly Wrapped

- Automatic monthly snapshots of your listening data
- Navigate through your listening history month by month
- Compare stats across different time periods
- View top songs, artists, and genres for each month

### 📅 Release Radar

- Calendar view of new releases from artists you follow
- Filter by albums, singles, or all releases
- Never miss new music from your favorite artists
- Weekly playlist generation with latest releases

### 🎧 Playback Features

- Built-in Spotify Web Playback SDK integration
- Play/pause controls directly in the app
- Queue management and track queuing
- Seamless playback of any track

### 👤 Profile & Discovery

- View your Spotify profile and stats
- Browse artist profiles with discographies
- Explore album details and track listings
- Build custom playlists

## Tech Stack

- **Framework**: Angular 15+
- **Styling**: SCSS with custom theming
- **API Integration**: Spotify Web API
- **Playback**: Spotify Web Playback SDK
- **State Management**: RxJS + Services
- **Authentication**: Spotify OAuth 2.0

## Getting Started

### Prerequisites

- Node.js 18+
- npm or yarn
- Spotify Developer Account

### Installation

```bash
# Install dependencies
npm install

# Set up environment
cp src/environments/environment.example.ts src/environments/environment.ts
# Edit environment.ts with your Spotify API credentials

# Start development server
ng serve
```

### Environment Configuration

```typescript
// src/environments/environment.ts
export const environment = {
  production: false,
  apiId: "your-api-gateway-id",
  apiAuthToken: "your-api-auth-token",
  spotifyClientId: "your-spotify-client-id",
};
```

## Project Structure

```
src/app/
├── components/
│   ├── toolbar/           # Main navigation
│   ├── play-button/       # Playback controls
│   └── add-to-queue-button/
├── pages/
│   ├── my-profile/        # User profile dashboard
│   ├── top-songs/         # Top tracks view
│   ├── wrapped/           # Monthly wrapped history
│   ├── release-radar/     # Release calendar
│   ├── queue-builder/     # Playlist builder
│   ├── artist-profile/    # Artist details
│   ├── album-detail/      # Album details
│   └── following/         # Followed artists
└── services/
    ├── user.service.ts    # User data & auth
    ├── player.service.ts  # Spotify playback
    ├── queue.service.ts   # Queue management
    ├── wrapped.service.ts # Wrapped data
    ├── song.service.ts    # Track API calls
    └── artist.service.ts  # Artist API calls
```

## API Dependencies

This frontend requires a backend API with the following endpoints:

- `GET /wrapped/data` - User's wrapped history
- `POST /user/user-table` - Update user enrollments
- `GET /user/user-table` - Get user data

See the backend README for API documentation.
