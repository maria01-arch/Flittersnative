// Content for About > Terms of Service / Privacy Policy / Child's Policy.
// Privacy Policy and Child Safety Standards are ported verbatim (section
// by section) from the live pages at xchord.space/privacy and
// xchord.space/child-safety — same company details, same section numbers
// — so the in-app copy and the web copy never drift apart. Terms of
// Service didn't exist anywhere yet (web or native), so it's drafted here
// fresh, matching the same tone, company details (Flitters Labs Corp /
// Xchordlabs), and section-numbering style as the other two.

export type ListItem = { bold?: string; text: string };
export type Block =
  | { type: 'p'; text: string }
  | { type: 'ul'; items: (string | ListItem)[] }
  | { type: 'h2'; text: string }
  | { type: 'highlight'; text: string; tone?: 'purple' | 'red' };

export type LegalDoc = {
  title: string;
  updated: string;
  blocks: Block[];
};

const CONTACT_FOOTER = (label: string): Block[] => [
  { type: 'p', text: `${label}\nFlitters Labs Corp\nEmail: support@xchord.space\nWebsite: xchord.space` },
];

export const PRIVACY_POLICY: LegalDoc = {
  title: 'Privacy Policy',
  updated: 'Last updated: July 1, 2025',
  blocks: [
    {
      type: 'p',
      text: 'Welcome to Flitters (formerly known as Sphere) ("we", "our", or "us"). This Privacy Policy explains how we collect, use, and protect your information when you use the Flitters social media platform.',
    },
    { type: 'h2', text: '1. Information We Collect' },
    { type: 'p', text: 'We collect the following types of information:' },
    {
      type: 'ul',
      items: [
        { bold: 'Account information', text: '— display name, username, email address, password (hashed), bio, location, and profile photo.' },
        { bold: 'Content you create', text: '— posts, comments, reposts, reels (videos), group messages, and direct messages.' },
        { bold: 'Usage data', text: '— pages viewed, features used, interactions (likes, follows, reactions), and timestamps.' },
        { bold: 'Device information', text: '— device type, operating system, IP address, and push notification tokens.' },
        { bold: 'Cookies and local storage', text: '— used for authentication and preference storage.' },
      ],
    },
    { type: 'h2', text: '2. How We Use Your Information' },
    {
      type: 'ul',
      items: [
        'To operate and improve the Flitters platform',
        'To personalize your feed using our recommendation algorithm',
        'To send you notifications about activity on your account',
        'To show you relevant advertisements (including via Google AdSense, on the web platform)',
        'To enforce our community guidelines and terms of service',
        'To communicate with you about your account',
      ],
    },
    { type: 'h2', text: '3. Advertising' },
    {
      type: 'p',
      text: "The Flitters web platform uses Google AdSense to display advertisements. Google may use cookies and device identifiers to show personalized ads based on browsing activity across websites. You can opt out of personalized advertising through Google's Ad Settings. We also display direct sponsored content from advertisers, clearly marked as \"Sponsored\".",
    },
    { type: 'h2', text: '4. Data Sharing' },
    { type: 'p', text: 'We do not sell your personal information. We may share data with:' },
    {
      type: 'ul',
      items: [
        { bold: 'Supabase', text: '— our database and authentication provider' },
        { bold: 'Google', text: '— for advertising (AdSense) and analytics' },
        { bold: 'Vercel', text: '— our web hosting provider' },
        { text: 'Law enforcement, when required by law' },
      ],
    },
    { type: 'h2', text: '5. Data Storage & Security' },
    {
      type: 'p',
      text: 'Your data is stored securely on Supabase infrastructure with row-level security policies. Passwords are hashed and never stored in plain text. We use HTTPS/TLS for all data transmission.',
    },
    { type: 'h2', text: '6. Your Rights' },
    {
      type: 'ul',
      items: [
        'You can edit or delete your profile at any time from Settings',
        'You can delete your posts and reels at any time',
        'You can request full account deletion by contacting us',
        'You can opt out of push notifications from Settings, or from your device settings',
      ],
    },
    { type: 'h2', text: "7. Children's Privacy" },
    {
      type: 'p',
      text: 'Flitters is not intended for users under 13 years of age. We do not knowingly collect personal information from children under 13. See our Child Safety Standards for more detail. If you believe a child has provided us with personal information, please contact us immediately.',
    },
    { type: 'h2', text: '8. Cookies & Local Storage' },
    {
      type: 'p',
      text: "We use essential cookies/local storage for authentication and session management. Third-party advertising cookies may be set by Google AdSense on the web platform. You can control cookies through your browser settings, where applicable.",
    },
    { type: 'h2', text: '9. Changes to This Policy' },
    {
      type: 'p',
      text: 'We may update this Privacy Policy from time to time. We will notify users of significant changes by posting a notice on the platform. Continued use of Flitters after changes constitutes acceptance of the updated policy.',
    },
    { type: 'h2', text: '10. Contact Us' },
    ...CONTACT_FOOTER('If you have questions about this Privacy Policy, please contact us at:'),
    { type: 'highlight', text: 'By using Flitters, you agree to this Privacy Policy. This policy complies with GDPR, CCPA, and Google AdSense program requirements.', tone: 'purple' },
  ],
};

export const CHILD_SAFETY: LegalDoc = {
  title: "Child Safety Standards",
  updated: 'Last updated: September 15, 2026',
  blocks: [
    {
      type: 'highlight',
      tone: 'red',
      text: 'Flitters has zero tolerance for child sexual abuse and exploitation (CSAE). This applies to every part of the app — posts, comments, reels, direct messages, group chats, profiles, and the Store — with no exceptions.',
    },
    { type: 'h2', text: '1. Who This Applies To' },
    {
      type: 'p',
      text: 'This policy governs Flitters (package name com.flitters.apps), developed and operated by Xchordlabs (Flitters Labs Corp). It applies to every account, every piece of content, and every feature on the platform, for every user regardless of location.',
    },
    { type: 'h2', text: '2. Prohibited Conduct' },
    {
      type: 'p',
      text: 'The following are strictly prohibited on Flitters, and will result in immediate content removal, account termination, and referral to law enforcement where required by law:',
    },
    {
      type: 'ul',
      items: [
        'Uploading, sharing, or linking to child sexual abuse material (CSAM) in any form, including AI-generated or altered imagery depicting a minor sexually',
        'Sexualizing, sexually objectifying, or soliciting sexual content involving a minor',
        'Grooming behavior — including attempts to build trust with a minor for the purpose of sexual exploitation, isolating a minor from trusted adults, or soliciting personal information or images from a minor',
        'Sextortion or coercion of a minor',
        'Facilitating, promoting, or providing instructions for any of the above, including sharing links or contact information for this purpose',
        "Using the app's messaging or group features to contact minors for exploitative purposes",
      ],
    },
    { type: 'h2', text: '3. Minimum Age & Enforcement' },
    {
      type: 'p',
      text: 'Flitters requires all users to be at least 13 years old. Date of birth is collected and checked at sign-up, and accounts that fail this check are not permitted to register. We do not knowingly permit anyone under 13 to hold an account.',
    },
    { type: 'h2', text: '4. How to Report — Our In-App Mechanism' },
    {
      type: 'p',
      text: 'Every post, user profile, direct message, group message, and reel in Flitters has a built-in Report option, reachable directly from that content (via the "···" menu on posts and profiles, or by pressing and holding a message or reel). "Child sexual abuse or exploitation" is listed first among the report reasons, ahead of every other category, so it\'s never buried.',
    },
    {
      type: 'p',
      text: 'Reports are not public and are not visible to the person or content being reported. They go directly to a moderation queue reviewed by our Child Safety Team, where child-safety reports are automatically prioritized above all other report types.',
    },
    {
      type: 'p',
      text: 'If you don\'t have access to the app, or need to reach us directly, email support@xchord.space with the subject line "Child Safety Report" and as much detail as you can safely provide (username, link, or screenshot).',
    },
    { type: 'h2', text: '5. What Happens After a Report' },
    {
      type: 'ul',
      items: [
        'Child-safety reports are reviewed as a priority, ahead of other report categories',
        'Confirmed violations result in immediate content removal and account termination',
        'We preserve relevant evidence as required for legal reporting obligations',
        'Where legally required, confirmed CSAM is reported to the National Center for Missing & Exploited Children (NCMEC) via its CyberTipline, consistent with our obligations under 18 U.S.C. § 2258A, and to law enforcement where appropriate',
      ],
    },
    { type: 'h2', text: '6. Legal Compliance' },
    {
      type: 'p',
      text: 'Flitters complies with applicable child safety laws, including U.S. federal law governing the reporting of child sexual abuse material by online service providers. We cooperate with law enforcement and child safety organizations investigating CSAE, and will preserve and disclose information as legally required or compelled by valid legal process.',
    },
    { type: 'h2', text: '7. Contact — Child Safety Team' },
    {
      type: 'p',
      text: 'For anything related to child safety on Flitters — reporting a concern, asking about this policy, or following up on a report — contact:\nFlitters Child Safety Team\nEmail: support@xchord.space\nOperated by: Flitters Labs Corp (Xchordlabs)\nWebsite: xchord.space',
    },
    { type: 'h2', text: '8. Related Policies' },
    { type: 'p', text: 'This Child Safety Standards page works alongside our Privacy Policy, which covers how we handle personal data more broadly.' },
    {
      type: 'highlight',
      tone: 'purple',
      text: 'This page is publicly accessible at xchord.space/child-safety and is provided in compliance with Google Play\'s Child Safety Standards policy.',
    },
  ],
};

export const TERMS_OF_SERVICE: LegalDoc = {
  title: 'Terms of Service',
  updated: 'Last updated: September 25, 2026',
  blocks: [
    {
      type: 'p',
      text: 'These Terms of Service ("Terms") govern your access to and use of Flitters (the "app", "platform", "we", "our", or "us"), operated by Flitters Labs Corp (Xchordlabs). By creating an account or using Flitters, you agree to these Terms. If you do not agree, do not use Flitters.',
    },
    { type: 'h2', text: '1. Eligibility' },
    {
      type: 'p',
      text: 'You must be at least 13 years old to use Flitters. By creating an account, you confirm that the age you provide is accurate. See our Child Safety Standards for how we enforce this.',
    },
    { type: 'h2', text: '2. Your Account' },
    {
      type: 'ul',
      items: [
        "You're responsible for the security of your account and for all activity that happens under it.",
        'You must provide accurate information and keep it up to date.',
        "One account per person, unless a feature explicitly allows more (such as switching between multiple accounts you own).",
        'Notify us immediately at support@xchord.space if you believe your account has been compromised.',
      ],
    },
    { type: 'h2', text: '3. Your Content' },
    {
      type: 'p',
      text: 'You keep ownership of everything you post — text, images, videos, reels, voice notes, and messages ("your content"). By posting it on Flitters, you grant us a non-exclusive, worldwide, royalty-free license to host, store, display, reproduce, and distribute your content solely for the purpose of operating and improving the platform (for example, showing your post in feeds, notifications, and search). This license ends when you delete the content or your account, except where a copy is legally required to be retained.',
    },
    {
      type: 'p',
      text: "You're responsible for what you post. Don't post anything you don't have the rights to, and don't post anything that violates these Terms, our Child Safety Standards, or applicable law.",
    },
    { type: 'h2', text: '4. Acceptable Use' },
    { type: 'p', text: 'You agree not to use Flitters to:' },
    {
      type: 'ul',
      items: [
        'Post or share child sexual abuse material (CSAM), or engage in any conduct prohibited by our Child Safety Standards — this is a zero-tolerance policy with no exceptions',
        'Harass, bully, threaten, or incite violence against any person or group',
        'Impersonate another person or entity in a misleading way',
        'Post spam, scams, or malicious links',
        'Upload malware or attempt to interfere with, disrupt, or gain unauthorized access to the platform or other accounts',
        'Scrape, crawl, or harvest data from Flitters without our written permission',
        'Violate any applicable law, including intellectual property, privacy, or export laws',
      ],
    },
    { type: 'h2', text: '5. The Store' },
    {
      type: 'p',
      text: "Flitters includes a Store feature where users can list items. Flitters is not a party to any transaction between a buyer and seller — we don't process payments, guarantee listings, or take responsibility for the condition, legality, or delivery of any item. Buy and sell at your own risk, and report suspicious listings.",
    },
    { type: 'h2', text: '6. Content Moderation & Enforcement' },
    {
      type: 'p',
      text: 'We may review, remove, or restrict access to content that violates these Terms, and may suspend or terminate accounts that violate these Terms, at our discretion. Reports submitted through the in-app Report feature are reviewed by our moderation team, with child-safety reports prioritized above all others.',
    },
    { type: 'h2', text: '7. Termination' },
    {
      type: 'p',
      text: 'You may stop using Flitters and delete your account at any time from Settings, or by contacting us. We may suspend or terminate your access to Flitters at any time, with or without notice, for conduct that violates these Terms or that we believe is harmful to other users, us, or third parties.',
    },
    { type: 'h2', text: '8. Intellectual Property' },
    {
      type: 'p',
      text: 'The Flitters name, logo, and platform (excluding user content) are the property of Flitters Labs Corp. You may not use our branding without permission.',
    },
    { type: 'h2', text: '9. Disclaimers' },
    {
      type: 'p',
      text: 'Flitters is provided "as is" and "as available", without warranties of any kind, express or implied. We do not guarantee the platform will be uninterrupted, secure, or error-free, or that content posted by other users is accurate, safe, or lawful.',
    },
    { type: 'h2', text: '10. Limitation of Liability' },
    {
      type: 'p',
      text: 'To the maximum extent permitted by law, Flitters Labs Corp will not be liable for any indirect, incidental, special, consequential, or punitive damages arising from your use of the platform, or from content posted by other users.',
    },
    { type: 'h2', text: '11. Changes to These Terms' },
    {
      type: 'p',
      text: 'We may update these Terms from time to time. We will notify users of significant changes by posting a notice on the platform. Continued use of Flitters after changes constitutes acceptance of the updated Terms.',
    },
    { type: 'h2', text: '12. Governing Law' },
    { type: 'p', text: 'These Terms are governed by the laws applicable to Flitters Labs Corp, without regard to conflict-of-law principles.' },
    { type: 'h2', text: '13. Contact Us' },
    ...CONTACT_FOOTER('Questions about these Terms? Contact us at:'),
    { type: 'highlight', tone: 'purple', text: 'By using Flitters, you agree to these Terms of Service, our Privacy Policy, and our Child Safety Standards.' },
  ],
};

export const LEGAL_DOCS: Record<string, LegalDoc> = {
  terms: TERMS_OF_SERVICE,
  privacy: PRIVACY_POLICY,
  'child-safety': CHILD_SAFETY,
};
