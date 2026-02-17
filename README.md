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

- `GET /wrapped/all` - User's wrapped history
- `POST /user/update` - Update user enrollments
- `GET /user/data` - Get user data

See the backend README for API documentation.

## Development Workflow

### Version Management

We follow [Semantic Versioning](https://semver.org/):

- **MAJOR** (X.0.0): Breaking changes or major feature overhauls
- **MINOR** (0.X.0): New features (backward-compatible)
- **PATCH** (0.0.X): Bug fixes (backward-compatible)

#### Bumping Versions

Use the built-in npm scripts to bump versions:

```bash
# For bug fixes
npm run version:patch   # 2.1.0 -> 2.1.1

# For new features
npm run version:minor   # 2.1.0 -> 2.2.0

# For breaking changes
npm run version:major   # 2.1.0 -> 3.0.0
```

This will:

1. Update `package.json` version
2. Update `CHANGELOG.md` with new version section
3. Create a git commit
4. Create a git tag

After running the script:

1. Update the `[Unreleased]` section in CHANGELOG.md with your changes
2. Commit any additional CHANGELOG updates
3. Push changes to master to trigger deployment

#### CHANGELOG

All notable changes are documented in [CHANGELOG.md](./CHANGELOG.md). When adding new features or fixes:

1. Add entries under the `[Unreleased]` section
2. Categorize changes as: Added, Changed, Deprecated, Removed, Fixed, or Security
3. When ready to release, run the version bump script

## Deployment

### Automatic Deployment (Production)

The app automatically deploys to production when code is pushed to the `master` branch:

1. GitHub Actions workflow triggers on push to `master`
2. Builds the Angular app with production configuration
3. Retrieves Spotify credentials from AWS SSM Parameter Store
4. Deploys to S3 bucket (s3://xomify.xomware.com)
5. Sets cache headers (index.html is non-cacheable)
6. Creates GitHub release with version tag
7. Generates deployment summary

**Deployment URL:** https://xomify.xomware.com

### Manual Deployment

Trigger a manual deployment from GitHub Actions:

1. Go to Actions tab
2. Select "Deploy Xomify Frontend" workflow
3. Click "Run workflow"
4. Choose the branch to deploy

### Deployment Checklist

Before deploying to production:

- [ ] All features tested locally
- [ ] CHANGELOG.md updated with changes
- [ ] Version bumped if needed (using `npm run version:*`)
- [ ] All tests passing (if applicable)
- [ ] Code reviewed and approved
- [ ] Merged to master branch

### Environment Variables

The deployment workflow automatically injects these from AWS SSM:

- `SPOTIFY_CLIENT_ID`
- `SPOTIFY_CLIENT_SECRET`
- `API_AUTH_TOKEN`
- `API_ID`

### Monitoring Deployments

- **GitHub Actions**: View deployment logs in the Actions tab
- **S3 Bucket**: Check s3://xomify.xomware.com for deployed files
- **Live Site**: Verify at https://xomify.xomware.com

## Release Process

### Creating a New Release

1. **Update Code & CHANGELOG**

   ```bash
   # Make your changes
   git add .
   git commit -m "feat: add new feature"

   # Update CHANGELOG.md [Unreleased] section
   # Add your changes under appropriate category
   ```

2. **Bump Version**

   ```bash
   # Choose appropriate version bump
   npm run version:minor
   ```

3. **Push to Master**

   ```bash
   git push origin master
   git push origin v2.2.0  # Push the tag
   ```

4. **Automatic Deployment**
   - GitHub Actions will build and deploy
   - A GitHub Release will be created automatically
   - Check Actions tab for deployment status

### Release Notes

Release notes are automatically generated from:

- Version tag
- CHANGELOG.md content
- Commit SHA and deployment info

View releases at: https://github.com/your-org/xomify-frontend/releases
