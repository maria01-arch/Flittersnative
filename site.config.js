// wrote reference in my notes
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
