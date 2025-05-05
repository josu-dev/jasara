export const SITE_NAME = "JASARA";

export const DEFAULT_METADATA = {
    icon: '/favicon.svg',
    manifest: '/manifest.json',
    site_name: SITE_NAME,
    // same as background_color for mobile top bar otherwise change to '#f0b100'
    theme_color: '#0a0a0a',
    background_color: '#0a0a0a',
    title_default: SITE_NAME,
    title_template: '%s - ' + SITE_NAME,
    image: {
        url: "/images/banner_og.webp",
        alt: "JASARA Banner",
        width: "1200",
        height: "630",
    },
    language_tag: 'en'
} as const;

export const DEFAULT_ROOM_ID = "some-id";

export const DEFAULT_SYSTEM_MESSAGE = "Welcome to JASARA 🐇\n\nReady to transfer things?";

export const ROOM_ID_MIN_LENGTH = 1;

export const ROOM_ID_MAX_LENGTH = 32;
