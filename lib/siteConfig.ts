// Reads the one domain file at the project root (site.config.js).
// eslint-disable-next-line @typescript-eslint/no-require-imports
const cfg = require('../site.config.js') as {
  SITE_HOST: string;
  SITE_URL: string;
  MEDIA_HOST: string;
  MEDIA_URL: string;
  OLD_HOSTS: string[];
  ALL_HOSTS: string[];
  SUPPORT_EMAIL: string;
};

export const SITE_HOST = cfg.SITE_HOST;
export const SITE_URL = cfg.SITE_URL;
export const MEDIA_URL = cfg.MEDIA_URL;
export const SUPPORT_EMAIL = cfg.SUPPORT_EMAIL;
export const ALL_HOSTS = cfg.ALL_HOSTS;

const esc = (h: string) => h.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
// Matches https://(www.)<any of our hosts> — used when deciding "is this link ours".
export const HOSTS_PATTERN = '(?:' + ALL_HOSTS.map(esc).join('|') + ')';
