<?php
/**
 * NOMAD CMS — generated standalone web installer.
 * Set the ownership token below before uploading to an empty HTTPS directory.
 * Embedded native code verifies signed packages without Composer or SSH.
 */
declare(strict_types=1);

namespace NomadUpdate {
/**
 * NOMAD CMS — immutable update filesystem primitives.
 * Keeps package ownership separate from persistent customer data and bootstrap
 * infrastructure. Every live mutation is path checked and atomically renamed.
 */




final class UpdateException extends \RuntimeException
{
    public function __construct(public readonly string $errorCode, string $message, int $status = 400)
    {
        parent::__construct($message, $status);
    }
}

final class Files
{
    public const MAX_FILES = 12000;
    public const MAX_FILE = 33554432;
    public const MAX_UNPACKED = 268435456;
    public const MAX_ARCHIVE = 67108864;

    public static function json(string $path, array $default = []): array
    {
        if (!is_file($path)) {
            return $default;
        }
        if (is_link($path) || filesize($path) > 4194304) {
            throw new UpdateException('INVALID_STATE', 'Unsafe or oversized state file.', 500);
        }
        $data = json_decode((string) file_get_contents($path), true, 64, JSON_THROW_ON_ERROR);
        if (!is_array($data)) {
            throw new UpdateException('INVALID_STATE', 'Invalid state document.', 500);
        }
        return $data;
    }

    public static function writeJson(string $path, array $data): void
    {
        self::write($path, json_encode($data, JSON_THROW_ON_ERROR | JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES) . "\n");
    }

    public static function write(string $path, string $bytes, int $mode = 0600): void
    {
        self::directory(dirname($path));
        if (is_link($path)) {
            throw new UpdateException('UNSAFE_PATH', 'Symlink destinations are forbidden.');
        }
        $tmp = $path . '.tmp-' . bin2hex(random_bytes(6));
        $handle = fopen($tmp, 'xb');
        if ($handle === false) {
            throw new UpdateException('WRITE_FAILED', 'Cannot create temporary file.', 500);
        }
        try {
            chmod($tmp, $mode);
            $offset = 0;
            while ($offset < strlen($bytes)) {
                $written = fwrite($handle, substr($bytes, $offset, 65536));
                if ($written === false || $written === 0) {
                    throw new UpdateException('WRITE_FAILED', 'Cannot persist file.', 500);
                }
                $offset += $written;
            }
            fflush($handle);
            if (function_exists('fsync') && !fsync($handle)) {
                throw new UpdateException('WRITE_FAILED', 'Cannot synchronize file.', 500);
            }
        } finally {
            fclose($handle);
        }
        if (!rename($tmp, $path)) {
            @unlink($tmp);
            throw new UpdateException('WRITE_FAILED', 'Cannot atomically replace file.', 500);
        }
    }

    public static function directory(string $path, int $mode = 0700): void
    {
        if (is_link($path)) {
            throw new UpdateException('UNSAFE_PATH', 'Symlink directories are forbidden.');
        }
        if (!is_dir($path)) {
            if (dirname($path) !== $path) {
                self::directory(dirname($path), $mode);
            }
            if (!mkdir($path, $mode) && !is_dir($path)) {
                throw new UpdateException('WRITE_FAILED', 'Cannot create update directory.', 500);
            }
        }
    }

    public static function relative(string $path): bool
    {
        return $path !== '' && strlen($path) <= 512 && !preg_match('~[\\\\:\x00-\x1f\x7f]~', $path)
            && !str_starts_with($path, '/') && !preg_match('~(^|/)(\.|\.\.|)(/|$)~', $path);
    }

    public static function managed(string $path): bool
    {
        if (!self::relative($path) || str_contains($path, '/.') || str_starts_with($path, '.')) {
            return false;
        }
        if (preg_match('~^api/vendor/lbuchs/webauthn/_test/rootCertificates/[A-Za-z0-9_-]+\.pem$~D', $path)) {
            return true; // Public attestation certificates, never customer keys.
        }
        if (preg_match('~(?:\.(?:sqlite|db)(?:[.-]|$)|\.(?:lock|log|pem|key)$|\.env(?:\.|$))~i', $path)) {
            return false;
        }
        if (in_array($path, ['version.json', 'sitemap.xsl', 'api/bootstrap.php', 'api/index.php', 'api/router.php', 'api/notification-integrations.php', 'api/composer.json', 'api/composer.lock'], true)) {
            return true;
        }
        return (bool) preg_match('~^(?:nomad/(?:assets/|fonts/|index\.html$|[^/]+\.(?:ico|png|svg|webmanifest)$)|api/(?:src|endpoints|vendor|integrations|lib|bin|analytics|external|f|scripts)/)~', $path);
    }

    public static function installOnly(string $path): bool
    {
        return in_array($path, ['.htaccess', 'api/.htaccess', 'api/update-guard.php', 'api/rescue.php', 'api/data/.htaccess', 'api/databases/.htaccess', 'api/src/.htaccess', 'api/lib/.htaccess', 'api/f/.htaccess', 'api/external/.htaccess', 'api/static/.htaccess', 'api/storage/updates/.htaccess', 'api/nomad-update.php', 'api/updater/install-defaults/nomad.schema.json'], true)
            || (self::relative($path) && str_starts_with($path, 'api/updater/'));
    }

    public static function target(string $root, string $relative): string
    {
        if (!self::relative($relative)) {
            throw new UpdateException('UNSAFE_PATH', 'Invalid relative path.');
        }
        $path = rtrim($root, '/');
        foreach (explode('/', $relative) as $part) {
            $path .= '/' . $part;
            if (is_link($path)) {
                throw new UpdateException('UNSAFE_PATH', 'Symlink paths are forbidden.');
            }
        }
        return $path;
    }

    /** Scan only explicit code roots; mutable paths never enter a code backup. */
    public static function inventory(string $root, bool $includeVendor = true): array
    {
        $files = [];
        $roots = ['version.json', 'sitemap.xsl', 'api/bootstrap.php', 'api/index.php', 'api/router.php', 'api/notification-integrations.php', 'api/composer.json', 'api/composer.lock', 'nomad', 'api/src', 'api/endpoints', 'api/vendor', 'api/integrations', 'api/lib', 'api/bin', 'api/analytics', 'api/external', 'api/f', 'api/scripts'];
        foreach ($roots as $relative) {
            if (!$includeVendor && $relative === 'api/vendor') {
                continue;
            }
            $path = self::target($root, $relative);
            if (is_file($path)) {
                $items = [$path];
            } elseif (is_dir($path)) {
                $items = new \RecursiveIteratorIterator(new \RecursiveDirectoryIterator($path, \FilesystemIterator::SKIP_DOTS));
            } else {
                continue;
            }
            foreach ($items as $item) {
                $full = (string) $item;
                $name = substr($full, strlen(rtrim($root, '/')) + 1);
                if (is_link($full)) {
                    throw new UpdateException('UNSAFE_PATH', 'Code contains a symlink: ' . $name);
                }
                if (!self::managed($name)) {
                    continue;
                }
                self::target($root, $name);
                $size = filesize($full);
                if ($size === false || $size > self::MAX_FILE || count($files) >= self::MAX_FILES) {
                    throw new UpdateException('PACKAGE_LIMIT', 'Code exceeds update limits.');
                }
                $files[$name] = ['size' => $size, 'sha256' => hash_file('sha256', $full)];
            }
        }
        ksort($files);
        if (array_sum(array_column($files, 'size')) > self::MAX_UNPACKED) {
            throw new UpdateException('PACKAGE_LIMIT', 'Code exceeds unpacked size limit.');
        }
        return $files;
    }

    /** Removal is confined to an owned operation directory, never a live tree. */
    public static function removeTree(string $path): void
    {
        if (is_link($path)) {
            unlink($path);
        } elseif (is_dir($path)) {
            foreach (new \FilesystemIterator($path, \FilesystemIterator::SKIP_DOTS) as $item) {
                self::removeTree($item->getPathname());
            }
            if (!rmdir($path)) {
                throw new UpdateException('CLEANUP_FAILED', 'Cannot remove temporary directory.', 500);
            }
        } elseif (is_file($path) && !unlink($path)) {
            throw new UpdateException('CLEANUP_FAILED', 'Cannot remove temporary file.', 500);
        }
    }
}

}

namespace NomadUpdate {
/**
 * NOMAD CMS — bounded HTTPS transport for signed software packages.
 * Resolves and pins public addresses on every redirect, scopes bearer credentials
 * to one origin, streams bytes to disk and checkpoints ranged downloads.
 */




final class Http
{
    /** The injectable transport exists for isolated tests, never HTTP input. */
    public function __construct(private readonly ?\Closure $transport = null)
    {
    }

    public static function publicIp(string $ip): bool
    {
        if (filter_var($ip, FILTER_VALIDATE_IP, FILTER_FLAG_NO_PRIV_RANGE | FILTER_FLAG_NO_RES_RANGE) === false) {
            return false;
        }
        if (str_contains($ip, ':')) {
            $packed = inet_pton($ip);
            // Only globally routed unicast IPv6; excludes mapped IPv4, NAT64,
            // local multicast and transition tunnels which can reach private IPv4.
            // Special-purpose/documentation prefixes follow the IANA registry:
            // https://www.iana.org/assignments/iana-ipv6-special-registry/
            return $packed !== false && (ord($packed[0]) & 0xe0) === 0x20
                && substr($packed, 0, 2) !== "\x20\x02"
                && !(substr($packed, 0, 2) === "\x20\x01" && (ord($packed[2]) & 0xfe) === 0)
                && substr($packed, 0, 4) !== "\x20\x01\x0d\xb8"
                && !(substr($packed, 0, 2) === "\x3f\xff" && (ord($packed[2]) & 0xf0) === 0);
        }
        return (int) explode('.', $ip)[0] < 224
            && !preg_match('~^(?:0\.|100\.(?:6[4-9]|[78][0-9]|9[0-9]|1[01][0-9]|12[0-7])\.|192\.0\.(?:0|2)\.|192\.88\.99\.|198\.(?:18|19)\.|198\.51\.100\.|203\.0\.113\.)~', $ip);
    }

    public static function origin(string $url): string
    {
        $parts = parse_url($url);
        if (!is_array($parts) || ($parts['scheme'] ?? '') !== 'https'
            || !isset($parts['host']) || isset($parts['user']) || isset($parts['pass'])
            || isset($parts['fragment']) || (isset($parts['port']) && $parts['port'] !== 443)
            || !preg_match('~^[a-zA-Z0-9.-]{1,253}$~', $parts['host'])
            || preg_match('~[\x00-\x20\x7f\\\\]~', $url)) {
            throw new UpdateException('INVALID_URL', 'A public HTTPS URL on port 443 is required.');
        }
        return 'https://' . strtolower($parts['host']);
    }

    private function resolve(string $url): array
    {
        self::origin($url);
        $host = (string) parse_url($url, PHP_URL_HOST);
        if (filter_var($host, FILTER_VALIDATE_IP)) {
            $addresses = [$host];
        } else {
            $records = dns_get_record($host, DNS_A | DNS_AAAA);
            $addresses = [];
            foreach ($records ?: [] as $record) {
                if (isset($record['ip']) || isset($record['ipv6'])) {
                    $addresses[] = $record['ip'] ?? $record['ipv6'];
                }
            }
        }
        if ($addresses === []) {
            throw new UpdateException('DNS_FAILED', 'Update source DNS resolution failed.', 502);
        }
        foreach ($addresses as $ip) {
            if (!self::publicIp($ip)) {
                throw new UpdateException('SSRF_BLOCKED', 'The update source resolves to a non-public address.');
            }
        }
        return [$host, $addresses[0]];
    }

    public function bytes(string $url, ?array $credential = null, array $headers = [], int $limit = 2097152): array
    {
        if ($this->transport !== null) {
            return ($this->transport)('bytes', $url, $credential, $headers, $limit);
        }
        $tmp = tmpfile();
        if ($tmp === false) {
            throw new UpdateException('WRITE_FAILED', 'Cannot create HTTP spool.', 500);
        }
        try {
            $result = $this->request($url, $tmp, 0, $limit, $credential, $headers, false);
            rewind($tmp);
            $result['body'] = stream_get_contents($tmp);
            return $result;
        } finally {
            fclose($tmp);
        }
    }

    public function download(string $url, string $path, int $expected, ?array $credential = null): bool
    {
        if ($expected < 1 || $expected > Files::MAX_ARCHIVE) {
            throw new UpdateException('PACKAGE_LIMIT', 'Invalid archive size.');
        }
        if ($this->transport !== null) {
            return ($this->transport)('download', $url, $path, $expected, $credential);
        }
        $offset = is_file($path) ? filesize($path) : 0;
        if ($offset === $expected) {
            return true;
        }
        if ($offset > $expected || is_link($path)) {
            throw new UpdateException('INVALID_DOWNLOAD', 'Invalid download checkpoint.');
        }
        Files::directory(dirname($path));
        $out = fopen($path, 'ab');
        if ($out === false) {
            throw new UpdateException('WRITE_FAILED', 'Cannot open download.', 500);
        }
        try {
            $this->request($url, $out, $offset, $expected, $credential, [], true);
        } finally {
            fclose($out);
        }
        clearstatcache(true, $path);
        return filesize($path) === $expected;
    }

    private function request(string $url, $out, int $offset, int $limit, ?array $credential, array $extra, bool $resumable): array
    {
        for ($redirect = 0; $redirect <= 5; $redirect++) {
            [$host, $ip] = $this->resolve($url);
            $headers = ['User-Agent: NomadCMS/1 (+https://github.com/vnorman1/nomad-cms-release)', 'Accept: application/vnd.github+json', 'X-GitHub-Api-Version: 2026-03-10'];
            foreach ($extra as $name => $value) {
                if (!in_array(strtolower($name), ['if-none-match', 'accept'], true) || preg_match('~[\r\n]~', (string) $value)) {
                    throw new UpdateException('INVALID_HEADER', 'Unsupported HTTP header.');
                }
                $headers[] = $name . ': ' . $value;
            }
            if ($credential !== null && self::origin($url) === $credential['origin']) {
                if (preg_match('~[\r\n]~', $credential['token'])) {
                    throw new UpdateException('INVALID_TOKEN', 'Invalid source credential.');
                }
                $headers[] = 'Authorization: Bearer ' . $credential['token'];
            }
            $response = [];
            $status = 0;
            $written = 0;
            $overflow = false;
            $writeFailed = false;
            $rangeInvalid = false;
            $start = microtime(true);
            $curl = curl_init($url);
            curl_setopt_array($curl, [
                CURLOPT_FOLLOWLOCATION => false,
                CURLOPT_PROTOCOLS => CURLPROTO_HTTPS,
                CURLOPT_PROXY => '',
                CURLOPT_CONNECTTIMEOUT_MS => 2500,
                CURLOPT_TIMEOUT_MS => 4500,
                CURLOPT_SSL_VERIFYPEER => true,
                CURLOPT_SSL_VERIFYHOST => 2,
                CURLOPT_HTTPHEADER => $headers,
                CURLOPT_RESOLVE => [$host . ':443:' . (str_contains($ip, ':') ? '[' . $ip . ']' : $ip)],
                CURLOPT_HEADERFUNCTION => static function ($curl, string $line) use (&$response, &$status): int {
                    if (preg_match('~^HTTP/\S+ (\d+)~', $line, $m)) {
                        $status = (int) $m[1];
                        $response = [];
                    } elseif (str_contains($line, ':')) {
                        [$name, $value] = explode(':', $line, 2);
                        $response[strtolower(trim($name))] = trim($value);
                    }
                    return strlen($line);
                },
                CURLOPT_WRITEFUNCTION => static function ($curl, string $bytes) use ($out, $offset, $limit, $resumable, &$response, &$status, &$written, &$overflow, &$writeFailed, &$rangeInvalid): int {
                    if ($status < 200 || $status >= 300) {
                        return strlen($bytes);
                    }
                    if ($resumable && ($offset > 0 || $status === 206)
                        && ($status !== 206 || !preg_match('~^bytes ' . $offset . '-\d+/' . $limit . '$~', $response['content-range'] ?? ''))) {
                        $rangeInvalid = true;
                        return 0;
                    }
                    if ($offset + $written + strlen($bytes) > $limit) {
                        $overflow = true;
                        return 0;
                    }
                    $length = fwrite($out, $bytes);
                    if ($length !== strlen($bytes)) {
                        $writeFailed = true;
                        return 0;
                    }
                    $written += $length;
                    return $length;
                },
            ]);
            if ($resumable) {
                curl_setopt($curl, CURLOPT_RANGE, $offset . '-' . min($limit - 1, $offset + 2097151));
            }
            $ok = curl_exec($curl);
            $errno = curl_errno($curl);
            curl_close($curl);
            fflush($out);
            if ($overflow || $writeFailed || $rangeInvalid) {
                throw new UpdateException($rangeInvalid ? 'RANGE_UNSUPPORTED' : 'DOWNLOAD_FAILED', $rangeInvalid ? 'Source does not support a safe ranged download.' : 'Download size or write validation failed.', 502);
            }
            if (in_array($status, [301, 302, 303, 307, 308], true)) {
                $location = $response['location'] ?? '';
                if (str_starts_with($location, '/') && !str_starts_with($location, '//')) {
                    $location = self::origin($url) . $location;
                }
                self::origin($location);
                $url = $location;
                continue;
            }
            if ($status === 403 || $status === 429) {
                $retry = max(60, min(86400, (int) ($response['retry-after'] ?? 60)));
                if (($response['x-ratelimit-remaining'] ?? null) === '0') {
                    $retry = max($retry, (int) ($response['x-ratelimit-reset'] ?? 0) - time());
                }
                throw new UpdateException('RATE_LIMIT:' . $retry, 'Update source temporarily refused the request.', 429);
            }
            if (!in_array($status, [200, 206, 304], true)) {
                throw new UpdateException('SOURCE_HTTP_' . $status, 'Update source returned HTTP ' . $status . '.', 502);
            }
            if ($ok === false && !($resumable && $written > 0 && $errno === CURLE_OPERATION_TIMEDOUT)) {
                throw new UpdateException('NETWORK_FAILED', 'Update source connection failed.', 502);
            }
            return ['status' => $status, 'headers' => $response, 'elapsed' => microtime(true) - $start];
        }
        throw new UpdateException('REDIRECT_LIMIT', 'Too many update source redirects.', 502);
    }
}

}

namespace NomadUpdate {
/**
 * NOMAD CMS — signed release and ZIP contract.
 * Authenticates exact manifest bytes before trusting package hashes. ZIP entries
 * are checked against an authenticated inventory before any live code is touched.
 */




final class Release
{
    public static function semver(mixed $value): bool
    {
        return is_string($value) && strlen($value) < 100
            && preg_match('~^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?$~D', $value) === 1;
    }

    public static function verify(string $bytes, string $signature, array $keys): array
    {
        if (strlen($bytes) > 2097152 || strlen($signature) > 16384) {
            throw new UpdateException('MANIFEST_LIMIT', 'Release manifest exceeds size limit.');
        }
        $envelope = json_decode($signature, true, 8, JSON_THROW_ON_ERROR);
        $id = $envelope['key_id'] ?? null;
        $raw = isset($envelope['signature']) && is_string($envelope['signature']) ? base64_decode($envelope['signature'], true) : false;
        if (!is_string($id) || !isset($keys[$id]) || $raw === false) {
            throw new UpdateException('UNTRUSTED_SIGNER', 'Release signer is not trusted for this source.');
        }
        $key = openssl_pkey_get_public($keys[$id]);
        $details = $key === false ? false : openssl_pkey_get_details($key);
        if ($details === false || $details['type'] !== OPENSSL_KEYTYPE_RSA || $details['bits'] < 4096
            || openssl_verify($bytes, $raw, $key, OPENSSL_ALGO_SHA256) !== 1) {
            throw new UpdateException('INVALID_SIGNATURE', 'Release signature verification failed.');
        }
        $release = json_decode($bytes, true, 32, JSON_THROW_ON_ERROR);
        self::validate($release);
        if (($release['key_id'] ?? null) !== $id) {
            throw new UpdateException('INVALID_SIGNATURE', 'Release signer identity mismatch.');
        }
        return $release;
    }

    public static function validate(mixed $release): void
    {
        if (!is_array($release) || ($release['format'] ?? null) !== 'nomad-release/v1'
            || ($release['product'] ?? null) !== 'nomad-cms'
            || !self::semver($release['version'] ?? null)
            || !self::semver($release['min_upgrade_version'] ?? null)
            || !self::semver($release['min_rollback_version'] ?? null)
            || !is_string($release['build_id'] ?? null) || strlen($release['build_id']) > 100
            || !is_int($release['storage_epoch'] ?? null)
            || !is_bool($release['manual_upgrade'] ?? null)
            || !is_string($release['min_php'] ?? null)
            || !is_int($release['updater_protocol'] ?? null)) {
            throw new UpdateException('INVALID_RELEASE', 'Invalid release contract.');
        }
        foreach (['sha256', 'manifest_sha256'] as $field) {
            if (!is_string($release['archive'][$field] ?? null) || !preg_match('~^[a-f0-9]{64}$~D', $release['archive'][$field])) {
                throw new UpdateException('INVALID_RELEASE', 'Missing package digest.');
            }
        }
        foreach (['size' => Files::MAX_ARCHIVE, 'unpacked_size' => Files::MAX_UNPACKED, 'file_count' => Files::MAX_FILES] as $field => $max) {
            if (!is_int($release['archive'][$field] ?? null) || $release['archive'][$field] < 1 || $release['archive'][$field] > $max) {
                throw new UpdateException('PACKAGE_LIMIT', 'Invalid package bounds.');
            }
        }
        if (!is_string($release['archive']['name'] ?? null) || !preg_match('~^[A-Za-z0-9._-]+\.zip$~D', $release['archive']['name'])) {
            throw new UpdateException('INVALID_RELEASE', 'Invalid package asset name.');
        }
        if (isset($release['migrations']) && (!is_array($release['migrations']) || count($release['migrations']) > 100)) {
            throw new UpdateException('INVALID_RELEASE', 'Invalid migration plan.');
        }
        foreach ($release['migrations'] ?? [] as $migration) {
            if (!is_array($migration) || !is_string($migration['id'] ?? null)
                || !preg_match('~^[a-zA-Z0-9._-]{1,100}$~D', $migration['id'])
                || !in_array($migration['database'] ?? '', ['auth', 'content', 'massive', 'schema'], true)
                || !is_string($migration['file'] ?? null) || !Files::managed($migration['file'])
                || !str_starts_with($migration['file'], 'api/integrations/update-migrations/')
                || ($migration['backward_compatible'] ?? false) !== true) {
                throw new UpdateException('INVALID_MIGRATION', 'Only explicit backward-compatible migrations are supported.');
            }
        }
    }

    public static function compatibility(array $release, array $current, array $storage = []): ?string
    {
        if ($release['updater_protocol'] !== 1) {
            return 'This release requires a bootstrap upgrade.';
        }
        if ($release['manual_upgrade']) {
            return 'This release requires a manual storage migration.';
        }
        if (version_compare(PHP_VERSION, $release['min_php'], '<')) {
            return 'PHP ' . $release['min_php'] . ' or newer is required.';
        }
        if (version_compare($current['version'], $release['min_upgrade_version'], '<')) {
            return 'Upgrade to ' . $release['min_upgrade_version'] . ' first.';
        }
        if ($release['storage_epoch'] !== ($storage['epoch'] ?? $current['storageEpoch'] ?? 1)) {
            return 'The release is incompatible with the current storage format.';
        }
        $floor = $storage['rollback_floor'] ?? $current['minRollbackVersion'] ?? '1.0.0';
        if (version_compare($release['version'], $floor, '<')) {
            return 'The current storage requires CMS ' . $floor . ' or newer.';
        }
        if (version_compare($current['version'], $release['min_rollback_version'], '<')) {
            return 'The release cannot safely restore the current code on failure.';
        }
        return null;
    }

    public static function inspectArchive(string $path, array $release, bool $local = false): array
    {
        if (!is_file($path) || filesize($path) !== $release['archive']['size']
            || !hash_equals($release['archive']['sha256'], hash_file('sha256', $path))) {
            throw new UpdateException('ARCHIVE_HASH', 'Package size or SHA-256 verification failed.');
        }
        $zip = new \ZipArchive();
        if ($zip->open($path, \ZipArchive::RDONLY | \ZipArchive::CHECKCONS) !== true) {
            throw new UpdateException('INVALID_ZIP', 'Invalid ZIP archive.');
        }
        try {
            $prefix = 'nomad-cms/';
            $stat = $zip->statName($prefix . 'package-manifest.json');
            if ($stat === false || $stat['size'] > 4194304) {
                throw new UpdateException('INVALID_ZIP', 'Package inventory is missing or oversized.');
            }
            $bytes = $zip->getFromName($prefix . 'package-manifest.json');
            if (!is_string($bytes) || !hash_equals($release['archive']['manifest_sha256'], hash('sha256', $bytes))) {
                throw new UpdateException('MANIFEST_HASH', 'Package inventory digest mismatch.');
            }
            $inventory = json_decode($bytes, true, 32, JSON_THROW_ON_ERROR);
            $files = $inventory['files'] ?? null;
            if (($inventory['format'] ?? '') !== 'nomad-package/v1' || !is_array($files) || count($files) > Files::MAX_FILES
                || count($files) !== $release['archive']['file_count']) {
                throw new UpdateException('INVALID_ZIP', 'Invalid package inventory.');
            }
            $total = 0;
            foreach ($files as $name => $file) {
                $kind = $file['kind'] ?? 'code';
                if (!is_string($name) || !is_array($file)
                    || ($kind === 'code' ? !Files::managed($name) : ($local || !Files::installOnly($name)))
                    || !in_array($kind, ['code', 'bootstrap'], true)
                    || !is_int($file['size'] ?? null) || $file['size'] < 0 || $file['size'] > Files::MAX_FILE
                    || !is_string($file['sha256'] ?? null) || !preg_match('~^[a-f0-9]{64}$~D', $file['sha256'])) {
                    throw new UpdateException('UNSAFE_PACKAGE', 'Package contains a forbidden file.');
                }
                $total += $file['size'];
            }
            if ($total !== $release['archive']['unpacked_size'] || $total > Files::MAX_UNPACKED) {
                throw new UpdateException('PACKAGE_LIMIT', 'Unpacked package size mismatch.');
            }
            $seen = [];
            $actual = [];
            if ($zip->numFiles > Files::MAX_FILES + 4000) {
                throw new UpdateException('PACKAGE_LIMIT', 'Too many ZIP entries.');
            }
            for ($i = 0; $i < $zip->numFiles; $i++) {
                $entry = $zip->statIndex($i);
                $name = $entry['name'];
                $canonical = strtolower(rtrim($name, '/'));
                if (isset($seen[$canonical]) || !Files::relative(rtrim($name, '/')) || !str_starts_with($name, $prefix)) {
                    throw new UpdateException('UNSAFE_ZIP', 'Duplicate or unsafe ZIP path.');
                }
                $seen[$canonical] = true;
                $zip->getExternalAttributesIndex($i, $opsys, $attributes);
                $type = ($attributes >> 16) & 0170000;
                if ($opsys === \ZipArchive::OPSYS_UNIX && !in_array($type, [0, 0100000, 0040000], true)) {
                    throw new UpdateException('UNSAFE_ZIP', 'ZIP links and special files are forbidden.');
                }
                if (str_ends_with($name, '/')) {
                    continue;
                }
                $relative = substr($name, strlen($prefix));
                if ($relative === 'package-manifest.json') {
                    continue;
                }
                if (!isset($files[$relative]) || $entry['size'] !== $files[$relative]['size'] || ($entry['encryption_method'] ?? 0) !== 0) {
                    throw new UpdateException('UNSAFE_ZIP', 'Unexpected, encrypted or incorrectly sized ZIP entry.');
                }
                $actual[$relative] = true;
            }
            if (count($actual) !== count($files)) {
                throw new UpdateException('INVALID_ZIP', 'ZIP inventory is incomplete.');
            }
            return $files;
        } finally {
            $zip->close();
        }
    }

    /** Each extraction writes one verified file; cursors are persisted by callers. */
    public static function extractOne(\ZipArchive $zip, string $root, string $name, array $file): void
    {
        $path = Files::target($root, $name);
        Files::directory(dirname($path));
        $input = $zip->getStream('nomad-cms/' . $name);
        $output = fopen($path . '.part', 'wb');
        if ($input === false || $output === false) {
            throw new UpdateException('EXTRACTION_FAILED', 'Cannot open package entry.', 500);
        }
        $hash = hash_init('sha256');
        $size = 0;
        try {
            while (!feof($input)) {
                $bytes = fread($input, 65536);
                if ($bytes === false || ($bytes === '' && !feof($input))) {
                    throw new UpdateException('EXTRACTION_FAILED', 'Cannot read ZIP entry.', 500);
                }
                $size += strlen($bytes);
                if ($size > $file['size'] || fwrite($output, $bytes) !== strlen($bytes)) {
                    throw new UpdateException('EXTRACTION_FAILED', 'Package size or write validation failed.', 500);
                }
                hash_update($hash, $bytes);
            }
        } finally {
            fclose($input);
            fclose($output);
        }
        if ($size !== $file['size'] || !hash_equals($file['sha256'], hash_final($hash))) {
            throw new UpdateException('ENTRY_HASH', 'Package entry checksum mismatch.');
        }
        if (str_ends_with($name, '.php')) {
            token_get_all((string) file_get_contents($path . '.part'), TOKEN_PARSE);
        }
        chmod($path . '.part', 0644);
        if (!rename($path . '.part', $path)) {
            throw new UpdateException('EXTRACTION_FAILED', 'Cannot finalize extracted entry.', 500);
        }
    }
}

}

namespace NomadUpdate {
/**
 * NOMAD CMS — durable update control store and source trust.
 * Customer databases are never used for worker state. Capabilities and rescue
 * secrets are hashed; origin-bound source credentials use native AES-GCM.
 */




final class Store
{
    public readonly string $path;

    public function __construct(public readonly string $root)
    {
        Files::directory(Files::target($root, 'api'), 0755);
        $this->path = Files::target($root, 'api/storage/updates');
        Files::directory($this->path);
        $deny = "Require all denied\nDeny from all\n";
        if (!is_file($this->path . '/.htaccess')) {
            Files::write($this->path . '/.htaccess', $deny, 0644);
        }
        Files::directory($this->path . '/operations');
        Files::directory($this->path . '/rollback');
    }

    public function current(): array
    {
        return Files::json($this->root . '/version.json', ['version' => '1.0.0', 'buildId' => 'legacy', 'storageEpoch' => 1, 'minRollbackVersion' => '1.0.0']);
    }

    public function settings(): array
    {
        $builtin = Files::json($this->root . '/api/updater/trusted-keys.json');
        return array_replace_recursive([
            'retention_bytes' => 20971520,
            'keys' => [],
            'sources' => ['official' => [
                'id' => 'official', 'name' => 'NOMAD CMS', 'kind' => 'github',
                'repo' => 'vnorman1/nomad-cms-release', 'key_ids' => array_keys($builtin),
            ]],
        ], Files::json($this->path . '/settings.json'));
    }

    public function publicSettings(): array
    {
        $settings = $this->settings();
        foreach ($settings['sources'] as &$source) {
            $source['has_token'] = isset($source['credential']);
            unset($source['credential']);
        }
        unset($source);
        $keys = Files::json($this->root . '/api/updater/trusted-keys.json');
        foreach ($settings['keys'] as $id => $key) {
            $keys[$id] = $key['pem'];
        }
        $builtins = Files::json($this->root . '/api/updater/trusted-keys.json');
        $keyNames = array_map(static fn($key) => $key['name'], $settings['keys']);
        $settings['keys'] = [];
        foreach ($keys as $id => $pem) {
            $settings['keys'][$id] = [
                'name' => isset($builtins[$id]) ? 'NOMAD CMS' : ($keyNames[$id] ?? $id),
                'fingerprint' => hash('sha256', $pem),
                'builtin' => isset($builtins[$id]),
            ];
        }
        $settings['rescue_configured'] = is_file($this->path . '/rescue.json');
        return $settings;
    }

    public function source(string $id): array
    {
        $source = $this->settings()['sources'][$id] ?? null;
        if (!is_array($source)) {
            throw new UpdateException('UNKNOWN_SOURCE', 'Unknown update source.');
        }
        return $source;
    }

    public function keys(array $source): array
    {
        $builtin = Files::json($this->root . '/api/updater/trusted-keys.json');
        $all = $builtin;
        foreach ($this->settings()['keys'] as $id => $key) {
            $all[$id] = $key['pem'];
        }
        return array_intersect_key($all, array_flip($source['key_ids']));
    }

    public function credential(array $source): ?array
    {
        if (!isset($source['credential'])) {
            return null;
        }
        $item = $source['credential'];
        $plain = openssl_decrypt(base64_decode($item['value'], true), 'aes-256-gcm', $this->encryptionKey(), OPENSSL_RAW_DATA, base64_decode($item['iv'], true), base64_decode($item['tag'], true), $item['origin']);
        if ($plain === false) {
            throw new UpdateException('CREDENTIAL_FAILED', 'Cannot decrypt source credential.', 500);
        }
        return ['origin' => $item['origin'], 'token' => $plain];
    }

    private function encryptionKey(): string
    {
        $path = Files::target($this->root, 'api/keys/update-encryption.key');
        if (!is_file($path)) {
            Files::write($path, random_bytes(32));
        }
        $key = file_get_contents($path);
        if ($key === false || strlen($key) !== 32) {
            throw new UpdateException('CREDENTIAL_FAILED', 'Update encryption key is unavailable.', 500);
        }
        return $key;
    }

    public function configure(array $input): array
    {
        return $this->locked(function () use ($input): array {
            if ($this->active() !== null) {
                throw new UpdateException('UPDATE_BUSY', 'Finish or cancel the active operation before changing trust.', 409);
            }
            $settings = $this->settings();
            $action = $input['action'] ?? '';
            if ($action === 'retention') {
                $bytes = $input['bytes'] ?? null;
                if (!is_int($bytes) || $bytes < 20971520 || $bytes > 1073741824) {
                    throw new UpdateException('INVALID_SETTINGS', 'Retention must be between 20 MiB and 1 GiB.');
                }
                $settings['retention_bytes'] = $bytes;
            } elseif ($action === 'add_key') {
                $pem = $input['pem'] ?? null;
                $name = $input['name'] ?? null;
                if (!is_string($pem) || strlen($pem) > 16384 || !is_string($name) || $name === '' || strlen($name) > 100) {
                    throw new UpdateException('INVALID_KEY', 'A name and RSA-4096 public key are required.');
                }
                $key = openssl_pkey_get_public($pem);
                $details = $key === false ? false : openssl_pkey_get_details($key);
                if ($details === false || $details['type'] !== OPENSSL_KEYTYPE_RSA || $details['bits'] < 4096) {
                    throw new UpdateException('INVALID_KEY', 'An RSA public key of at least 4096 bits is required.');
                }
                $pem = $details['key'];
                $id = hash('sha256', $pem);
                $settings['keys'][$id] = ['name' => $name, 'pem' => $pem];
            } elseif ($action === 'remove_key') {
                $id = $input['id'] ?? '';
                if (!is_string($id)) {
                    throw new UpdateException('INVALID_KEY', 'Invalid key identifier.');
                }
                if (isset(Files::json($this->root . '/api/updater/trusted-keys.json')[$id])) {
                    throw new UpdateException('PROTECTED_KEY', 'Built-in publisher keys require a bootstrap upgrade.');
                }
                unset($settings['keys'][$id]);
                foreach ($settings['sources'] as &$source) {
                    if ($source['id'] !== 'official') {
                        $source['key_ids'] = array_values(array_diff($source['key_ids'], [$id]));
                    }
                }
                unset($source);
            } elseif ($action === 'source') {
                $id = $input['id'] ?? '';
                if (!is_string($id) || !preg_match('~^[a-z0-9_-]{1,50}$~D', $id) || $id === 'official') {
                    throw new UpdateException('INVALID_SOURCE', 'Use a unique custom source identifier.');
                }
                $url = $input['manifest_url'] ?? null;
                $keyIds = $input['key_ids'] ?? null;
                if (!is_string($url) || !is_array($keyIds) || $keyIds === [] || count($keyIds) > 20) {
                    throw new UpdateException('INVALID_SOURCE', 'A manifest URL and trusted keys are required.');
                }
                Http::origin($url);
                $known = array_merge(array_keys($settings['keys']), array_keys(Files::json($this->root . '/api/updater/trusted-keys.json')));
                foreach ($keyIds as $keyId) {
                    if (!is_string($keyId) || !in_array($keyId, $known, true)) {
                        throw new UpdateException('INVALID_KEY', 'Unknown source signing key.');
                    }
                }
                $source = ['id' => $id, 'kind' => 'manifest', 'name' => $id, 'manifest_url' => $url, 'key_ids' => array_values(array_unique($keyIds))];
                if (isset($input['zip_url']) && $input['zip_url'] !== '') {
                    if (!is_string($input['zip_url'])) {
                        throw new UpdateException('INVALID_URL', 'Invalid ZIP URL.');
                    }
                    Http::origin($input['zip_url']);
                    $source['zip_url'] = $input['zip_url'];
                }
                if (isset($input['token']) && $input['token'] !== '') {
                    if (!is_string($input['token']) || strlen($input['token']) > 4096 || preg_match('~[\r\n]~', $input['token'])) {
                        throw new UpdateException('INVALID_TOKEN', 'Invalid source bearer token.');
                    }
                    if (isset($input['token_origin']) && !is_string($input['token_origin'])) {
                        throw new UpdateException('INVALID_URL', 'Invalid token origin.');
                    }
                    $origin = Http::origin($input['token_origin'] ?? $url);
                    $iv = random_bytes(12);
                    $value = openssl_encrypt($input['token'], 'aes-256-gcm', $this->encryptionKey(), OPENSSL_RAW_DATA, $iv, $tag, $origin);
                    $source['credential'] = ['origin' => $origin, 'iv' => base64_encode($iv), 'tag' => base64_encode($tag), 'value' => base64_encode($value)];
                }
                $settings['sources'][$id] = $source;
            } elseif ($action === 'remove_source') {
                $id = $input['id'] ?? '';
                if (!is_string($id) || $id === 'official') {
                    throw new UpdateException('INVALID_SOURCE', 'The official source cannot be removed.');
                }
                unset($settings['sources'][$id]);
            } else {
                throw new UpdateException('INVALID_SETTINGS', 'Unknown settings action.');
            }
            Files::writeJson($this->path . '/settings.json', $settings);
            return $this->publicSettings();
        });
    }

    public function active(): ?array
    {
        $pointer = Files::json($this->path . '/active.json');
        $operation = isset($pointer['id']) ? $this->operation($pointer['id']) : null;
        return $operation !== null && !in_array($operation['stage'], ['completed', 'rolled_back', 'failed', 'cancelled'], true)
            ? $operation : null;
    }

    public function operation(string $id): array
    {
        if (!preg_match('~^[a-f0-9]{32}$~D', $id)) {
            throw new UpdateException('INVALID_OPERATION', 'Invalid operation identifier.');
        }
        $data = Files::json($this->path . '/operations/' . $id . '/state.json');
        if ($data === []) {
            throw new UpdateException('UNKNOWN_OPERATION', 'Update operation not found.', 404);
        }
        return $data;
    }

    public function save(array $operation): void
    {
        $operation['updated_at'] = time();
        Files::writeJson($this->path . '/operations/' . $operation['id'] . '/state.json', $operation);
    }

    public function event(array &$operation, string $message): void
    {
        $operation['events'][] = ['id' => count($operation['events']) + 1, 'time' => time(), 'stage' => $operation['stage'], 'message' => $message];
        $operation['events'] = array_slice($operation['events'], -100);
        $this->save($operation);
    }

    public function locked(\Closure $callback): mixed
    {
        $lock = fopen($this->path . '/worker.lock', 'c');
        if ($lock === false || !flock($lock, LOCK_EX | LOCK_NB)) {
            if (is_resource($lock)) {
                fclose($lock);
            }
            throw new UpdateException('UPDATE_BUSY', 'Another update worker is running.', 409);
        }
        try {
            return $callback();
        } finally {
            flock($lock, LOCK_UN);
            fclose($lock);
        }
    }

    public static function publicOperation(?array $operation): ?array
    {
        if ($operation === null) {
            return null;
        }
        return array_intersect_key($operation, array_flip(['id', 'stage', 'kind', 'version', 'cursor', 'total', 'events', 'error', 'updated_at', 'required_free_bytes', 'downloaded_bytes', 'archive_size', 'probe_action']));
    }

    public function rotateRescue(): string
    {
        $token = bin2hex(random_bytes(32));
        Files::writeJson($this->path . '/rescue.json', ['hash' => hash('sha256', $token), 'created_at' => time()]);
        return $token;
    }

    public function verifyRescue(string $token): bool
    {
        return $this->locked(function () use ($token): bool {
            $ratePath = $this->path . '/rescue-rate.json';
            $rate = Files::json($ratePath, ['start' => time(), 'failures' => 0]);
            if (time() - $rate['start'] > 300) {
                $rate = ['start' => time(), 'failures' => 0];
            }
            if ($rate['failures'] >= 5) {
                throw new UpdateException('RESCUE_RATE_LIMIT', 'Wait five minutes before retrying recovery.', 429);
            }
            $hash = Files::json($this->path . '/rescue.json')['hash'] ?? '';
            $valid = strlen($token) === 64 && $hash !== '' && hash_equals($hash, hash('sha256', $token));
            $rate['failures'] += $valid ? 0 : 1;
            Files::writeJson($ratePath, $rate);
            return $valid;
        });
    }
}

}

namespace NomadUpdate {
/**
 * NOMAD CMS — source for the generated single-file web installer.
 * The release builder embeds this and the native verification/HTTP primitives.
 * A locally configured ownership secret protects every step and is carried to
 * the CMS administrator wizard; no application code is needed before deployment.
 */




final class Installer
{
    public static function dispatch(string $root, array $builtinKeys, string $script, ?Http $transport = null): never
    {
        try {
            $secret = defined('NOMAD_SETUP_TOKEN') ? NOMAD_SETUP_TOKEN : '';
            if (!is_string($secret) || strlen($secret) < 32) {
                self::page('Set NOMAD_SETUP_TOKEN to a unique secret of at least 32 characters before uploading this file.');
            }
            if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'GET') {
                self::page();
            }
            if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST' || ($_SERVER['HTTP_X_NOMAD_UPDATE'] ?? '') !== '1') {
                throw new UpdateException('METHOD_NOT_ALLOWED', 'Use a same-origin JSON POST.', 405);
            }
            $raw = file_get_contents('php://input', false, null, 0, 65537);
            if ($raw === false || strlen($raw) > 65536) {
                throw new UpdateException('INVALID_INPUT', 'Installer request is too large.');
            }
            $input = json_decode($raw, true, 32, JSON_THROW_ON_ERROR);
            if (!is_array($input)) {
                throw new UpdateException('INVALID_INPUT', 'Installer JSON object required.');
            }
            $private = $root . '/api/storage/updates';
            $statePath = $private . '/setup.json';
            if (is_file($private . '/setup-complete.json') || is_file($root . '/api/nomad-install.lock')) {
                throw new UpdateException('SETUP_DISABLED', 'This installer has already completed.', 403);
            }
            if (($input['action'] ?? '') === 'login') {
                if (!is_string($input['secret'] ?? null) || !hash_equals($secret, $input['secret'])) {
                    throw new UpdateException('SETUP_FORBIDDEN', 'Invalid installation secret.', 403);
                }
                self::preflight($root);
                $state = Files::json($statePath);
                if ($state === []) {
                    foreach (scandir($root) ?: [] as $entry) {
                        if (!in_array($entry, ['.', '..', basename($script)], true)) {
                            throw new UpdateException('NONEMPTY_TARGET', 'Use an empty installation directory.');
                        }
                    }
                    // Protect private state before creating it. The complete,
                    // authenticated web configuration is installed last.
                    Files::write($root . '/.htaccess', "RewriteEngine On\nRewriteRule ^(?:api|nomad)(?:/|$) - [F,L,NC]\n", 0644);
                    $store = new Store($root);
                    $keys = $builtinKeys;
                    if (isset($input['public_key']) && $input['public_key'] !== '') {
                        $key = is_string($input['public_key']) ? openssl_pkey_get_public($input['public_key']) : false;
                        $details = $key === false ? false : openssl_pkey_get_details($key);
                        if ($details === false || $details['type'] !== OPENSSL_KEYTYPE_RSA || $details['bits'] < 4096) {
                            throw new UpdateException('INVALID_KEY', 'Supply an RSA-4096 public key.');
                        }
                        $keys[hash('sha256', $details['key'])] = $details['key'];
                    }
                    $manifest = $input['manifest_url'] ?? '';
                    if (!is_string($manifest)) {
                        throw new UpdateException('INVALID_URL', 'Invalid manifest URL.');
                    }
                    if ($manifest !== '') {
                        Http::origin($manifest);
                    }
                    $zip = $input['zip_url'] ?? '';
                    if (!is_string($zip)) {
                        throw new UpdateException('INVALID_URL', 'Invalid ZIP URL.');
                    }
                    if ($zip !== '') {
                        Http::origin($zip);
                    }
                    $state = ['owner_hash' => hash('sha256', $secret), 'stage' => 'protection', 'cursor' => 0,
                        'keys' => $keys, 'manifest_url' => $manifest, 'zip_url' => $zip,
                        'nonce' => bin2hex(random_bytes(16))];
                    Files::write($private . '/probe-' . $state['nonce'] . '.txt', $state['nonce'], 0644);
                } elseif (!hash_equals($state['owner_hash'], hash('sha256', $secret))) {
                    throw new UpdateException('SETUP_FORBIDDEN', 'This interrupted setup belongs to another installer secret.', 403);
                }
                $claim = bin2hex(random_bytes(32));
                Files::writeJson($private . '/setup-claim.json', ['hash' => hash('sha256', $claim), 'expires' => time() + 86400]);
                setcookie('nomad_setup_claim', $claim, ['expires' => time() + 86400, 'path' => '/', 'secure' => true, 'httponly' => true, 'samesite' => 'Strict']);
                Files::writeJson($statePath, $state);
                self::reply($state);
            }
            $claim = Files::json($private . '/setup-claim.json');
            $cookie = $_COOKIE['nomad_setup_claim'] ?? '';
            if (!is_string($cookie) || ($claim['expires'] ?? 0) < time() || !hash_equals($claim['hash'] ?? '', hash('sha256', $cookie))) {
                throw new UpdateException('SETUP_FORBIDDEN', 'Sign in with the installation secret.', 403);
            }
            $store = new Store($root);
            $store->locked(function () use ($root, $private, $statePath, $input, $script, $transport): void {
                $state = Files::json($statePath);
                $http = $transport ?? new Http();
                $work = $private . '/setup-work';
                Files::directory($work);
                switch ($state['stage']) {
                    case 'protection':
                        if (($input['nonce'] ?? null) !== $state['nonce'] || !in_array($input['status'] ?? null, [403, 404], true)) {
                            throw new UpdateException('PROTECTION_FAILED', 'Private storage protection could not be verified.');
                        }
                        @unlink($private . '/probe-' . $state['nonce'] . '.txt');
                        $state['stage'] = $state['manifest_url'] === '' ? 'catalog' : 'manifest';
                        $state['signature_url'] = $state['manifest_url'] . '.sig';
                        break;
                    case 'catalog':
                        $response = $http->bytes('https://api.github.com/repos/vnorman1/nomad-cms-release/releases/latest');
                        $release = json_decode($response['body'], true, 32, JSON_THROW_ON_ERROR);
                        $assets = [];
                        foreach ($release['assets'] ?? [] as $asset) {
                            $assets[$asset['name']] = $asset['browser_download_url'];
                        }
                        if (!isset($assets['release.json'], $assets['release.json.sig'], $assets['nomad-cms.zip'])) {
                            throw new UpdateException('MISSING_ASSET', 'No signed installation release is available.');
                        }
                        $state['manifest_url'] = $assets['release.json'];
                        $state['signature_url'] = $assets['release.json.sig'];
                        $state['zip_url'] = $assets['nomad-cms.zip'];
                        $state['stage'] = 'manifest';
                        break;
                    case 'manifest':
                        $response = $http->bytes($state['manifest_url']);
                        Files::write($work . '/release.json', $response['body']);
                        $state['stage'] = 'signature';
                        break;
                    case 'signature':
                        $response = $http->bytes($state['signature_url'], null, [], 16384);
                        $state['release'] = Release::verify((string) file_get_contents($work . '/release.json'), $response['body'], $state['keys']);
                        if ($state['release']['updater_protocol'] !== 1 || $state['release']['manual_upgrade']
                            || version_compare(PHP_VERSION, $state['release']['min_php'], '<')) {
                            throw new UpdateException('INCOMPATIBLE_RELEASE', 'This release is not supported by this installer.');
                        }
                        if ($state['zip_url'] === '') {
                            $url = parse_url($state['manifest_url']);
                            $path = $url['path'] ?? '/release.json';
                            $state['zip_url'] = Http::origin($state['manifest_url']) . substr($path, 0, strrpos($path, '/') + 1) . $state['release']['archive']['name'];
                        }
                        $required = $state['release']['archive']['size'] + 2 * $state['release']['archive']['unpacked_size'] + 16777216;
                        if (disk_free_space($root) < $required) {
                            throw new UpdateException('DISK_SPACE', 'Insufficient free space for installation.');
                        }
                        $state['stage'] = 'download';
                        break;
                    case 'download':
                        if ($http->download($state['zip_url'], $work . '/incoming.zip', $state['release']['archive']['size'])) {
                            $state['stage'] = 'verify';
                        }
                        break;
                    case 'verify':
                        $state['files'] = Release::inspectArchive($work . '/incoming.zip', $state['release']);
                        $state['stage'] = 'extract';
                        break;
                    case 'extract':
                        $zip = new \ZipArchive();
                        if ($zip->open($work . '/incoming.zip', \ZipArchive::RDONLY) !== true) {
                            throw new UpdateException('INVALID_ZIP', 'Cannot reopen installation archive.');
                        }
                        $names = array_keys($state['files']);
                        $until = microtime(true) + 3.5;
                        try {
                            while ($state['cursor'] < count($names) && microtime(true) < $until) {
                                $name = $names[$state['cursor']];
                                Release::extractOne($zip, $work . '/stage', $name, $state['files'][$name]);
                                $state['cursor']++;
                            }
                        } finally {
                            $zip->close();
                        }
                        if ($state['cursor'] === count($names)) {
                            $state['stage'] = 'deploy';
                            $state['cursor'] = 0;
                        }
                        break;
                    case 'deploy':
                        $names = array_keys($state['files']);
                        // The root gate stays closed until the entire code tree
                        // exists; authenticated configuration is deployed last.
                        $names = array_values(array_filter($names, static fn($name) => $name !== '.htaccess'));
                        $until = microtime(true) + 3.5;
                        while ($state['cursor'] < count($names) && microtime(true) < $until) {
                            $name = $names[$state['cursor']];
                            $source = Files::target($work . '/stage', $name);
                            $target = Files::target($root, $name);
                            Files::directory(dirname($target), 0755);
                            if (!copy($source, $target . '.setup-part') || !rename($target . '.setup-part', $target)) {
                                throw new UpdateException('WRITE_FAILED', 'Cannot deploy installation file.');
                            }
                            chmod($target, 0644);
                            $state['cursor']++;
                            Files::writeJson($statePath, $state);
                        }
                        if ($state['cursor'] === count($names)) {
                            $state['stage'] = 'complete';
                        }
                        break;
                    case 'complete':
                        $version = Files::json($root . '/version.json');
                        if (($version['version'] ?? null) !== $state['release']['version'] || ($version['buildId'] ?? null) !== $state['release']['build_id']) {
                            throw new UpdateException('VERSION_MISMATCH', 'Installed version does not match the authenticated release.');
                        }
                        $baseline = $root . '/api/data/nomad.schema.json';
                        if (!is_file($baseline)) {
                            Files::directory(dirname($baseline));
                            if (!copy($root . '/api/updater/install-defaults/nomad.schema.json', $baseline)) {
                                throw new UpdateException('WRITE_FAILED', 'Cannot seed schema defaults.');
                            }
                        }
                        if (!is_file($work . '/stage/.htaccess') || !copy($work . '/stage/.htaccess', $root . '/.htaccess')) {
                            throw new UpdateException('WRITE_FAILED', 'Cannot activate protected web configuration.');
                        }
                        Files::writeJson($private . '/setup-complete.json', ['version' => $version['version'], 'completed_at' => time()]);
                        Files::removeTree($work);
                        @unlink($script);
                        $state['stage'] = 'done';
                        break;
                    default:
                        throw new UpdateException('INVALID_SETUP_STATE', 'Unknown installation stage.');
                }
                Files::writeJson($statePath, $state);
                self::reply($state);
            });
        } catch (\Throwable $error) {
            self::reply(['stage' => 'error', 'error' => $error->getMessage()], $error instanceof UpdateException ? max(400, $error->getCode()) : 500);
        }
        exit;
    }

    private static function preflight(string $root): void
    {
        if (version_compare(PHP_VERSION, '8.2.0', '<') || !is_writable($root)) {
            throw new UpdateException('PREFLIGHT_FAILED', 'PHP 8.2+ and a writable directory are required.');
        }
        if (empty($_SERVER['HTTPS']) || $_SERVER['HTTPS'] === 'off') {
            throw new UpdateException('HTTPS_REQUIRED', 'Open the installer over HTTPS.');
        }
        foreach (['pdo_sqlite', 'curl', 'zip', 'openssl', 'tokenizer'] as $extension) {
            if (!extension_loaded($extension)) {
                throw new UpdateException('MISSING_EXTENSION', 'Required PHP extension: ' . $extension);
            }
        }
    }

    private static function reply(array $state, int $status = 200): never
    {
        http_response_code($status);
        header('Content-Type: application/json; charset=utf-8');
        header('Cache-Control: no-store');
        $public = array_intersect_key($state, array_flip(['stage', 'cursor', 'error', 'nonce']));
        if ($state['stage'] === 'protection') {
            $public['url'] = '/api/storage/updates/probe-' . $state['nonce'] . '.txt';
        }
        echo json_encode(['success' => $status === 200] + $public, JSON_THROW_ON_ERROR);
        exit;
    }

    private static function page(string $message = ''): never
    {
        header('Content-Type: text/html; charset=utf-8');
        header('Cache-Control: no-store');
        header("Content-Security-Policy: default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'");
        echo '<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>NOMAD CMS Setup</title><style>body{font:16px system-ui;max-width:680px;margin:8vh auto;padding:24px;background:#101114;color:#eee}input,textarea,button{font:inherit;box-sizing:border-box;padding:10px;margin:8px 0;width:100%}pre{white-space:pre-wrap}</style><h1>NOMAD CMS Setup</h1><p>' . htmlspecialchars($message, ENT_QUOTES, 'UTF-8') . '</p>';
        if ($message !== '') {
            exit;
        }
        echo <<<'HTML'
<form id="setup"><label>Installation secret / Telepítési titok<input id="secret" type="password" required autocomplete="off"></label>
<details><summary>Custom source / Egyéni forrás</summary><input id="manifest" type="url" placeholder="https://mirror.example/release.json"><input id="zip" type="url" placeholder="Optional ZIP URL"><textarea id="key" placeholder="Optional trusted publisher RSA-4096 public key"></textarea></details>
<button id="submit">Install / Telepítés</button></form><pre id="state"></pre>
<script>
const form=document.getElementById('setup'),state=document.getElementById('state');let busy=false;
async function post(body){const response=await fetch(location.pathname,{method:'POST',headers:{'Content-Type':'application/json','X-Nomad-Update':'1'},body:JSON.stringify(body)});const data=await response.json();if(!data.success)throw Error(data.error);return data;}
form.onsubmit=async event=>{event.preventDefault();if(busy)return;busy=true;document.getElementById('submit').disabled=true;try{let data=await post({action:'login',secret:document.getElementById('secret').value,manifest_url:document.getElementById('manifest').value,zip_url:document.getElementById('zip').value,public_key:document.getElementById('key').value});document.getElementById('secret').value='';while(data.stage!=='done'){state.textContent=data.stage+' '+(data.cursor||'');if(data.stage==='protection'){const check=await fetch(data.url,{cache:'no-store'});data=await post({action:'step',nonce:data.nonce,status:check.status});}else{data=await post({action:'step'});}await new Promise(r=>setTimeout(r,250));}location.href='/nomad/install';}catch(error){state.textContent=error.message;}finally{busy=false;document.getElementById('submit').disabled=false;}};
</script></html>
HTML;
        exit;
    }
}

}

namespace {
// Change this locally before uploading. Use a unique secret of at least 32 characters.
const NOMAD_SETUP_TOKEN = '';
\NomadUpdate\Installer::dispatch(__DIR__, array (
  'ad39b70f35d2dec0e50e86fbbd96bdda06cc1a637c173bab3385d714589ab948' => '-----BEGIN PUBLIC KEY-----
MIICIjANBgkqhkiG9w0BAQEFAAOCAg8AMIICCgKCAgEAn0y7JWyZKH0gweGrzPVZ
T6+wTey45Z5CL3gT6d69I8QZwwLtu9JnPi0z+JwFFFp8UgeB2aNWSXYoWu6yKYaJ
nkSb1ZziTm6pZe0RqEGlP6yCe9+bYOxQWd6ic3cdicP/DTFJYW3/rN/EQLbGCtL4
hpk5DHjc2WACQ358KpBhiARzkn6yWndAi70ss6MkCV7oBRHgDsu9+nRZoz2Bsahw
mdtCIdBxxiKcKvOG2K9gIBYDI3hElhIzQfSxcZzIsEaQyxb5iVTC1dR+5dNGMzcl
WUV924mSU9MGf0JyHa+Uy9tLjjW/yQwYMcz0b0nDYGSjYizwuZufG5oeaeFObRIZ
gMLkBV8lbruiH+bJk6HtWAguuhD6LmD5WUv5Ex6Fh5rCQyk8uG8AQXVADv72vOf+
7+OqaNbYYz9O8R1WqjMhKk1GHm3gIbN0d21djrN1N7+WA64BnmfpxtPkmJFL7cor
AzTmJulIe1SaIkMSaY1RwOi5+4AZkJrgDcp1vO1JuaMenUAAiNEerYDT56ptIE/V
+hd9JmriYyXeX739BcYb9LM/9A6BMAyR3t9fwMYC9dEj5H1R/+WgMvqedG9+FiDj
OE81qr1kNNz2vtGgheLvnMvGq5HNJAr4MB5He9/lao1OKQ7aU8N/NxSP3JY+fHx2
yKhBnuy5+w8t/DZkaRUEKDsCAwEAAQ==
-----END PUBLIC KEY-----
',
), __FILE__);
}
