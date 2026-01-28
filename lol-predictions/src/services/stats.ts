// Leaguepedia Cargo API integration for player stats

export interface PlayerStats {
  name: string;
  team: string;
  role: string;
  kills: number;
  deaths: number;
  assists: number;
  kda: number;
  gamesPlayed: number;
}

interface CargoQueryResult {
  cargoquery?: Array<{
    title: {
      Name: string;
      Team: string;
      Role: string;
      Kills: string;
      Deaths: string;
      Assists: string;
    };
  }>;
  error?: {
    code?: string;
    info: string;
  };
}

const LEAGUEPEDIA_API = 'https://lol.fandom.com/api.php';

// Cache for player stats (team code -> player stats map)
const statsCache: Map<string, Map<string, PlayerStats>> = new Map();
const statsCacheTime: Map<string, number> = new Map();
const CACHE_TTL = 60 * 60 * 1000; // 1 hour cache to avoid rate limits

// Track if we're rate limited to avoid repeated failed requests
let isRateLimited = false;
let rateLimitResetTime = 0;

// Request queue to prevent rate limiting
let lastRequestTime = 0;
const MIN_REQUEST_INTERVAL = 2000; // 2 seconds between requests to be safe

async function throttledFetch(url: string): Promise<Response> {
  const now = Date.now();
  const timeSinceLastRequest = now - lastRequestTime;

  if (timeSinceLastRequest < MIN_REQUEST_INTERVAL) {
    await new Promise(resolve => setTimeout(resolve, MIN_REQUEST_INTERVAL - timeSinceLastRequest));
  }

  lastRequestTime = Date.now();
  return fetch(url);
}

async function fetchLeaguepediaStats(teamName: string): Promise<PlayerStats[]> {
  // Check if we're currently rate limited
  if (isRateLimited && Date.now() < rateLimitResetTime) {
    console.log(`Skipping API call for ${teamName} - rate limited until ${new Date(rateLimitResetTime).toLocaleTimeString()}`);
    return [];
  }

  // Build URL manually to ensure proper encoding
  // Use recent date filter to get current season stats
  const whereClause = `Team="${teamName}" AND DateTime_UTC>"2025-06-01"`;
  const url = `${LEAGUEPEDIA_API}?action=cargoquery&tables=ScoreboardPlayers&fields=Name,Team,Role,Kills,Deaths,Assists&where=${encodeURIComponent(whereClause)}&order_by=DateTime_UTC%20DESC&limit=100&format=json&origin=*`;

  try {
    const response = await throttledFetch(url);
    if (!response.ok) {
      console.error(`Leaguepedia API error: ${response.status}`);
      return [];
    }

    const data: CargoQueryResult = await response.json();

    if (data.error) {
      // If rate limited, set flag and wait
      if (data.error.code === 'ratelimited') {
        isRateLimited = true;
        rateLimitResetTime = Date.now() + 5 * 60 * 1000; // Wait 5 minutes
        console.warn(`Rate limited for ${teamName}, will retry after ${new Date(rateLimitResetTime).toLocaleTimeString()}`);
        return [];
      }
      console.error(`Leaguepedia query error for ${teamName}:`, data.error.info);
      return [];
    }

    // Clear rate limit flag on successful response
    isRateLimited = false;

    if (!data.cargoquery || data.cargoquery.length === 0) {
      console.log(`No stats found for team: ${teamName}`);
      return [];
    }

    console.log(`Found ${data.cargoquery.length} stat entries for ${teamName}`);

    // Aggregate stats by player
    const playerAggregates: Map<string, {
      name: string;
      team: string;
      role: string;
      totalKills: number;
      totalDeaths: number;
      totalAssists: number;
      games: number;
    }> = new Map();

    for (const entry of data.cargoquery) {
      const { Name, Team, Role, Kills, Deaths, Assists } = entry.title;
      const key = Name.toLowerCase();

      if (!playerAggregates.has(key)) {
        playerAggregates.set(key, {
          name: Name,
          team: Team,
          role: Role,
          totalKills: 0,
          totalDeaths: 0,
          totalAssists: 0,
          games: 0,
        });
      }

      const agg = playerAggregates.get(key)!;
      agg.totalKills += parseInt(Kills) || 0;
      agg.totalDeaths += parseInt(Deaths) || 0;
      agg.totalAssists += parseInt(Assists) || 0;
      agg.games += 1;
    }

    // Calculate averages and KDA
    const stats: PlayerStats[] = [];
    for (const agg of playerAggregates.values()) {
      const avgKills = agg.games > 0 ? agg.totalKills / agg.games : 0;
      const avgDeaths = agg.games > 0 ? agg.totalDeaths / agg.games : 0;
      const avgAssists = agg.games > 0 ? agg.totalAssists / agg.games : 0;

      // KDA formula: (K + A) / D, if D is 0, use 1
      const kda = avgDeaths > 0 ? (avgKills + avgAssists) / avgDeaths : avgKills + avgAssists;

      stats.push({
        name: agg.name,
        team: agg.team,
        role: agg.role,
        kills: Math.round(avgKills * 10) / 10,
        deaths: Math.round(avgDeaths * 10) / 10,
        assists: Math.round(avgAssists * 10) / 10,
        kda: Math.round(kda * 100) / 100,
        gamesPlayed: agg.games,
      });
    }

    return stats;
  } catch (error) {
    console.error(`Failed to fetch stats for ${teamName}:`, error);
    return [];
  }
}

// Common team name mappings (LoL Esports API name -> Leaguepedia name)
const TEAM_NAME_MAP: Record<string, string> = {
  // LCK
  't1': 'T1',
  'gen.g': 'Gen.G',
  'geng': 'Gen.G',
  'hanwha life esports': 'Hanwha Life Esports',
  'hle': 'Hanwha Life Esports',
  'kt rolster': 'KT Rolster',
  'kt': 'KT Rolster',
  'dplus kia': 'Dplus KIA',
  'dk': 'Dplus KIA',
  'drx': 'DRX',
  'kwangdong freecs': 'Kwangdong Freecs',
  'kdf': 'Kwangdong Freecs',
  'ok brion': 'OKSavingsBank BRION',
  'brion': 'OKSavingsBank BRION',
  'fearx': 'FearX',
  'ns': 'Nongshim RedForce',

  // LPL
  'jdg intel esports club': 'JD Gaming',
  'jdg': 'JD Gaming',
  'bilibili gaming': 'Bilibili Gaming',
  'blg': 'Bilibili Gaming',
  'top esports': 'Top Esports',
  'tes': 'Top Esports',
  'weibo gaming': 'Weibo Gaming',
  'wbg': 'Weibo Gaming',
  'lng esports': 'LNG Esports',
  'lng': 'LNG Esports',
  'edward gaming': 'EDward Gaming',
  'edg': 'EDward Gaming',
  'royal never give up': 'Royal Never Give Up',
  'rng': 'Royal Never Give Up',
  'oh my god': 'Oh My God',
  'omg': 'Oh My God',
  'funplus phoenix': 'FunPlus Phoenix',
  'fpx': 'FunPlus Phoenix',
  'ninjas in pyjamas': 'Ninjas in Pyjamas',
  'nip': 'Ninjas in Pyjamas',
  'anyone\'s legend': 'Anyone\'s Legend',
  'al': 'Anyone\'s Legend',
  'rare atom': 'Rare Atom',
  'ra': 'Rare Atom',
  'invictus gaming': 'Invictus Gaming',
  'ig': 'Invictus Gaming',
  'team we': 'Team WE',
  'we': 'Team WE',
  'ultra prime': 'Ultra Prime',
  'up': 'Ultra Prime',
  'thundertalk gaming': 'ThunderTalk Gaming',
  'tt': 'ThunderTalk Gaming',
  'lgd gaming': 'LGD Gaming',
  'lgd': 'LGD Gaming',

  // LEC
  'g2 esports': 'G2 Esports',
  'g2': 'G2 Esports',
  'fnatic': 'Fnatic',
  'fnc': 'Fnatic',
  'mad lions': 'MAD Lions',
  'mad': 'MAD Lions',
  'team vitality': 'Team Vitality',
  'vit': 'Team Vitality',
  'rogue': 'Rogue',
  'rge': 'Rogue',
  'team bds': 'Team BDS',
  'bds': 'Team BDS',
  'excel esports': 'Excel Esports',
  'xl': 'Excel Esports',
  'sk gaming': 'SK Gaming',
  'sk': 'SK Gaming',
  'astralis': 'Astralis',
  'ast': 'Astralis',
  'team heretics': 'Team Heretics',
  'th': 'Team Heretics',
  'karmine corp': 'Karmine Corp',
  'kc': 'Karmine Corp',

  // LCS
  'cloud9': 'Cloud9',
  'c9': 'Cloud9',
  'team liquid': 'Team Liquid',
  'tl': 'Team Liquid',
  '100 thieves': '100 Thieves',
  '100': '100 Thieves',
  'flyquest': 'FlyQuest',
  'fly': 'FlyQuest',
  'evil geniuses': 'Evil Geniuses',
  'eg': 'Evil Geniuses',
  'dignitas': 'Dignitas',
  'dig': 'Dignitas',
  'nrg': 'NRG',
  'golden guardians': 'Golden Guardians',
  'gg': 'Golden Guardians',
  'immortals': 'Immortals',
  'imt': 'Immortals',
  'shopify rebellion': 'Shopify Rebellion',
  'sr': 'Shopify Rebellion',
};

function getLeaguepediaTeamName(code: string, name: string): string[] {
  const lowerCode = code.toLowerCase();
  const lowerName = name.toLowerCase();

  const names: string[] = [];

  // Try mapped names first
  if (TEAM_NAME_MAP[lowerCode]) {
    names.push(TEAM_NAME_MAP[lowerCode]);
  }
  if (TEAM_NAME_MAP[lowerName]) {
    names.push(TEAM_NAME_MAP[lowerName]);
  }

  // Then try original names
  names.push(name);
  names.push(code);

  // Remove duplicates
  return [...new Set(names)];
}

// Try different team name variations
async function fetchTeamStats(teamCode: string, teamName: string): Promise<Map<string, PlayerStats>> {
  const cacheKey = teamCode.toLowerCase();
  const cachedTime = statsCacheTime.get(cacheKey);

  // Return cached data if still valid
  if (cachedTime && Date.now() - cachedTime < CACHE_TTL) {
    const cached = statsCache.get(cacheKey);
    if (cached && cached.size > 0) return cached;
  }

  // Try different name variations
  const namesToTry = getLeaguepediaTeamName(teamCode, teamName);

  let stats: PlayerStats[] = [];

  for (const name of namesToTry) {
    stats = await fetchLeaguepediaStats(name);
    if (stats.length > 0) {
      break;
    }
  }

  // Create a map by player name (lowercase)
  const statsMap = new Map<string, PlayerStats>();
  for (const player of stats) {
    statsMap.set(player.name.toLowerCase(), player);
  }

  // Cache the result
  statsCache.set(cacheKey, statsMap);
  statsCacheTime.set(cacheKey, Date.now());

  return statsMap;
}

export async function getPlayerStats(
  playerName: string,
  teamCode: string,
  teamName: string
): Promise<PlayerStats | null> {
  const teamStats = await fetchTeamStats(teamCode, teamName);
  return teamStats.get(playerName.toLowerCase()) || null;
}

export async function getTeamPlayerStats(
  teamCode: string,
  teamName: string
): Promise<Map<string, PlayerStats>> {
  return fetchTeamStats(teamCode, teamName);
}
