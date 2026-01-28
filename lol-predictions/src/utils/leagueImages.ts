// Fallback league images using LoL Esports CDN
// These are more reliable than the API-provided URLs

const LEAGUE_IMAGE_BASE = 'https://am-a.akamaihd.net/image?resize=120:&f=http%3A%2F%2Fstatic.lolesports.com%2Fleagues%2F';

// Known working image paths for major leagues
const LEAGUE_IMAGES: Record<string, string> = {
  lck: `${LEAGUE_IMAGE_BASE}lck-color-on-black.png`,
  lpl: `${LEAGUE_IMAGE_BASE}lpl-color-on-black.png`,
  lec: `${LEAGUE_IMAGE_BASE}1592516115322_LEC-01-FullonDark.png`,
  lcs: `${LEAGUE_IMAGE_BASE}LCS_2024_Logo_light.png`,
  worlds: `${LEAGUE_IMAGE_BASE}1592594634663_WorldsDarkBG.png`,
  msi: `${LEAGUE_IMAGE_BASE}1592594737478_MSIDarkBG.png`,
  lta_n: `${LEAGUE_IMAGE_BASE}lta-north-dark.png`,
  lta_s: `${LEAGUE_IMAGE_BASE}lta-south-dark.png`,
  cblol: `${LEAGUE_IMAGE_BASE}cblol-logo-dark.png`,
  ljl: `${LEAGUE_IMAGE_BASE}ljl-japan-logo-dark.png`,
  pcs: `${LEAGUE_IMAGE_BASE}pcs-color-darkbg.png`,
  vcs: `${LEAGUE_IMAGE_BASE}1705943530092_VCS-01.png`,
  lco: `${LEAGUE_IMAGE_BASE}lco-color-on-black.png`,
};

export function getLeagueImage(slug: string, apiImage?: string): string {
  // Check if we have a known working image for this league
  const fallback = LEAGUE_IMAGES[slug.toLowerCase()];
  if (fallback) {
    return fallback;
  }
  // Otherwise use the API-provided image
  return apiImage || '';
}
