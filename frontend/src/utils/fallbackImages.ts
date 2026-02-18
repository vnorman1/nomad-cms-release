/**
 * Nomad CMS - Fallback Images
 * 
 * Ultra-minimalist, AWWWARDS-style SVG fallback images.
 * Adapts to system light/dark mode via embedded CSS.
 * No external dependencies - works offline.
 */

// Base64 encoded SVG generator
const createMinimalSvg = (label: string, sublabel: string, width = 600, height = 400, isError = false): string => {
    // Colors and Styles
    // Light Mode (Default)
    // Made slightly lighter/cleaner based on feedback
    const bgLight = '#FAFAFA';
    const textLight = '#111111';
    const lineLight = '#E0E0E0';

    // Dark Mode
    const bgDark = '#111111';
    const textDark = '#FFFFFF';
    const lineDark = '#222222';

    // Accent for Error vs Neutral
    const accent = isError ? '#da4444ff' : 'currentColor';

    const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
        <style>
            :root {
                --bg: ${bgLight};
                --text: ${textLight};
                --line: ${lineLight};
                --accent: ${accent};
            }
            @media (prefers-color-scheme: dark) {
                :root {
                    --bg: ${bgDark};
                    --text: ${textDark};
                    --line: ${lineDark};
                }
            }
            .base { fill: var(--bg); transition: none; }
            .text { 
                fill: var(--text); 
                font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; 
                font-weight: 700; 
                text-transform: uppercase; 
                letter-spacing: 0.12em; 
            }
            .sub { 
                fill: var(--text); 
                opacity: 0.5; 
                font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; 
                font-weight: 500; 
                text-transform: uppercase; 
                letter-spacing: 0.08em; 
            }
            .line { stroke: var(--line); stroke-width: 1; }
            .accent { stroke: var(--accent); stroke-width: 2; }
        </style>
        
        <!-- Background -->
        <rect class="base" width="100%" height="100%"/>
        
        <!-- Technical Marks (Corners) -->
        <path class="line" d="M 24 24 L 48 24 M 24 24 L 24 48" fill="none" />
        <path class="line" d="M ${width - 24} 24 L ${width - 48} 24 M ${width - 24} 24 L ${width - 24} 48" fill="none" />
        <path class="line" d="M 24 ${height - 24} L 48 ${height - 24} M 24 ${height - 24} L 24 ${height - 48}" fill="none" />
        <path class="line" d="M ${width - 24} ${height - 24} L ${width - 48} ${height - 24} M ${width - 24} ${height - 24} L ${width - 24} ${height - 48}" fill="none" />

        <!-- Center Crosshair/Icon -->
        <g transform="translate(${width / 2}, ${height / 2})">
            ${isError
            ? `<path class="accent" d="M -10 -10 L 10 10 M 10 -10 L -10 10" opacity="0.8"/>`
            : `<circle class="line" r="3" fill="var(--text)" opacity="0.2"/>`
        }
        </g>

        <!-- Typography - Positioned closer to center, larger sizes -->
        <text class="text" x="50%" y="${height / 2 + 50}" text-anchor="middle" font-size="14">${label}</text>
        <text class="sub" x="50%" y="${height / 2 + 72}" text-anchor="middle" font-size="10">${sublabel}</text>
    </svg>
    `.trim().replace(/\n\s*/g, ' ');

    return `data:image/svg+xml,${encodeURIComponent(svg)}`;
};

// Pre-generated fallback images (Hungarian)
// ERROR STATES
export const FALLBACK_IMAGE = createMinimalSvg('HIÁNYZÓ KÉP', 'NEM TALÁLHATÓ', 600, 400, true);
export const FALLBACK_GIF = createMinimalSvg('GIF HIBA', 'NEM JÁTSZHATÓ LE', 600, 400, true);
export const FALLBACK_MEDIA = createMinimalSvg('MÉDIA HIBA', 'NEM ELÉRHETŐ', 600, 400, true);
export const FALLBACK_THUMBNAIL = createMinimalSvg('NINCS ELŐNÉZET', 'BETÖLTÉSI HIBA', 300, 200, true);

// EMPTY STATES
export const PLACEHOLDER_IMAGE = createMinimalSvg('NINCS KÉP', 'FELTÖLTÉSRE VÁR', 600, 400, false);
export const PLACEHOLDER_GIF = createMinimalSvg('NINCS GIF', 'FELTÖLTÉSRE VÁR', 600, 400, false);
export const PLACEHOLDER_THUMBNAIL = createMinimalSvg('NINCS ELŐNÉZET', 'FELDOLGOZÁS...', 300, 200, false);

// Helper function for onError handlers
export const handleImageError = (e: React.SyntheticEvent<HTMLImageElement>, fallback = FALLBACK_IMAGE) => {
    const target = e.target as HTMLImageElement;
    if (target.src !== fallback) {
        target.src = fallback;
    }
};

export const handleGifError = (e: React.SyntheticEvent<HTMLImageElement>) => {
    handleImageError(e, FALLBACK_GIF);
};
