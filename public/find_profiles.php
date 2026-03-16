<?php

declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
header('Pragma: no-cache');
header('Access-Control-Allow-Origin: *');

$method = strtoupper((string) ($_SERVER['REQUEST_METHOD'] ?? 'GET'));
$query = trim((string) ($_GET['q'] ?? ''));
$config = build_phonebook_config();

if ($method === 'OPTIONS') {
    header('Access-Control-Allow-Methods: GET, HEAD, OPTIONS');
    header('Access-Control-Allow-Headers: Content-Type');
    http_response_code(204);
    exit;
}

if ($method !== 'GET' && $method !== 'HEAD') {
    emit_json_payload([
        'query' => '',
        'results' => [],
        'count' => 0,
        'warning' => 'Method not allowed',
    ], $method, 200, [
        'X-Fundstr-Phonebook-Status' => 'invalid-method',
    ]);
    exit;
}

if ($query === '') {
    emit_json_payload([
        'query' => '',
        'results' => [],
        'count' => 0,
    ], $method, 200, [
        'X-Fundstr-Phonebook-Status' => 'empty-query',
    ]);
    exit;
}

if ($method === 'HEAD') {
    emit_json_payload(null, 'HEAD', 200, [
        'X-Fundstr-Phonebook-Status' => 'probe',
    ]);
    exit;
}

$cached = load_cached_query($query, $config);
if ($cached !== null) {
    emit_json_payload($cached['payload'], $method, 200, [
        'X-Fundstr-Phonebook-Source' => (string) ($cached['source'] ?? 'cache'),
        'X-Fundstr-Phonebook-Status' => (string) ($cached['status'] ?? 'ok'),
    ]);
    exit;
}

$databasePayload = fetch_database_payload($query, $config);
if ($databasePayload !== null) {
    cache_query_payload($query, $databasePayload, $config['cache_ttl_db'], $config['cache_dir']);
    emit_json_payload($databasePayload['payload'], $method, 200, [
        'X-Fundstr-Phonebook-Source' => (string) $databasePayload['source'],
        'X-Fundstr-Phonebook-Status' => 'ok',
    ]);
    exit;
}

$upstreamPayload = fetch_upstream_payload($query, $config);
if ($upstreamPayload !== null) {
    cache_query_payload($query, $upstreamPayload, $config['cache_ttl_upstream'], $config['cache_dir']);
    emit_json_payload($upstreamPayload['payload'], $method, 200, [
        'X-Fundstr-Phonebook-Source' => (string) $upstreamPayload['source'],
        'X-Fundstr-Phonebook-Status' => 'ok',
    ]);
    exit;
}

$degradedPayload = [
    'payload' => [
        'query' => $query,
        'results' => [],
        'count' => 0,
        'warning' => 'Limited results (discovery unavailable)',
    ],
    'source' => 'degraded',
    'status' => 'degraded',
];

cache_query_payload($query, $degradedPayload, $config['cache_ttl_degraded'], $config['cache_dir']);
emit_json_payload($degradedPayload['payload'], $method, 200, [
    'X-Fundstr-Phonebook-Source' => 'degraded',
    'X-Fundstr-Phonebook-Status' => 'degraded',
]);

function build_phonebook_config(): array
{
    $fileConfig = load_phonebook_file_config();

    $cacheDir = resolve_config_string($fileConfig, 'cache_dir', 'FUNDSTR_PHONEBOOK_CACHE_DIR', '');
    if ($cacheDir === '') {
        $cacheDir = rtrim(sys_get_temp_dir(), DIRECTORY_SEPARATOR) . DIRECTORY_SEPARATOR . 'fundstr-phonebook-cache';
    }

    $tables = resolve_config_list($fileConfig, 'db_tables', 'FUNDSTR_PHONEBOOK_DB_TABLES');
    if ($tables === []) {
        $tables = ['profiles', 'creators'];
    }

    return [
        'cache_dir' => $cacheDir,
        'cache_ttl_db' => resolve_config_int($fileConfig, 'cache_ttl_db', 'FUNDSTR_PHONEBOOK_CACHE_TTL_DB', 300, 30, 3600),
        'cache_ttl_upstream' => resolve_config_int($fileConfig, 'cache_ttl_upstream', 'FUNDSTR_PHONEBOOK_CACHE_TTL_UPSTREAM', 180, 10, 1800),
        'cache_ttl_degraded' => resolve_config_int($fileConfig, 'cache_ttl_degraded', 'FUNDSTR_PHONEBOOK_CACHE_TTL_DEGRADED', 45, 5, 300),
        'limit' => resolve_config_int($fileConfig, 'limit', 'FUNDSTR_PHONEBOOK_LIMIT', 25, 1, 50),
        'upstream_timeout' => resolve_config_int($fileConfig, 'upstream_timeout', 'FUNDSTR_PHONEBOOK_TIMEOUT', 4, 1, 15),
        'upstream_base' => resolve_config_string($fileConfig, 'upstream_base', 'FUNDSTR_PHONEBOOK_UPSTREAM', 'https://api.fundstr.me/discover/creators'),
        'db_dsn' => resolve_config_string($fileConfig, 'db_dsn', 'FUNDSTR_PHONEBOOK_DSN', ''),
        'db_host' => resolve_config_string($fileConfig, 'db_host', 'FUNDSTR_PHONEBOOK_DB_HOST', ''),
        'db_port' => resolve_config_string($fileConfig, 'db_port', 'FUNDSTR_PHONEBOOK_DB_PORT', '3306'),
        'db_name' => resolve_config_string($fileConfig, 'db_name', 'FUNDSTR_PHONEBOOK_DB_NAME', ''),
        'db_user' => resolve_config_string($fileConfig, 'db_user', 'FUNDSTR_PHONEBOOK_DB_USER', ''),
        'db_pass' => resolve_config_string($fileConfig, 'db_pass', 'FUNDSTR_PHONEBOOK_DB_PASS', ''),
        'db_tables' => $tables,
        'db_authoritative' => resolve_config_bool($fileConfig, 'db_authoritative', 'FUNDSTR_PHONEBOOK_DB_AUTHORITATIVE', false),
    ];
}

function load_phonebook_file_config(): array
{
    $candidates = [];

    $explicit = getenv('FUNDSTR_PHONEBOOK_CONFIG_FILE');
    if (is_string($explicit) && trim($explicit) !== '') {
        $candidates[] = trim($explicit);
    }

    $baseDir = dirname(__DIR__);
    $candidates[] = $baseDir . DIRECTORY_SEPARATOR . '.fundstr-phonebook.php';
    $candidates[] = $baseDir . DIRECTORY_SEPARATOR . 'config' . DIRECTORY_SEPARATOR . 'fundstr-phonebook.php';

    $home = getenv('HOME');
    if (is_string($home) && trim($home) !== '') {
        $candidates[] = rtrim($home, DIRECTORY_SEPARATOR) . DIRECTORY_SEPARATOR . '.config' . DIRECTORY_SEPARATOR . 'fundstr-phonebook.php';
    }

    foreach ($candidates as $candidate) {
        if (!is_string($candidate) || $candidate === '' || !is_file($candidate)) {
            continue;
        }

        $loaded = include $candidate;
        if (is_array($loaded)) {
            return $loaded;
        }
    }

    return [];
}

function load_cached_query(string $query, array $config): ?array
{
    $cacheFile = cache_file_path($query, $config['cache_dir']);
    if ($cacheFile === null || !is_file($cacheFile)) {
        return null;
    }

    $raw = @file_get_contents($cacheFile);
    if (!is_string($raw) || $raw === '') {
        return null;
    }

    $decoded = json_decode($raw, true);
    if (!is_array($decoded)) {
        return null;
    }

    $expiresAt = isset($decoded['expires_at']) ? (int) $decoded['expires_at'] : 0;
    if ($expiresAt < time()) {
        @unlink($cacheFile);
        return null;
    }

    $payload = isset($decoded['payload']) && is_array($decoded['payload']) ? $decoded['payload'] : null;
    if ($payload === null) {
        return null;
    }

    return [
        'payload' => $payload,
        'source' => isset($decoded['source']) ? (string) $decoded['source'] : 'cache',
        'status' => isset($decoded['status']) ? (string) $decoded['status'] : 'ok',
    ];
}

function cache_query_payload(string $query, array $entry, int $ttlSeconds, string $cacheDir): void
{
    if ($ttlSeconds < 1) {
        return;
    }

    $cacheFile = cache_file_path($query, $cacheDir);
    if ($cacheFile === null) {
        return;
    }

    $payload = isset($entry['payload']) && is_array($entry['payload']) ? $entry['payload'] : null;
    if ($payload === null) {
        return;
    }

    $dir = dirname($cacheFile);
    if (!is_dir($dir) && !@mkdir($dir, 0775, true) && !is_dir($dir)) {
        return;
    }

    $encoded = json_encode([
        'expires_at' => time() + $ttlSeconds,
        'source' => isset($entry['source']) ? (string) $entry['source'] : 'cache',
        'status' => isset($entry['status']) ? (string) $entry['status'] : 'ok',
        'payload' => $payload,
    ], JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);

    if (!is_string($encoded) || $encoded === '') {
        return;
    }

    $tmpFile = $cacheFile . '.tmp';
    if (@file_put_contents($tmpFile, $encoded, LOCK_EX) === false) {
        return;
    }

    @rename($tmpFile, $cacheFile);
}

function cache_file_path(string $query, string $cacheDir): ?string
{
    if ($cacheDir === '') {
        return null;
    }

    $prefix = strtolower(substr($query, 0, 1));
    if ($prefix === '' || !preg_match('/^[a-z0-9]$/', $prefix)) {
        $prefix = '_';
    }

    return rtrim($cacheDir, DIRECTORY_SEPARATOR)
        . DIRECTORY_SEPARATOR
        . $prefix
        . DIRECTORY_SEPARATOR
        . sha1(lowercase_string($query))
        . '.json';
}

function lowercase_string(string $value): string
{
    if (function_exists('mb_strtolower')) {
        return mb_strtolower($value, 'UTF-8');
    }

    return strtolower($value);
}

function fetch_database_payload(string $query, array $config): ?array
{
    $pdo = connect_phonebook_database($config);
    if (!$pdo instanceof PDO) {
        return null;
    }

    $results = [];
    $seen = [];
    foreach ($config['db_tables'] as $table) {
        $rows = query_phonebook_table($pdo, $table, $query, (int) $config['limit']);
        foreach ($rows as $row) {
            $pubkey = strtolower((string) ($row['pubkey'] ?? ''));
            if ($pubkey === '' || isset($seen[$pubkey])) {
                continue;
            }
            $seen[$pubkey] = true;
            $results[] = $row;
            if (count($results) >= (int) $config['limit']) {
                break 2;
            }
        }
    }

    if ($results === [] && !$config['db_authoritative']) {
        return null;
    }

    return [
        'payload' => [
            'query' => $query,
            'results' => $results,
            'count' => count($results),
        ],
        'source' => 'db',
        'status' => 'ok',
    ];
}

function connect_phonebook_database(array $config): ?PDO
{
    if (!class_exists('PDO')) {
        return null;
    }

    $dsn = (string) $config['db_dsn'];
    if ($dsn === '') {
        $host = (string) $config['db_host'];
        $name = (string) $config['db_name'];
        $user = (string) $config['db_user'];
        if ($host === '' || $name === '' || $user === '') {
            return null;
        }
        $drivers = PDO::getAvailableDrivers();
        if (!in_array('mysql', $drivers, true)) {
            return null;
        }
        $dsn = sprintf('mysql:host=%s;port=%s;dbname=%s;charset=utf8mb4', $host, (string) $config['db_port'], $name);
    }

    try {
        return new PDO($dsn, (string) $config['db_user'], (string) $config['db_pass'], [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_TIMEOUT => max(1, (int) $config['upstream_timeout']),
        ]);
    } catch (Throwable $error) {
        return null;
    }
}

function query_phonebook_table(PDO $pdo, string $table, string $query, int $limit): array
{
    if (!preg_match('/^[A-Za-z0-9_]+$/', $table)) {
        return [];
    }

    $columns = load_table_columns($pdo, $table);
    if ($columns === [] || !isset($columns['pubkey'])) {
        return [];
    }

    $searchColumns = array_values(array_filter([
        first_existing_column($columns, ['pubkey']),
        first_existing_column($columns, ['name', 'username']),
        first_existing_column($columns, ['display_name', 'displayName']),
        first_existing_column($columns, ['nip05']),
        first_existing_column($columns, ['lud16', 'lud06']),
        first_existing_column($columns, ['about', 'bio', 'description']),
    ]));

    if ($searchColumns === []) {
        return [];
    }

    $selectColumns = unique_columns(array_filter([
        'pubkey',
        first_existing_column($columns, ['name', 'username']),
        first_existing_column($columns, ['display_name', 'displayName']),
        first_existing_column($columns, ['about', 'bio', 'description']),
        first_existing_column($columns, ['picture', 'avatar', 'image']),
        first_existing_column($columns, ['nip05']),
        first_existing_column($columns, ['updated_at', 'created_at']),
    ]));

    $quotedColumns = [];
    foreach ($selectColumns as $column) {
        $quotedColumns[] = sprintf('`%s`', $column);
    }

    $like = '%' . lowercase_string($query) . '%';
    $clauses = [];
    $params = [];
    foreach ($searchColumns as $index => $column) {
        $param = ':like_' . $index;
        $clauses[] = sprintf('LOWER(COALESCE(`%s`, \'\')) LIKE %s', $column, $param);
        $params[$param] = $like;
    }

    $exactPubkey = preg_match('/^[0-9a-f]{64}$/i', $query) ? strtolower($query) : '';
    if ($exactPubkey !== '') {
        $clauses[] = '`pubkey` = :exact_pubkey';
        $params[':exact_pubkey'] = $exactPubkey;
    }

    $orderColumn = first_existing_column($columns, ['updated_at', 'created_at']);
    $orderBy = $orderColumn !== null ? sprintf(' ORDER BY `%s` DESC', $orderColumn) : '';

    $sql = sprintf(
        'SELECT %s FROM `%s` WHERE (%s)%s LIMIT %d',
        implode(', ', $quotedColumns),
        $table,
        implode(' OR ', $clauses),
        $orderBy,
        max(1, min($limit, 50))
    );

    try {
        $statement = $pdo->prepare($sql);
        foreach ($params as $param => $value) {
            $statement->bindValue($param, $value, PDO::PARAM_STR);
        }
        $statement->execute();
        $rows = $statement->fetchAll();
    } catch (Throwable $error) {
        return [];
    }

    $results = [];
    foreach ($rows as $row) {
        if (!is_array($row)) {
            continue;
        }

        $pubkey = normalize_pubkey($row['pubkey'] ?? null);
        if ($pubkey === null) {
            continue;
        }

        $results[] = [
            'pubkey' => $pubkey,
            'name' => normalize_string_from_candidates($row, ['name', 'username']),
            'display_name' => normalize_string_from_candidates($row, ['display_name', 'displayName']),
            'about' => normalize_string_from_candidates($row, ['about', 'bio', 'description']),
            'picture' => normalize_string_from_candidates($row, ['picture', 'avatar', 'image']),
            'nip05' => normalize_string_from_candidates($row, ['nip05']),
        ];
    }

    return $results;
}

function load_table_columns(PDO $pdo, string $table): array
{
    $driver = (string) $pdo->getAttribute(PDO::ATTR_DRIVER_NAME);
    try {
        if ($driver === 'sqlite') {
            $statement = $pdo->query(sprintf('PRAGMA table_info(`%s`)', $table));
            $rows = $statement instanceof PDOStatement ? $statement->fetchAll() : [];
            $columns = [];
            foreach ($rows as $row) {
                if (isset($row['name']) && is_string($row['name'])) {
                    $columns[$row['name']] = true;
                }
            }
            return $columns;
        }

        $statement = $pdo->query(sprintf('SHOW COLUMNS FROM `%s`', $table));
        $rows = $statement instanceof PDOStatement ? $statement->fetchAll() : [];
        $columns = [];
        foreach ($rows as $row) {
            if (isset($row['Field']) && is_string($row['Field'])) {
                $columns[$row['Field']] = true;
            }
        }
        return $columns;
    } catch (Throwable $error) {
        return [];
    }
}

function fetch_upstream_payload(string $query, array $config): ?array
{
    $separator = strpos($config['upstream_base'], '?') === false ? '?' : '&';
    $upstreamUrl = $config['upstream_base'] . $separator . http_build_query([
        'q' => $query,
        'fresh' => '0',
        'swr' => '1',
    ]);

    $response = fetch_json_payload($upstreamUrl, (int) $config['upstream_timeout']);
    if ($response === null || !isset($response['results']) || !is_array($response['results'])) {
        return null;
    }

    $results = normalize_upstream_results($response['results'], (int) $config['limit']);
    return [
        'payload' => [
            'query' => $query,
            'results' => $results,
            'count' => count($results),
        ],
        'source' => 'upstream',
        'status' => 'ok',
    ];
}

function fetch_json_payload(string $url, int $timeoutSeconds): ?array
{
    if (function_exists('curl_init')) {
        $payload = fetch_json_via_curl($url, $timeoutSeconds);
        if (is_array($payload)) {
            return $payload;
        }
    }

    return fetch_json_via_stream($url, $timeoutSeconds);
}

function fetch_json_via_curl(string $url, int $timeoutSeconds): ?array
{
    $curl = curl_init($url);
    if ($curl === false) {
        return null;
    }

    curl_setopt_array($curl, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_FOLLOWLOCATION => true,
        CURLOPT_CONNECTTIMEOUT => max(1, $timeoutSeconds),
        CURLOPT_TIMEOUT => max(1, $timeoutSeconds),
        CURLOPT_HTTPHEADER => [
            'Accept: application/json',
        ],
    ]);

    $raw = curl_exec($curl);
    $status = (int) curl_getinfo($curl, CURLINFO_HTTP_CODE);
    curl_close($curl);

    if (!is_string($raw) || $raw === '' || $status < 200 || $status >= 300) {
        return null;
    }

    $decoded = json_decode($raw, true);
    return is_array($decoded) ? $decoded : null;
}

function fetch_json_via_stream(string $url, int $timeoutSeconds): ?array
{
    if (!ini_get('allow_url_fopen')) {
        return null;
    }

    $context = stream_context_create([
        'http' => [
            'method' => 'GET',
            'header' => "Accept: application/json\r\n",
            'timeout' => max(1, $timeoutSeconds),
            'ignore_errors' => true,
        ],
        'ssl' => [
            'verify_peer' => true,
            'verify_peer_name' => true,
        ],
    ]);

    $raw = @file_get_contents($url, false, $context);
    $headers = isset($http_response_header) && is_array($http_response_header)
        ? $http_response_header
        : [];
    $status = extract_final_status_code($headers);

    if (!is_string($raw) || $raw === '' || $status < 200 || $status >= 300) {
        return null;
    }

    $decoded = json_decode($raw, true);
    return is_array($decoded) ? $decoded : null;
}

function extract_final_status_code(array $headers): int
{
    $status = 0;
    foreach ($headers as $header) {
        if (preg_match('/^HTTP\/\S+\s+(\d{3})\b/', (string) $header, $matches)) {
            $status = (int) $matches[1];
        }
    }

    return $status;
}

function normalize_upstream_results(array $entries, int $limit): array
{
    $results = [];
    $seen = [];
    foreach ($entries as $entry) {
        if (!is_array($entry)) {
            continue;
        }

        $pubkey = normalize_pubkey($entry['pubkey'] ?? null);
        if ($pubkey === null || isset($seen[$pubkey])) {
            continue;
        }

        $profile = isset($entry['profile']) && is_array($entry['profile']) ? $entry['profile'] : [];
        $meta = isset($entry['meta']) && is_array($entry['meta']) ? $entry['meta'] : [];
        $seen[$pubkey] = true;
        $results[] = [
            'pubkey' => $pubkey,
            'name' => normalize_string($entry['name'] ?? $profile['name'] ?? $meta['name'] ?? null),
            'display_name' => normalize_string($entry['displayName'] ?? $profile['display_name'] ?? $meta['display_name'] ?? null),
            'about' => normalize_string($entry['about'] ?? $profile['about'] ?? $meta['about'] ?? null),
            'picture' => normalize_string($entry['picture'] ?? $profile['picture'] ?? $meta['picture'] ?? null),
            'nip05' => normalize_string($entry['nip05'] ?? $profile['nip05'] ?? $meta['nip05'] ?? null),
        ];

        if (count($results) >= max(1, min($limit, 50))) {
            break;
        }
    }

    return $results;
}

function emit_json_payload(?array $payload, string $method, int $status = 200, array $headers = []): void
{
    http_response_code($status);
    foreach ($headers as $key => $value) {
        header($key . ': ' . $value);
    }

    if ($method === 'HEAD' || $payload === null) {
        return;
    }

    echo json_encode($payload, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
}

function first_existing_column(array $columns, array $candidates): ?string
{
    foreach ($candidates as $candidate) {
        if (isset($columns[$candidate])) {
            return $candidate;
        }
    }

    return null;
}

function unique_columns(array $columns): array
{
    $unique = [];
    foreach ($columns as $column) {
        if (!is_string($column) || $column === '' || in_array($column, $unique, true)) {
            continue;
        }
        $unique[] = $column;
    }

    return $unique;
}

function normalize_string_from_candidates(array $row, array $candidates): ?string
{
    foreach ($candidates as $candidate) {
        if (!array_key_exists($candidate, $row)) {
            continue;
        }
        $value = normalize_string($row[$candidate]);
        if ($value !== null) {
            return $value;
        }
    }

    return null;
}

function normalize_pubkey($value): ?string
{
    if (!is_string($value)) {
        return null;
    }

    $pubkey = strtolower(trim($value));
    if ($pubkey === '' || !preg_match('/^[0-9a-f]{64}$/', $pubkey)) {
        return null;
    }

    return $pubkey;
}

function normalize_string($value): ?string
{
    if (!is_string($value)) {
        return null;
    }

    $trimmed = trim($value);
    return $trimmed === '' ? null : $trimmed;
}

function resolve_int_env(string $name, int $default, int $min, int $max): int
{
    $raw = getenv($name);
    if (!is_string($raw) || trim($raw) === '') {
        return $default;
    }

    $value = (int) trim($raw);
    if ($value < $min) {
        return $default;
    }

    return min($value, $max);
}

function resolve_trimmed_env(string $name, string $default): string
{
    $raw = getenv($name);
    if (!is_string($raw)) {
        return $default;
    }

    $trimmed = trim($raw);
    return $trimmed === '' ? $default : $trimmed;
}

function resolve_bool_env(string $name, bool $default): bool
{
    $raw = getenv($name);
    if (!is_string($raw) || trim($raw) === '') {
        return $default;
    }

    $normalized = strtolower(trim($raw));
    if (in_array($normalized, ['1', 'true', 'yes', 'on'], true)) {
        return true;
    }
    if (in_array($normalized, ['0', 'false', 'no', 'off'], true)) {
        return false;
    }

    return $default;
}

function split_csv_values(string $raw): array
{
    $values = [];
    foreach (explode(',', $raw) as $part) {
        $trimmed = trim($part);
        if ($trimmed === '') {
            continue;
        }
        $values[] = $trimmed;
    }

    return $values;
}

function resolve_config_string(array $fileConfig, string $key, string $envName, string $default): string
{
    if (array_key_exists($key, $fileConfig) && is_string($fileConfig[$key])) {
        $trimmed = trim($fileConfig[$key]);
        if ($trimmed !== '') {
            return $trimmed;
        }
    }

    return resolve_trimmed_env($envName, $default);
}

function resolve_config_int(array $fileConfig, string $key, string $envName, int $default, int $min, int $max): int
{
    if (array_key_exists($key, $fileConfig)) {
        $value = (int) $fileConfig[$key];
        if ($value >= $min) {
            return min($value, $max);
        }
    }

    return resolve_int_env($envName, $default, $min, $max);
}

function resolve_config_bool(array $fileConfig, string $key, string $envName, bool $default): bool
{
    if (array_key_exists($key, $fileConfig)) {
        $value = $fileConfig[$key];
        if (is_bool($value)) {
            return $value;
        }
        if (is_string($value)) {
            $normalized = strtolower(trim($value));
            if (in_array($normalized, ['1', 'true', 'yes', 'on'], true)) {
                return true;
            }
            if (in_array($normalized, ['0', 'false', 'no', 'off'], true)) {
                return false;
            }
        }
    }

    return resolve_bool_env($envName, $default);
}

function resolve_config_list(array $fileConfig, string $key, string $envName): array
{
    if (array_key_exists($key, $fileConfig)) {
        $value = $fileConfig[$key];
        if (is_array($value)) {
            $values = [];
            foreach ($value as $item) {
                if (!is_string($item)) {
                    continue;
                }
                $trimmed = trim($item);
                if ($trimmed !== '') {
                    $values[] = $trimmed;
                }
            }
            if ($values !== []) {
                return $values;
            }
        }
        if (is_string($value)) {
            $values = split_csv_values($value);
            if ($values !== []) {
                return $values;
            }
        }
    }

    return split_csv_values((string) getenv($envName));
}
