# 🚀 NOMAD CMS

> **Next-generation headless CMS with enterprise security, WebAssembly acceleration, and intelligent content versioning**

![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?style=flat-square&logo=typescript&logoColor=white)
![React](https://img.shields.io/badge/React-20232A?style=flat-square&logo=react&logoColor=61DAFB)
![PHP 8.1+](https://img.shields.io/badge/PHP-8.1+-777BB4?style=flat-square&logo=php&logoColor=white)
![SQLite](https://img.shields.io/badge/SQLite-07405E?style=flat-square&logo=sqlite&logoColor=white)
![Rust](https://img.shields.io/badge/Rust-000000?style=flat-square&logo=rust&logoColor=white)
![WebAssembly](https://img.shields.io/badge/WebAssembly-654FF0?style=flat-square&logo=webassembly&logoColor=white)

---

## 📋 Tartalomjegyzék

- [Mi az a NOMAD CMS?](#-mi-az-a-nomad-cms)
- [Főbb Funkciók](#-főbb-funkciók)
- [Architektúra](#-architektúra)
- [Gyors Kezdés](#-gyors-kezdés)
- [Dokumentáció](#-dokumentáció)
- [Fejlesztés](#-fejlesztés)
- [Deployment](#-deployment)
- [Licenc](#-licenc)


---

## 🎯 Mi az a NOMAD CMS?

A **NOMAD CMS** egy modern, headless tartalomkezelő rendszer, amely ötvözi a hagyományos CMS-ek egyszerűségét a modern web követelményeivel. Enterprise-grade biztonsági funkciókkal, WebAssembly gyorsítással és intelligens content versionálással rendelkezik.

### ⚡ Miért válaszd a NOMAD-ot?

- **🔥 Blazing Fast**: WebAssembly modulokkal gyorsított kripto műveletek
- **🔒 Fort Knox Security**: MFA, WebAuthn, end-to-end encryption, blind indexing
- **📦 Content Versioning**: Intelligens snapshot rendszer LZ4 tömörítéssel
- **🎨 Modern Admin UI**: React + Tailwind + Framer Motion
- **🌐 Headless Architecture**: RESTful API, használd bármilyen frontendel
- **📊 Split Database Design**: Optimalizált adatkezelés 3 külön adatbázissal
- **🤖 AI Integration**: Beépített AI session kezelés
- **🪝 Webhooks**: Eseményvezérelt integráció más rendszerekkel

---

## ✨ Főbb Funkciók

### 🚀 Content Management

#### Slot Rendszer
Flexibilis content típusok saját schema-val:
- **Rich Text Editor**: Quill alapú WYSIWYG szerkesztő
- **Media Galery**: Drag & drop fájlfeltöltés
- **JSON Fields**: Strukturált adatok tárolása
- **Array Support**: Dinamikus ismétlődő mezők
- **Dependency Graph**: Automatikus tartalom kapcsolatok

#### Smart Versioning
Intelligens snapshot rendszer:
- **Differential Backups**: Csak a változások tárolása
- **LZ4 Compression**: Ultra-gyors tömörítés Rust WASM-mel
- **Point-in-time Recovery**: Visszaállás bármely korábbi verzióra
- **Automatic Snapshots**: Configurable auto-save
- **Version Browser**: Visual diff viewer az admin panelben

#### Static Cache System
Write-through cache automatikus generálással:
- **Zero PHP Overhead**: Statikus JSON fájlok közvetlen kiszolgálása
- **ETag Support**: Intelligens cache validáció
- **CDN Ready**: Cloudflare/Fastly kompatibilis
- **5-20x Faster**: Drámai teljesítménynövekedés
- **DDoS Protection**: Statikus fájlok nem tudják túlterhelni a backend-et

### 🔐 Biztonság & Authentikáció

#### Multi-Factor Authentication
- **TOTP (Google Authenticator)**: QR kódos telepítés
- **WebAuthn/Passkeys**: Biometrikus + hardware kulcsok (YubiKey)
- **Backup Codes**: Vészhelyzeti belépés
- **User-controlled**: Felhasználók maguk engedélyezhetik/tilthatják az MFA-t

#### Enterprise Security
- **JWT + RS256**: Asymmetrikus token alapú autentikáció
- **Defuse Encryption**: End-to-end titkosítás PHP oldalon
- **Blind Index**: Kereshető titkosított adatok
- **Rate Limiting**: Endpoint-szintű sebességkorlátozás
- **Account Lockout**: Brute-force védelem
- **Panic Mode**: Vészhelyzeti read-only mód

#### Forge System
Konfigurációs titkosítás Rust WASM-mel:
- **AES-256-GCM**: Military-grade encryption
- **Key Rotation**: Automatikus kulcscsere
- **Hardware Binding**: Opcionális hardver azonosító
- **Browser Encryption**: Client-side config titkosítás

### 🎨 Admin Dashboard

Modern React alkalmazás:
- **Dark/Light Mode**: Automatic theme switching
- **Responsive Design**: Mobile-first megközelítés
- **Drag & Drop**: Content rendezés, fájlfeltöltés
- **Real-time Updates**: Live notification rendszer
- **Schema Builder**: Visual schema editor
- **Media Library**: Grid view + advanced filtering
- **User Management**: Role-based access control
- **Webhook Dashboard**: Visual webhook konfiguráció és monitoring
- **Log Viewer**: Real-time system logs

### 🌐 API & Integráció

#### RESTful API
- **Content CRUD**: Teljes CRUD műveletek minden contentre
- **Batch Operations**: Bulk insert/update/delete
- **Full-text Search**: Cross-content keresés
- **File Upload**: Secure file handling
- **Versioning API**: Version list, diff, restore
- **Sitemap Generation**: Automatic XML sitemap

#### Webhooks
Eseményvezérelt integráció:
- **Custom Events**: content.created, content.updated, content.deleted, user.*, media.*
- **HMAC-SHA256 Signing**: Secure payload verification
- **Delivery Queue**: Automatic retry with exponential backoff
- **Delivery History**: Debug and monitoring
- **Per-webhook Secret**: Unique signing keys

#### AI Integration
- **Session Management**: Persistent AI conversation context
- **Token Tracking**: Usage monitoring és limitálás
- **Context Injection**: Automatic content context for AI

### 🦀 WebAssembly Modulok

#### nomad-entropy-rust
Kriptográfiai entrópia generálás:
```rust
// Hardware RNG alapú secure random
let entropy = generate_entropy(32);
```

#### nomad-forge-rust
Config encryption/decryption:
```rust
// AES-256-GCM + Argon2id
let encrypted = forge_encrypt(data, key);
```

#### nomad-versioning-rust
LZ4 compression for versioning:
```rust
// Ultra-fast compression/decompression
let compressed = lz4_compress(snapshot_data);
```

#### performance-backup-viewer-rust
Backup fájlok elemzése böngészőben:
```typescript
// Parse SQLite backups client-side
const tables = await parse_backup(file_buffer);
```

---

## 🏗️ Architektúra

### Tech Stack

**Backend:**
- PHP 8.1+ (strict typing, modern features)
- SQLite 3 (split database design)
- Composer (dependency management)
- Key libraries:
  - `firebase/php-jwt`: JWT token handling
  - `defuse/php-encryption`: Authenticated encryption
  - `lbuchs/webauthn`: WebAuthn/FIDO2
  - `spomky-labs/otphp`: TOTP implementation
  - `monolog/monolog`: Structured logging

**Frontend:**
- React 18 + TypeScript
- Vite (build tool)
- React Router 6
- Tailwind CSS
- Framer Motion (animations)
- React Quill (rich text)
- React Dropzone (file upload)
- Lucide React (icons)
- Axios (HTTP client)

**WebAssembly:**
- Rust (wasm32-unknown-unknown)
- wasm-pack (build tool)
- WASM bindings for crypto, compression, parsing

### Adatbázis Architektúra

**3-tier Split Database Design:**

```
┌─────────────────────────────────────┐
│     system.sqlite (Auth & Core)     │
├─────────────────────────────────────┤
│ • users                             │
│ • refresh_tokens                    │
│ • login_attempts                    │
│ • webauthn_credentials              │
│ • webhooks                          │
│ • webhook_deliveries                │
└─────────────────────────────────────┘

┌─────────────────────────────────────┐
│    database.sqlite (CMS Content)    │
├─────────────────────────────────────┤
│ • slots (content types)             │
│ • slot_data (content)               │
│ • media (files)                     │
│ • versions (snapshots)              │
└─────────────────────────────────────┘

┌─────────────────────────────────────┐
│   massive.sqlite (High-volume)      │
├─────────────────────────────────────┤
│ • logs (system logs)                │
│ • subscribers (newsletters)         │
│ • analytics (tracking)              │
│ • ai_sessions (AI context)          │
└─────────────────────────────────────┘
```

**Előnyök:**
- **Performance**: Kisebb fájlok, gyorsabb query-k
- **Backup**: Külön backup strategy / retention
- **Security**: Szenzitív adatok elkülönítése
- **Scalability**: Könnyebb sharding a jövőben

### Projekt Struktúra

```
All_In_One_CMS/
├── api/                          # PHP Backend
│   ├── bootstrap.php             # Application bootstrap
│   ├── composer.json             # PHP dependencies
│   ├── .env                      # Environment config
│   │
│   ├── endpoints/                # REST API endpoints
│   │   ├── auth/                 # Authentication
│   │   │   ├── login.php
│   │   │   ├── register.php
│   │   │   ├── refresh.php
│   │   │   ├── totp-*.php
│   │   │   └── webauthn-*.php
│   │   ├── admin/                # Admin operations
│   │   │   ├── users.php
│   │   │   ├── webhooks.php
│   │   │   ├── backup.php
│   │   │   └── panic.php
│   │   ├── ai/                   # AI integration
│   │   ├── forge/                # Forge endpoints
│   │   ├── install/              # Installation wizard
│   │   ├── system/               # System info
│   │   ├── data.php              # Content CRUD
│   │   ├── versions.php          # Versioning API
│   │   ├── search.php            # Full-text search
│   │   ├── media.php             # Media library
│   │   ├── static-serve.php      # Static cache serve
│   │   └── sitemap.php           # Sitemap generation
│   │
│   ├── src/                      # PHP Source Code
│   │   ├── Auth/                 # JWT, TOTP, WebAuthn services
│   │   ├── Config/               # Configuration classes
│   │   ├── Database/             # Repository pattern
│   │   ├── Middleware/           # Rate limit, CSRF, CORS
│   │   ├── Security/             # Encryption, blind index
│   │   ├── Services/             # Business logic
│   │   │   ├── Versioning/       # Snapshot, diff, restore
│   │   │   ├── VersioningService.php
│   │   │   ├── StaticCacheService.php
│   │   │   ├── WebhookQueueService.php
│   │   │   ├── SmartIngestService.php
│   │   │   ├── DependencyGraphService.php
│   │   │   └── ForgeImageQueueService.php
│   │   ├── Webhooks/             # Webhook handlers
│   │   ├── Ai/                   # AI session management
│   │   └── Installer/            # Setup wizard
│   │
│   ├── databases/                # SQLite files
│   │   ├── system.sqlite
│   │   ├── database.sqlite
│   │   └── massive.sqlite
│   │
│   ├── keys/                     # JWT RSA keys
│   │   ├── private.pem
│   │   └── public.pem
│   │
│   ├── static/                   # Static cache files
│   │   └── content/*.json
│   │
│   ├── files/                    # Uploaded media files
│   ├── logs/                     # Application logs
│   └── vendor/                   # Composer packages
│
├── frontend/                     # React Frontend
│   ├── src/
│   │   ├── api/                  # API client & types
│   │   │   ├── client.ts         # Axios instance
│   │   │   ├── auth.ts           # Auth API calls
│   │   │   ├── content.ts        # Content API
│   │   │   └── types.ts          # TypeScript interfaces
│   │   │
│   │   ├── components/           # React Components
│   │   │   ├── auth/             # Login, MFA setup
│   │   │   ├── layout/           # Header, Sidebar, Layout
│   │   │   ├── content/          # Slot browser, editor
│   │   │   ├── media/            # Media library, upload
│   │   │   ├── ui/               # Button, Modal, Input, etc.
│   │   │   └── webhooks/         # Webhook dashboard
│   │   │
│   │   ├── pages/                # Page components
│   │   │   ├── LoginPage.tsx
│   │   │   ├── DashboardPage.tsx
│   │   │   ├── SlotEditorPage.tsx
│   │   │   ├── MediaPage.tsx
│   │   │   ├── UsersPage.tsx
│   │   │   ├── WebhooksPage.tsx
│   │   │   ├── VersionHistoryPage.tsx
│   │   │   └── SettingsPage.tsx
│   │   │
│   │   ├── context/              # React Context
│   │   │   ├── AuthContext.tsx   # Authentication state
│   │   │   └── UIContext.tsx     # Theme, modals, notifications
│   │   │
│   │   ├── hooks/                # Custom hooks
│   │   │   ├── useAuth.ts
│   │   │   ├── usePublicData.ts  # Static cache hook
│   │   │   ├── useVersioning.ts
│   │   │   └── useWebhooks.ts
│   │   │
│   │   ├── services/             # Frontend services
│   │   │   ├── storage.ts        # LocalStorage wrapper
│   │   │   ├── crypto.ts         # Client-side crypto
│   │   │   └── validation.ts     # Form validation
│   │   │
│   │   ├── wasm-lib/             # WASM bindings
│   │   │   ├── entropy/
│   │   │   ├── forge/
│   │   │   └── versioning/
│   │   │
│   │   ├── App.tsx               # Main app component
│   │   └── main.tsx              # Entry point
│   │
│   ├── public/                   # Static assets
│   ├── vite.config.ts            # Vite config
│   ├── tailwind.config.js        # Tailwind config
│   └── package.json              # Node dependencies
│
├── wasm_modules/                 # Rust WASM Modules
│   ├── nomad-entropy-rust/
│   │   ├── src/lib.rs
│   │   ├── Cargo.toml
│   │   └── pkg/                  # wasm-pack output
│   ├── nomad-forge-rust/
│   ├── nomad-versioning-rust/
│   └── performance-backup-viewer-rust/
│
├── docs/                         # Documentation
│   ├── README.md                 # Docs index
│   ├── setup.md                  # Setup guide
│   ├── api.md                    # API reference
│   ├── security.md               # Security details
│   ├── forge.md                  # Forge documentation
│   ├── static-cache.md           # Cache system
│   ├── webhooks.md               # Webhook guide
│   ├── schema-builder.md         # Schema documentation
│   └── deployment.md             # Production deployment
│
├── test/                         # Testing & Development
│   ├── run_pentest.php           # Security testing
│   ├── seed_test_data.php        # Test data generation
│   └── *.php                     # Various test scripts
│
├── start-dev.zsh                 # Development server script
├── build_release.zsh             # Production build script
└── README.md                     # This file
```

---

## 🚀 Gyors Kezdés

### Előfeltételek

- **PHP 8.1+** (with SQLite, OpenSSL extensions)
- **Node.js 18+** & npm
- **Composer** (PHP dependency manager)
- **Rust + wasm-pack** (optional, for WASM development)

### 1. Telepítés

```bash
# Clone repository
git clone https://github.com/vnorman1/nomad-cms.git
cd nomad-cms
```

### 2. Backend Setup

```bash
cd api

# Install PHP dependencies
composer install

# Copy environment template
cp .env.example .env

# Generate JWT RSA keys
mkdir -p keys
openssl genrsa -out keys/private.pem 2048
openssl rsa -in keys/private.pem -pubout -out keys/public.pem

# Generate encryption key
php -r "echo 'ENCRYPTION_KEY=' . \Defuse\Crypto\Key::createNewRandomKey()->saveToAsciiSafeString() . PHP_EOL;"

# Generate password pepper (64 hex chars)
php -r "echo 'PASSWORD_PEPPER=' . bin2hex(random_bytes(32)) . PHP_EOL;"

# Generate blind index key (64 hex chars)
php -r "echo 'BLIND_INDEX_KEY=' . bin2hex(random_bytes(32)) . PHP_EOL;"
```

**Másold ki a generált értékeket a `.env` fájlba!**

### 3. Frontend Setup

```bash
cd ../frontend

# Install dependencies
npm install

# Copy environment template (optional)
cp .env.example .env
```

### 4. Indítás Development Módban

**Egyszerű mód (zsh script):**
```bash
# Indítja mindkét szervert (backend + frontend)
./start-dev.zsh
```

**Manuális mód:**

```bash
# Terminal 1 - Backend
cd api
php -S 127.0.0.1:8000

# Terminal 2 - Frontend  
cd frontend
npm run dev
```

### 5. Installation Wizard

Nyisd meg a böngészőben:
```
http://localhost:5173
```

A telepítő varázsló végigvezet:
1. ✅ Rendszer ellenőrzés (PHP verziók, extensionök)
2. 🔑 Admin account létrehozása
3. ⚙️ Alap beállítások
4. 🎉 Kész!

---

## 📚 Dokumentáció

### Részletes Útmutatók

| Dokumentum | Leírás |
|-----------|--------|
| [setup.md](docs/setup.md) | Részletes telepítési útmutató |
| [api.md](docs/api.md) | Teljes API referencia |
| [security.md](docs/security.md) | Biztonsági funkciók részletesen |
| [forge.md](docs/forge.md) | Forge encryption rendszer |
| [static-cache.md](docs/static-cache.md) | Static cache működése backend |
| [static-cache-frontend.md](docs/static-cache-frontend.md) | Frontend integráció |
| [webhooks.md](docs/webhooks.md) | Webhook konfiguráció és használat |
| [schema-builder.md](docs/schema-builder.md) | Schema készítés és field típusok |
| [deployment.md](docs/deployment.md) | Production deployment guide |
| [batch-operations.md](docs/batch-operations.md) | Bulk műveletekhez API |
| [media-library.md](docs/media-library.md) | Fájl feltöltés és kezelés |

### API Endpoints Gyorsreferencia

**Authentication:**
```bash
POST   /api/endpoints/auth/login.php          # Login
POST   /api/endpoints/auth/register.php       # Register
POST   /api/endpoints/auth/refresh.php        # Refresh token
GET    /api/endpoints/auth/me.php             # Current user
GET    /api/endpoints/auth/totp-setup.php     # TOTP setup QR
POST   /api/endpoints/auth/totp-verify.php    # Verify TOTP
GET    /api/endpoints/auth/webauthn-register.php?action=options  # WebAuthn challenge
POST   /api/endpoints/auth/webauthn-register.php  # Register passkey
```

**Content:**
```bash
GET    /api/endpoints/data.php?slot=hero      # Get content
POST   /api/endpoints/data.php                # Create/update
DELETE /api/endpoints/data.php?id=123         # Delete
GET    /api/endpoints/search.php?q=keyword    # Search
POST   /api/endpoints/batch-content.php       # Bulk operations
```

**Versioning:**
```bash
GET    /api/endpoints/versions.php?slot_id=1  # List versions
GET    /api/endpoints/versions.php?id=5       # Get specific version
POST   /api/endpoints/versions.php?action=restore&id=5  # Restore
```

**Media:**
```bash
GET    /api/endpoints/media.php               # List files
POST   /api/endpoints/upload.php              # Upload file
GET    /api/endpoints/file-serve.php?id=123   # Serve file
```

**Static Cache:**
```bash
GET    /api/endpoints/static-serve.php?slot=hero  # Get cached content
POST   /api/endpoints/admin/cache-rebuild.php     # Rebuild cache
GET    /api/endpoints/admin/cache-rebuild.php?action=stats  # Cache stats
```

**Admin:**
```bash
GET    /api/endpoints/admin/users.php         # List users
POST   /api/endpoints/admin/user-actions.php  # User actions
GET    /api/endpoints/admin/webhooks.php      # List webhooks
POST   /api/endpoints/admin/webhooks.php      # Create webhook
GET    /api/endpoints/admin/backup.php        # Download backup
POST   /api/endpoints/admin/panic.php         # Toggle panic mode
```

### Frontend Példák

**Static Cache használata React-ban:**
```tsx
import { usePublicData } from '@/hooks/usePublicData';

function HeroSection() {
    const { data, loading, error } = usePublicData<HeroContent>('hero');
    
    if (loading) return <Skeleton />;
    if (error) return <ErrorMessage error={error} />;
    
    return (
        <section>
            <h1>{data?.title}</h1>
            <p>{data?.subtitle}</p>
        </section>
    );
}
```

**Versioning használata:**
```tsx
import { useVersioning } from '@/hooks/useVersioning';

function VersionHistory({ slotId }: { slotId: number }) {
    const { versions, restore } = useVersioning(slotId);
    
    const handleRestore = async (versionId: number) => {
        await restore(versionId);
        alert('Content restored!');
    };
    
    return (
        <ul>
            {versions.map(v => (
                <li key={v.id}>
                    {v.created_at}
                    <button onClick={() => handleRestore(v.id)}>
                        Restore
                    </button>
                </li>
            ))}
        </ul>
    );
}
```

---

## 🛠️ Fejlesztés

### Backend Development

```bash
cd api

# Start dev server
php -S 127.0.0.1:8000

# SSL mode (requires cert)
./start-ssl.sh

# Check syntax
php -l endpoints/data.php

# Run PHPStan
composer test

# Code style check
composer cs-check

# Auto-fix code style
composer cs-fix
```

### Frontend Development

```bash
cd frontend

# Dev server with hot reload
npm run dev

# Type check
npx tsc --noEmit

# Build for production
npm run build

# Preview production build
npm run preview

# Lint
npm run lint
```

### WASM Development

```bash
cd wasm_modules/nomad-entropy-rust

# Build WASM module
wasm-pack build --target web

# Output: pkg/ directory
# Copy pkg/* to frontend/src/wasm-lib/entropy/
```

### Testing

```bash
cd test

# Run penetration test
php run_pentest.php

# Seed test data
php seed_test_data.php

# Test versioning
php test_hybrid_versioning.php

# Webhook stress test
python webhook-stress.py
```

### Debug Mode

**.env:**
```bash
APP_DEBUG=true
APP_ENV=development
```

A debug módban minden error megjelenik a response-ban JSON formátumban.

---

## 🚢 Deployment

### Production Build

```bash
# Build script (mindent egyben)
./build_release.zsh
```

**Vagy manuálisan:**

```bash
# 1. Frontend build
cd frontend
npm run build
# Output: dist/

# 2. Backend setup
cd ../api
composer install --no-dev --optimize-autoloader

# 3. Set production environment
APP_ENV=production
APP_DEBUG=false
```

### Web Server Config

**Apache (.htaccess):**
```apache
# Frontend
<IfModule mod_rewrite.c>
    RewriteEngine On
    RewriteBase /
    RewriteRule ^index\.html$ - [L]
    RewriteCond %{REQUEST_FILENAME} !-f
    RewriteCond %{REQUEST_FILENAME} !-d
    RewriteRule . /index.html [L]
</IfModule>

# Security headers
<IfModule mod_headers.c>
    Header set X-Content-Type-Options "nosniff"
    Header set X-Frame-Options "SAMEORIGIN"
    Header set X-XSS-Protection "1; mode=block"
    Header set Referrer-Policy "strict-origin-when-cross-origin"
</IfModule>
```

**Nginx:**
```nginx
server {
    listen 443 ssl http2;
    server_name cms.example.com;
    
    # SSL
    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;
    
    # Frontend (React SPA)
    location / {
        root /var/www/nomad-cms/frontend/dist;
        try_files $uri $uri/ /index.html;
    }
    
    # Static cache (direct serve, bypass PHP!)
    location /api/static/ {
        alias /var/www/nomad-cms/api/static/;
        add_header Cache-Control "public, max-age=3600";
        add_header X-Served-By "nginx-static";
    }
    
    # API (PHP-FPM)
    location /api/ {
        alias /var/www/nomad-cms/api/endpoints/;
        
        location ~ \.php$ {
            fastcgi_pass unix:/var/run/php/php8.1-fpm.sock;
            fastcgi_index index.php;
            fastcgi_param SCRIPT_FILENAME $request_filename;
            include fastcgi_params;
        }
    }
    
    # Security
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-XSS-Protection "1; mode=block" always;
}
```

### Environment Variables (Production)

```bash
# Application
APP_ENV=production
APP_DEBUG=false
APP_URL=https://api.yourdomain.com

# JWT
JWT_ALGORITHM=RS256
JWT_ACCESS_TOKEN_TTL=900
JWT_REFRESH_TOKEN_TTL=604800

# Security
ENCRYPTION_KEY=def00000...  # Generate new for production!
PASSWORD_PEPPER=...          # Generate new!
BLIND_INDEX_KEY=...          # Generate new!

# WebAuthn (NO PORT!)
WEBAUTHN_RP_ID=yourdomain.com
WEBAUTHN_RP_ORIGIN=https://yourdomain.com

# Rate Limiting
RATE_LIMIT_ENABLED=true
RATE_LIMIT_MAX_REQUESTS=100
RATE_LIMIT_WINDOW_SECONDS=60

# Session
SESSION_SECURE_COOKIE=true
SESSION_SAME_SITE=Strict

# CORS
CORS_ALLOWED_ORIGINS=https://yourdomain.com
```

### Security Checklist

- [ ] Generate új RSA keys (`keys/private.pem`, `keys/public.pem`)
- [ ] Generate új `ENCRYPTION_KEY`
- [ ] Generate új `PASSWORD_PEPPER`
- [ ] Generate új `BLIND_INDEX_KEY`
- [ ] Set `APP_ENV=production` és `APP_DEBUG=false`
- [ ] HTTPS enabled (SSL cert)
- [ ] `SESSION_SECURE_COOKIE=true`
- [ ] CORS configured (`CORS_ALLOWED_ORIGINS`)
- [ ] Rate limiting enabled
- [ ] File permissions: `chmod 600 .env keys/*.pem`
- [ ] Database permissions: `chmod 644 databases/*.sqlite`
- [ ] WebAuthn domain matches (`WEBAUTHN_RP_ID` = domain without port)

### Backup Strategy

```bash
# Manual backup
cd api/databases
sqlite3 system.sqlite ".backup ../backups/system-$(date +%Y%m%d-%H%M%S).sqlite"
sqlite3 database.sqlite ".backup ../backups/database-$(date +%Y%m%d-%H%M%S).sqlite"
sqlite3 massive.sqlite ".backup ../backups/massive-$(date +%Y%m%d-%H%M%S).sqlite"

# Via API (requires admin token)
curl -X GET https://api.yourdomain.com/admin/backup.php \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -o backup.zip
```

**Backup retention javaslat:**
- **System DB**: Daily backup, 30 nap megőrzés
- **Content DB**: Hourly backup, 7 nap megőrzés
- **Massive DB**: Weekly backup, 90 nap megőrzés

---

## 🤝 Contributing

Contributions are welcome! Please:

1. Fork a repository-t
2. Készíts egy feature branch-et (`git checkout -b feature/amazing-feature`)
3. Commit-old a változásokat (`git commit -m 'Add amazing feature'`)
4. Push-old a branch-et (`git push origin feature/amazing-feature`)
5. Nyiss egy Pull Request-et

### Code Style

- **PHP**: PSR-12 standard
- **TypeScript**: ESLint + Prettier
- **Commits**: Conventional Commits format

---

## 📄 Licenc

Proprietary - All rights reserved.

Ez a projekt jelenleg **nem open-source**. Kereskedelmi használathoz vedd fel a kapcsolatot a fejlesztővel.

---

## 🙏 Acknowledgments

- **Defuse PHP Encryption** - Rock-solid encryption library
- **lbuchs/webauthn** - WebAuthn implementation
- **Tailwind CSS** - Utility-first CSS framework
- **Lucide Icons** - Beautiful icon set
- **Rust Community** - WASM tooling

---

<div align="center">

**Built with ❤️ and ☕ by [V.N.]**

*Enterprise-grade CMS for the modern web*

[Documentation](docs/) • [API Reference](docs/api.md) • [Security](docs/security.md)

</div>
