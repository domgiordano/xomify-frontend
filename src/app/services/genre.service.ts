import { Injectable } from '@angular/core';

export interface GenreItem {
  name: string;
  count: number; // Raw count (for backward compat)
  score: number; // Weighted score
  percentage: number; // Percentage of total
  artists: string[]; // Artist names that have this genre
}

export interface GenreGroup {
  name: string;
  genres: string[]; // Sub-genres included
  score: number;
  percentage: number;
  artists: string[];
}

// Parent genre mappings - maps specific genres to broader categories
const GENRE_PARENT_MAP: { [parent: string]: string[] } = {
  rock: [
    'rock',
    'indie rock',
    'alternative rock',
    'modern rock',
    'art rock',
    'hard rock',
    'soft rock',
    'classic rock',
    'garage rock',
    'punk rock',
    'post-punk',
    'new wave',
    'grunge',
    'psychedelic rock',
    'progressive rock',
    'blues rock',
    'folk rock',
    'southern rock',
    'glam rock',
    'stoner rock',
  ],
  pop: [
    'pop',
    'indie pop',
    'synth-pop',
    'synthpop',
    'electropop',
    'dance pop',
    'art pop',
    'dream pop',
    'chamber pop',
    'baroque pop',
    'power pop',
    'teen pop',
    'k-pop',
    'j-pop',
    'c-pop',
    'latin pop',
    'europop',
  ],
  'hip-hop': [
    'hip hop',
    'rap',
    'trap',
    'southern hip hop',
    'conscious hip hop',
    'east coast hip hop',
    'west coast hip hop',
    'gangsta rap',
    'boom bap',
    'drill',
    'mumble rap',
    'alternative hip hop',
    'underground hip hop',
    'dirty south',
    'crunk',
    'grime',
    'uk hip hop',
  ],
  'r&b': [
    'r&b',
    'soul',
    'neo soul',
    'contemporary r&b',
    'urban contemporary',
    'new jack swing',
    'quiet storm',
    'motown',
    'rhythm and blues',
    'alternative r&b',
    'pnb r&b',
  ],
  electronic: [
    'electronic',
    'edm',
    'house',
    'techno',
    'dubstep',
    'drum and bass',
    'dnb',
    'trance',
    'ambient',
    'idm',
    'electronica',
    'electro',
    'future bass',
    'tropical house',
    'deep house',
    'tech house',
    'progressive house',
    'big room',
    'hardstyle',
    'uk garage',
    'breakbeat',
  ],
  metal: [
    'metal',
    'heavy metal',
    'death metal',
    'black metal',
    'thrash metal',
    'doom metal',
    'power metal',
    'progressive metal',
    'nu metal',
    'metalcore',
    'deathcore',
    'djent',
    'symphonic metal',
    'folk metal',
    'industrial metal',
    'groove metal',
    'sludge metal',
  ],
  country: [
    'country',
    'contemporary country',
    'country rock',
    'alt-country',
    'americana',
    'bluegrass',
    'country pop',
    'bro-country',
    'outlaw country',
    'texas country',
    'red dirt',
    'nashville sound',
  ],
  jazz: [
    'jazz',
    'smooth jazz',
    'jazz fusion',
    'bebop',
    'cool jazz',
    'free jazz',
    'acid jazz',
    'nu jazz',
    'swing',
    'big band',
    'vocal jazz',
    'latin jazz',
    'contemporary jazz',
    'jazz rap',
  ],
  classical: [
    'classical',
    'orchestra',
    'symphonic',
    'baroque',
    'romantic',
    'opera',
    'chamber music',
    'piano',
    'violin',
    'contemporary classical',
    'neoclassical',
    'minimalism',
  ],
  folk: [
    'folk',
    'indie folk',
    'folk rock',
    'contemporary folk',
    'traditional folk',
    'singer-songwriter',
    'acoustic',
    'freak folk',
    'anti-folk',
    'neofolk',
  ],
  latin: [
    'latin',
    'reggaeton',
    'latin pop',
    'salsa',
    'bachata',
    'merengue',
    'cumbia',
    'latin rock',
    'latin hip hop',
    'urbano latino',
    'dembow',
    'banda',
    'norteño',
    'mariachi',
    'regional mexican',
    'corridos',
  ],
  punk: [
    'punk',
    'punk rock',
    'pop punk',
    'hardcore punk',
    'post-hardcore',
    'emo',
    'screamo',
    'skate punk',
    'street punk',
    'anarcho-punk',
    'crust punk',
    'folk punk',
  ],
  reggae: [
    'reggae',
    'dancehall',
    'dub',
    'roots reggae',
    'lovers rock',
    'ska',
    'rocksteady',
    'ragga',
  ],
  funk: [
    'funk',
    'p-funk',
    'go-go',
    'boogie',
    'electro funk',
    'funk rock',
    'disco',
    'nu-disco',
    'funk metal',
  ],
  blues: [
    'blues',
    'electric blues',
    'delta blues',
    'chicago blues',
    'blues rock',
    'soul blues',
    'contemporary blues',
    'texas blues',
  ],
  world: [
    'world',
    'afrobeat',
    'afropop',
    'world fusion',
    'african',
    'celtic',
    'indian',
    'middle eastern',
    'brazilian',
    'bossa nova',
    'samba',
    'fado',
    'flamenco',
    'balkan',
    'klezmer',
  ],
};

// Reverse lookup: genre -> parent
const GENRE_TO_PARENT: { [genre: string]: string } = {};
Object.entries(GENRE_PARENT_MAP).forEach(([parent, children]) => {
  children.forEach((child) => {
    GENRE_TO_PARENT[child.toLowerCase()] = parent;
  });
});

@Injectable({
  providedIn: 'root',
})
export class GenresService {
  private topGenresShortTerm: GenreItem[] = [];
  private topGenresMedTerm: GenreItem[] = [];
  private topGenresLongTerm: GenreItem[] = [];

  private groupedGenresShortTerm: GenreGroup[] = [];
  private groupedGenresMedTerm: GenreGroup[] = [];
  private groupedGenresLongTerm: GenreGroup[] = [];

  constructor() {}

  /**
   * Extract and weight genres from a list of artists.
   * Artists are assumed to be sorted by rank (most listened first).
   *
   * @param artists - Array of Spotify artist objects
   * @param term - Time range term for caching
   * @returns Array of GenreItem sorted by weighted score
   */
  getTopGenres(artists: any[], term: string): GenreItem[] {
    const genreMap = new Map<
      string,
      { score: number; count: number; artists: Set<string> }
    >();
    const totalArtists = artists.length;

    artists.forEach((artist, index) => {
      // Weight by rank: #1 artist gets full weight, last artist gets minimal weight
      // Using inverse rank with a floor to avoid zero weights
      const weight = Math.max(totalArtists - index, 1);

      const artistGenres = artist.genres || [];
      const artistName = artist.name;

      artistGenres.forEach((genre: string) => {
        const normalizedGenre = genre.toLowerCase().trim();

        if (!genreMap.has(normalizedGenre)) {
          genreMap.set(normalizedGenre, {
            score: 0,
            count: 0,
            artists: new Set(),
          });
        }

        const data = genreMap.get(normalizedGenre)!;
        data.score += weight;
        data.count += 1;
        data.artists.add(artistName);
      });
    });

    // Convert to array and sort by score
    const sorted = Array.from(genreMap.entries())
      .map(([name, data]) => ({
        name,
        count: data.count,
        score: data.score,
        artists: Array.from(data.artists),
      }))
      .sort((a, b) => b.score - a.score);

    // Calculate percentages based on max score
    const maxScore = sorted.length > 0 ? sorted[0].score : 1;
    const genres: GenreItem[] = sorted.map((item) => ({
      ...item,
      percentage: Math.round((item.score / maxScore) * 100),
    }));

    // Cache by term
    this.cacheGenres(genres, term);

    return genres;
  }

  /**
   * Group genres into parent categories for a cleaner view.
   *
   * @param genres - Array of GenreItem (from getTopGenres)
   * @param term - Time range term for caching
   * @returns Array of GenreGroup sorted by total score
   */
  getGroupedGenres(genres: GenreItem[], term: string): GenreGroup[] {
    const groupMap = new Map<
      string,
      {
        score: number;
        genres: Set<string>;
        artists: Set<string>;
      }
    >();

    genres.forEach((genre) => {
      // Find parent category or use 'other'
      const parent = this.findParentGenre(genre.name);

      if (!groupMap.has(parent)) {
        groupMap.set(parent, {
          score: 0,
          genres: new Set(),
          artists: new Set(),
        });
      }

      const data = groupMap.get(parent)!;
      data.score += genre.score;
      data.genres.add(genre.name);
      genre.artists.forEach((a) => data.artists.add(a));
    });

    // Convert to array and sort
    const sorted = Array.from(groupMap.entries())
      .map(([name, data]) => ({
        name,
        score: data.score,
        genres: Array.from(data.genres),
        artists: Array.from(data.artists),
      }))
      .sort((a, b) => b.score - a.score);

    // Calculate percentages
    const maxScore = sorted.length > 0 ? sorted[0].score : 1;
    const groups: GenreGroup[] = sorted.map((item) => ({
      ...item,
      percentage: Math.round((item.score / maxScore) * 100),
    }));

    // Cache
    this.cacheGroupedGenres(groups, term);

    return groups;
  }

  /**
   * Find the parent genre category for a specific genre.
   */
  private findParentGenre(genre: string): string {
    const normalized = genre.toLowerCase().trim();

    // Direct lookup
    if (GENRE_TO_PARENT[normalized]) {
      return GENRE_TO_PARENT[normalized];
    }

    // Partial match - check if genre contains any parent keywords
    for (const [parent, children] of Object.entries(GENRE_PARENT_MAP)) {
      // Check if the genre contains the parent name
      if (normalized.includes(parent)) {
        return parent;
      }
      // Check if any child pattern matches
      for (const child of children) {
        if (normalized.includes(child) || child.includes(normalized)) {
          return parent;
        }
      }
    }

    return 'other';
  }

  private cacheGenres(genres: GenreItem[], term: string): void {
    switch (term) {
      case 'short_term':
        this.topGenresShortTerm = genres;
        break;
      case 'medium_term':
        this.topGenresMedTerm = genres;
        break;
      case 'long_term':
        this.topGenresLongTerm = genres;
        break;
    }
  }

  private cacheGroupedGenres(groups: GenreGroup[], term: string): void {
    switch (term) {
      case 'short_term':
        this.groupedGenresShortTerm = groups;
        break;
      case 'medium_term':
        this.groupedGenresMedTerm = groups;
        break;
      case 'long_term':
        this.groupedGenresLongTerm = groups;
        break;
    }
  }

  // Getters for cached data
  getShortTermTopGenres(): GenreItem[] {
    return this.topGenresShortTerm;
  }

  getMedTermTopGenres(): GenreItem[] {
    return this.topGenresMedTerm;
  }

  getLongTermTopGenres(): GenreItem[] {
    return this.topGenresLongTerm;
  }

  getShortTermGroupedGenres(): GenreGroup[] {
    return this.groupedGenresShortTerm;
  }

  getMedTermGroupedGenres(): GenreGroup[] {
    return this.groupedGenresMedTerm;
  }

  getLongTermGroupedGenres(): GenreGroup[] {
    return this.groupedGenresLongTerm;
  }

  getAllTermsTopGenres(): {
    short_term: GenreItem[];
    medium_term: GenreItem[];
    long_term: GenreItem[];
  } {
    return {
      short_term: this.topGenresShortTerm,
      medium_term: this.topGenresMedTerm,
      long_term: this.topGenresLongTerm,
    };
  }
}
