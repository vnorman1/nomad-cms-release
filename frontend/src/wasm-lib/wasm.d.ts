// Type declarations for WASM modules
// This file tells TypeScript where to find types for .js imports from wasm-lib

declare module '@/wasm-lib/nomad-versioning/nomad_versioning.js' {
    export * from './nomad_versioning';
    export { default } from './nomad_versioning';
}

declare module '@/wasm-lib/nomad-entropy/nomad_entropy.js' {
    export * from './nomad_entropy';
    export { default } from './nomad_entropy';
}

declare module '@/wasm-lib/nomad-forge/nomad_forge.js' {
    export * from './nomad_forge';
    export { default } from './nomad_forge';
}

declare module '@/wasm-lib/backup-viewer/backup_viewer.js' {
    export * from './backup_viewer';
    export { default } from './backup_viewer';
}
