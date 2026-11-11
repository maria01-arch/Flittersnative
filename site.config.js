// ONE place for the app's website domain.
// To move to a new domain (say flitters.com): change SITE_HOST below, add the
// old host to OLD_HOSTS so old shared links still open in the app, then make
// a new EAS build (the Android link settings are baked in at build time).
const SITE_HOST = 'xchord.space';
const MEDIA_HOST = 'media.' + SITE_HOST; // R2 custom domain for images/videos
const OLD_HOSTS = []; // e.g. ['xchord.space'] after you switch
const SUPPORT_EMAIL = 'support@' + SITE_HOST;

module.exports = {
  SITE_HOST,
  SITE_URL: 'https://' + SITE_HOST,
  MEDIA_HOST,
  MEDIA_URL: 'https://' + MEDIA_HOST,
  OLD_HOSTS,
  ALL_HOSTS: [SITE_HOST].concat(OLD_HOSTS),
  SUPPORT_EMAIL,
};
