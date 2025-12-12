# Xomify Frontend

Spotify API app - Angular Frontend

**Live Site:** https://xomify.com (email dominickj.giordano@gmail.com to get whitelisted - dev mode)

## Repositories

- **Frontend:** https://github.com/domgiordano/xomify-frontend
- **Backend:** https://github.com/domgiordano/python-spotify
- **Infrastructure:** https://github.com/domgiordano/angular-spotify-infrastructure
- **Terraform Workspace:** https://app.terraform.io/app/Domjgiordano/workspaces/angular-spotify-infrastructure

## Development

### Prerequisites

- Node.js 18+
- Angular CLI (`npm install -g @angular/cli`)

### Local Setup

1. Clone the repository:

   ```bash
   git clone https://github.com/domgiordano/xomify-frontend.git
   cd xomify-frontend
   ```

2. Install dependencies:

   ```bash
   npm install
   ```

3. Create your local environment file:

   ```bash
   cp src/environments/environment.example.ts src/environments/environment.dev.ts
   ```

   Then fill in your Spotify credentials and API details.

4. Start the development server:
   ```bash
   npm start
   ```
   The app will be available at `http://localhost:4200`

### Build

```bash
# Development build
npm run build

# Production build
npm run build:prod
```

## Environment Configuration

- `environment.ts` - Base/template configuration
- `environment.dev.ts` - Local development (gitignored)
- `environment.prod.ts` - Production (CI/CD replaces placeholders)

## Features

- 🎵 View your Spotify profile
- 📊 Top songs, artists, and genres analytics
- 📅 Monthly wrapped insights
- 🎨 Clean, modern UI with purple/green theme
