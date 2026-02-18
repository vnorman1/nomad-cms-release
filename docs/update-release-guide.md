# 🔄 NOMAD CMS — Frissítés Készítési Útmutató

> Hogyan hozz létre production-ready release-t a delta update rendszerrel.

---

## 📋 Áttekintés

A NOMAD CMS delta update rendszere **csak a megváltozott fájlokat** tölti le és telepíti. A folyamat:

```
Kód módosítás → Verzió növelés → Git tag → GitHub Actions → Release assets → OTA frissítés
```

**Release assets (automatikusan generálva):**
- `manifest.json` — Fájl lista SHA-256 hash-ekkel
- `files.zip` — Teljes deployolható csomag (buildelt frontend + API + vendor)
- `checksums.sha256` — Ellenőrző összegek
- `manifest.json.sig` — GPG aláírás (opcionális)

---

## 🚀 Lépésről Lépésre

### 1. Verzió Növelés

Szerkeszd az `api/src/Config/Version.php` fájlt:

```php
// api/src/Config/Version.php

public const VERSION = '1.1.0';        // ← Növeld a verziót (semver)
public const BUILD_DATE = '2026-02-15'; // ← Mai dátum
public const CODENAME = 'Genesis';      // ← Opcionálisan változtatható
```

**Verzió szabályok (semver):**
| Változás típusa | Példa | Mikor |
|---|---|---|
| `1.0.0` → `1.0.1` (patch) | Hibajavítás | Bug fix, security patch |
| `1.0.0` → `1.1.0` (minor) | Új funkció | Visszafelé kompatibilis feature |
| `1.0.0` → `2.0.0` (major) | Breaking change | API változás, nagy refaktor |

### 2. Kód Módosítások

Végezd el a szükséges módosításokat. A delta rendszer automatikusan kiszűri a **védett útvonalakat**:

| Védett (NEM frissül) | Miért |
|---|---|
| `.env`, `.env.local` | Konfigurációs titkok |
| `databases/` | Felhasználói adatok |
| `uploads/`, `files/` | Feltöltött média |
| `keys/` | Biztonsági kulcsok |
| `vendor/`, `node_modules/` | Függőségek (composer/npm kezeli) |
| `logs/`, `backups/`, `temp/` | Runtime adatok |

### 3. Adatbázis Migráció (ha szükséges)

Ha az új verzió adatbázis változást igényel, hozz létre migrációs fájlt:

```bash
# SQL migráció
api/data/migrations/2026_02_15_000001_add_new_column.sql
```

```sql
-- api/data/migrations/2026_02_15_000001_add_new_column.sql
ALTER TABLE content ADD COLUMN featured BOOLEAN DEFAULT 0;
CREATE INDEX idx_content_featured ON content(featured);
```

Vagy PHP migráció összetettebb logikához:

```php
<?php
// api/data/migrations/2026_02_15_000002_seed_data.php
return new class {
    public function up(PDO $db): void {
        $db->exec("UPDATE settings SET value = 'new_default' WHERE key = 'theme'");
    }
    
    public function down(PDO $db): void {
        $db->exec("UPDATE settings SET value = 'old_default' WHERE key = 'theme'");
    }
};
```

**Fontos:** A migrációs fájl neve **kötelezően** `YYYY_MM_DD_NNNNNN_description.sql` vagy `.php` formátumú.

### 4. Commit és Tag

```bash
# Commitold a változásokat
git add -A
git commit -m "v1.1.0: Új funkció leírása"

# Hozd létre a tag-et (MINDIG "v" prefixszel!)
git tag v1.1.0

# Pushold mindent
git push origin main
git push origin v1.1.0
```

⚠️ **A tag formátuma kötelezően `v{major}.{minor}.{patch}`** — pl. `v1.1.0`, `v2.0.0`

### 5. GitHub Actions Automatikus Build

A `git push origin v1.1.0` automatikusan elindítja a `.github/workflows/release.yml` workflow-t:

1. ✅ Checkout kód (teljes git history)
2. ✅ PHP 8.2 + Node.js 20 telepítés
3. ✅ **Frontend build** (`npm ci && npm run build`) — Vite production build
4. ✅ **Composer install** (`--no-dev --optimize-autoloader`) — produkciós függőségek
5. ✅ Előző tag megtalálása (`v1.0.0`)
6. ✅ Deployolható csomag összeállítás (`release_build/nomad-cms/` — frontend + API + vendor + config)
7. ✅ Vendor optimalizálás (felesleges font fájlok eltávolítása, ~16MB megtakarítás)
8. ✅ **Manifest generálás A BUILDELT CSOMAGBÓL** — útvonalak pontosan egyeznek a zip tartalmával
9. ✅ `files.zip` csomagolás a buildelt mappából
10. ✅ `checksums.sha256` generálás
11. ✅ GPG aláírás (ha `GPG_PRIVATE_KEY` secret be van állítva)
12. ✅ GitHub Release létrehozás az összes asset-tel

> **Fontos:** A workflow **ugyanazt a build pipeline-t** futtatja mint a `build_release_fancy.zsh`, tehát a `files.zip` tartalma megegyezik a manuális build kimenetével.

**Eredmény:** `https://github.com/{owner}/{repo}/releases/tag/v1.1.0`

### 6. Frissítés Telepítése (Admin Panel)

Az admin panelben:
1. Navigálj a **Beállítások → Rendszerfrissítés** tab-ra
2. Kattints a **Frissítés keresése** gombra
3. Ha elérhető frissítés → megjelenik a delta összesítés (hány fájl változott, méret)
4. Kattints a **Frissítés telepítése** gombra
5. Valós idejű progress bar mutatja a folyamatot (SSE)
6. Kész! ✅

**Vagy API-n keresztül:**
```bash
# Frissítés ellenőrzés
curl -H "Authorization: Bearer {JWT_TOKEN}" \
     https://your-domain.com/api/system/check-update.php

# Frissítés telepítés
curl -X POST \
     -H "Authorization: Bearer {JWT_TOKEN}" \
     -H "Content-Type: application/json" \
     -d '{"version": "1.1.0"}' \
     https://your-domain.com/api/system/apply-update.php
```

---

## 📦 Release Asset Formátumok (Pontos Struktúra)

Minden GitHub Release-nek **4 fájlt** kell tartalmaznia. Ezeket a GitHub Actions workflow automatikusan generálja, de itt leírjuk pontosan mi micsoda, hogy manuálisan is el tudd készíteni ha szükséges.

### `manifest.json` — A frissítés "leltárja"

Ez a legfontosabb fájl. A rendszer ebből tudja meg, hogy melyik fájlok változtak.

```json
{
  "version": "1.1.0",
  "build_date": "2026-02-18T12:00:00+01:00",
  "files": {
    "api/src/Services/DeltaUpdateService.php": {
      "hash": "a1b2c3d4e5f6...64 karakter SHA-256 hash",
      "size": 22142,
      "modified": "2026-02-18T12:00:00+01:00"
    },
    "api/endpoints/system/apply-update.php": {
      "hash": "f6e5d4c3b2a1...64 karakter SHA-256 hash", 
      "size": 9763,
      "modified": "2026-02-18T12:00:00+01:00"
    },
    "frontend/.next/static/chunks/main.js": {
      "hash": "1234abcd5678...64 karakter SHA-256 hash",
      "size": 45000,
      "modified": "2026-02-18T12:00:00+01:00"
    }
  },
  "deleted": [
    "api/src/Services/OldDeprecatedService.php",
    "frontend/src/components/LegacyComponent.tsx"
  ],
  "migrations": [
    "2026_02_18_000001_add_featured_column.sql"
  ],
  "signature": "-----BEGIN PGP SIGNATURE-----\n...(opcionális, GPG aláírás)...\n-----END PGP SIGNATURE-----",
  "fingerprint": "ABCD1234EFGH5678..."
}
```

**Szabályok:**
| Mező | Kötelező? | Leírás |
|------|-----------|--------|
| `version` | ✅ | Semver formátum: `X.Y.Z` (nincs `v` prefix!) |
| `files` | ✅ | Összes fájl a csomagban, kulcs = relatív útvonal a projekt gyökeréhez képest |
| `files.*.hash` | ✅ | SHA-256 hash, 64 karakter, kisbetűs hex |
| `files.*.size` | ✅ | Fájl méret byte-ban |
| `deleted` | ❌ | Fájlok amiket törölni kell a régi verzióból |
| `migrations` | ❌ | Migrációs fájlnevek, sorrendben futnak |
| `signature` | ❌ | GPG aláírás (kötelező ha `UPDATE_REQUIRE_GPG_SIGNATURE=true`) |

> [!IMPORTANT]
> A `files` mezőben az útvonalak **relatívak** a projekt gyökérhez képest, és **nem tartalmazhatnak** `..`, `/` prefixet, vagy Windows drive betűket. A `SecurityValidator` ezeket ellenőrzi.

### `files.zip` — A fájlok csomagja

A ZIP a **teljes deployolható csomagot** tartalmazza. A struktúra a ZIP-en belül:

```
files.zip
└── nomad-cms/                    ← Egyetlen gyökér mappa (kötelező!)
    ├── api/
    │   ├── src/
    │   │   ├── Services/
    │   │   │   ├── DeltaUpdateService.php
    │   │   │   └── SecurityValidator.php
    │   │   └── Config/
    │   │       └── Version.php
    │   ├── endpoints/
    │   │   └── system/
    │   │       ├── apply-update.php
    │   │       └── check-update.php
    │   ├── bootstrap.php
    │   └── index.php
    └── frontend/
        └── .next/
            └── static/
                └── chunks/
                    └── main.js
```

**Szabályok:**
- A ZIP-en belül **egy gyökér mappa** kell legyen (pl. `nomad-cms/`) — a rendszer automatikusan detektálja és eltávolítja ezt a prefixet
- A gyökér mappán belüli útvonalaknak **meg kell egyezniük** a `manifest.json` `files` kulcsaival
- **NEM kell tartalmaznia** a védett fájlokat (`.env`, `databases/`, `uploads/`, `keys/`, `vendor/`, `node_modules/`)

### `checksums.sha256` — Ellenőrző összegek

Egyszerű szöveges fájl, minden sor: `{sha256 hash}  {fájlnév}` (két szóközzel elválasztva!):

```
a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2  manifest.json
f6e5d4c3b2a1f6e5d4c3b2a1f6e5d4c3b2a1f6e5d4c3b2a1f6e5d4c3b2a1f6e5  files.zip
```

> [!CAUTION]
> **Kötelezően tartalmaznia kell a `manifest.json` sort!** Ha hiányzik, a rendszer elutasítja a frissítést (Bug #5 javítás).

### `manifest.json.sig` — GPG aláírás (opcionális)

Bináris vagy ASCII-armored GPG detached signature:

```bash
# Generálás manuálisan:
gpg --detach-sign --armor -o manifest.json.sig manifest.json
```

---

## 🔄 Mi Történik Frissítéskor? (Belső Folyamat)

```
1. check-update.php (GET)
   ├── Letölti a manifest.json-t a GitHub Release-ből
   ├── Összeveti a lokális fájlokkal (SHA-256 hash)
   └── Visszaadja: hány fájl változott, mekkora a letöltés

2. apply-update.php (POST, body: {"version": "1.1.0"})
   ├── Letölti a manifest.json-t
   ├── Ellenőrzi a GPG aláírást (ha szükséges)
   ├── Ellenőrzi az útvonalakat (path traversal védelem)
   ├── Kiszámolja a deltát (mi változott)
   ├── Letölti a files.zip-et
   ├── Kicsomagolja és ellenőrzi a hash-eket
   ├── Backup-ot készít a módosuló/törlendő fájlokról
   ├── Telepíti a fájlokat (atomi: ha hiba → rollback)
   ├── Futtatja a migrációkat (ha vannak)
   └── Visszaadja: siker/hiba + backup ID

3. update-progress.php (SSE, real-time)
   └── Mutatja a progress-t a frontend-en
```

---

## 🔐 GPG Aláírás Beállítása (Opcionális, Ajánlott)

A GPG aláírás biztosítja, hogy a frissítés valóban tőled jön.

### Kulcs Generálás

```bash
# GPG kulcspár generálás
gpg --full-generate-key
# Válaszd: RSA 4096, nincs lejárat, email megadás

# Publikus kulcs exportálás
gpg --armor --export your-email@example.com > api/keys/update-signing.pub

# Privát kulcs exportálás (GitHub Secrets-be kerül!)
gpg --armor --export-secret-keys your-email@example.com
```

### GitHub Secret Beállítás

1. GitHub repo → Settings → Secrets and variables → Actions
2. New repository secret: `GPG_PRIVATE_KEY`
3. Illeszd be a privát kulcsot

### Produkciós Szerver Beállítás

```bash
# .env fájlban
UPDATE_REQUIRE_GPG_SIGNATURE=true
UPDATE_GPG_PUBLIC_KEY=keys/update-signing.pub
```

---

## 🔄 Rollback (Visszaállítás)

Ha a frissítés hibát okoz:

```bash
# Admin panelen: Beállítások → Rendszerfrissítés → Visszaállítás

# Vagy API-n:
curl -X POST \
     -H "Authorization: Bearer {JWT_TOKEN}" \
     -H "Content-Type: application/json" \
     -d '{"backupId": "update_20260215_143022"}' \
     https://your-domain.com/api/system/rollback.php
```

A `backupId` a frissítés válaszában található meg.

---

## 📁 Fájl Struktúra

```
.github/
  workflows/
    release.yml              ← GitHub Actions workflow
scripts/
  generate-manifest.php      ← Manifest generátor
api/
  src/
    Config/
      Version.php            ← Verzió konfigurációs (itt növeld a verziót!)
    Services/
      DeltaUpdateService.php ← Delta logika (compare, apply, rollback)
      UpdateDownloader.php   ← Letöltés (GitHub + jsDelivr CDN fallback)
      SecurityValidator.php  ← GPG, SHA-256, path traversal védelem
      MigrationRunner.php    ← Adatbázis migrációk futtatása
      UpdateAuditLogger.php  ← Audit napló
  endpoints/
    system/
      check-update.php       ← GET - Elérhető frissítés ellenőrzése
      apply-update.php       ← POST - Frissítés telepítése
      update-progress.php    ← SSE - Valós idejű progress
      rollback.php           ← POST - Visszaállítás backup-ból
      releases.php           ← GET - Elérhető release-ek listája
      version.php            ← GET - Aktuális verzió
```

---

## ⚡ Gyors Checklist

```
□ api/src/Config/Version.php VERSION növelve
□ api/src/Config/Version.php BUILD_DATE frissítve
□ Migrációs fájlok létrehozva (ha kellenek)
□ Kód tesztelve lokálisan
□ git add -A && git commit
□ git tag v{X.Y.Z}
□ git push origin main && git push origin v{X.Y.Z}
□ GitHub Actions build sikeres ✅
□ Release assets megjelentek (manifest.json, files.zip, checksums.sha256)
□ Teszt szerveren kipróbálva
□ Produkción telepítve
```

---

## 🔧 GitHub Repository Beállítás (Első Alkalommal)

### 1. `Version.php` módosítása

```php
// api/src/Config/Version.php
public const GITHUB_OWNER = 'your-actual-username';  // ← GitHub username
public const GITHUB_REPO = 'your-actual-repo';       // ← Repository neve
```

### 2. Repository Létrehozás

```bash
git remote add origin https://github.com/your-username/your-repo.git
git push -u origin main
```

### 3. Első Release

```bash
git tag v1.0.0
git push origin v1.0.0
# A workflow automatikusan létrehozza az első release-t
```

---

## ❓ Hibaelhárítás

| Probléma | Megoldás |
|---|---|
| "Failed to download manifest" | Ellenőrizd a `GITHUB_OWNER` és `GITHUB_REPO` értékeket a `Version.php`-ban |
| "GPG signature required" | Állítsd be a GPG kulcsot, vagy `.env`-ben: `UPDATE_REQUIRE_GPG_SIGNATURE=false` |
| "Rate limited (429)" | GitHub API rate limit — várj 1 percet, a rendszer automatikusan jsDelivr CDN-re vált |
| Workflow nem indul el | A tag formátuma `v*.*.*` legyen (pl. `v1.1.0`, nem `1.1.0`) |
| "Hash mismatch" | A `files.zip` sérült — próbáld újra a frissítést |
| Rollback nem működik | A `backupId` formátuma: `update_YYYYMMDD_HHMMSS` |
