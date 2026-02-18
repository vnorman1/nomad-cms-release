export const printNomadAscii = () => {
    const styles = [
        'font-family: monospace',
        'font-weight: bold',
        'background: #000000',
        'color: #ffffff',
        'padding: 10px',
        'line-height: 1.1',
        'display: inline-block',             // Helping it sit in a block
        'border: 1px solid #333'
    ].join(';');

    // Pad lines to ensure the background forms a solid rectangle
    const art = `NOMAD CMS v1.0.0
(c) 2026 Vajda Norman
All Systems Operational.        `;

    console.log(`%c${art}`, styles);
};
