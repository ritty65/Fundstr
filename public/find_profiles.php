<?php

declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
header('Pragma: no-cache');
header('Access-Control-Allow-Origin: *');

$method = strtoupper((string) ($_SERVER['REQUEST_METHOD'] ?? 'GET'));

if ($method === 'OPTIONS') {
    header('Access-Control-Allow-Methods: GET, HEAD, OPTIONS');
    header('Access-Control-Allow-Headers: Content-Type');
    http_response_code(204);
    exit;
}

if ($method !== 'GET' && $method !== 'HEAD') {
    http_response_code(200);
    emit_payload([
        'query' => '',
        'results' => [],
        'count' => 0,
        'warning' => 'Method not allowed',
    ], $method);
    exit;
}

$query = trim((string) ($_GET['q'] ?? ''));
if ($query === '') {
    http_response_code(200);
    emit_payload([
        'query' => '',
        'results' => [],
        'count' => 0,
    ], $method);
    exit;
}

$upstreamBase = trim((string) getenv('FUNDSTR_PHONEBOOK_UPSTREAM'));
if ($upstreamBase === '') {
    $upstreamBase = 'https://api.fundstr.me/discover/creators';
}

$separator = strpos($upstreamBase, '?') === false ? '?' : '&';
$upstreamUrl = $upstreamBase . $separator . http_build_query([
    'q' => $query,
    'fresh' => '0',
    'swr' => '1',
]);

$response = fetchJson($upstreamUrl, 15);
if ($response === null || !isset($response['results']) || !is_array($response['results'])) {
    http_response_code(200);
    header('X-Fundstr-Phonebook-Status: degraded');
    emit_payload([
        'query' => $query,
        'results' => [],
        'count' => 0,
        'warning' => 'Limited results (discovery unavailable)',
    ], $method);
    exit;
}

$results = [];
foreach ($response['results'] as $entry) {
    if (!is_array($entry)) {
        continue;
    }

    $pubkey = normalize_string($entry['pubkey'] ?? null);
    if ($pubkey === null || !preg_match('/^[0-9a-f]{64}$/i', $pubkey)) {
        continue;
    }

    $profile = isset($entry['profile']) && is_array($entry['profile']) ? $entry['profile'] : [];
    $meta = isset($entry['meta']) && is_array($entry['meta']) ? $entry['meta'] : [];

    $results[] = [
        'pubkey' => strtolower($pubkey),
        'name' => normalize_string($entry['name'] ?? $profile['name'] ?? $meta['name'] ?? null),
        'display_name' => normalize_string($entry['displayName'] ?? $profile['display_name'] ?? $meta['display_name'] ?? null),
        'about' => normalize_string($entry['about'] ?? $profile['about'] ?? $meta['about'] ?? null),
        'picture' => normalize_string($entry['picture'] ?? $profile['picture'] ?? $meta['picture'] ?? null),
        'nip05' => normalize_string($entry['nip05'] ?? $profile['nip05'] ?? $meta['nip05'] ?? null),
    ];
}

http_response_code(200);
emit_payload([
    'query' => $query,
    'results' => $results,
    'count' => count($results),
], $method);

function fetchJson(string $url, int $timeoutSeconds): ?array
{
    $decoded = fetchJsonViaCurl($url, $timeoutSeconds);
    if (is_array($decoded)) {
        return $decoded;
    }

    return fetchJsonViaStream($url, $timeoutSeconds);
}

function fetchJsonViaCurl(string $url, int $timeoutSeconds): ?array
{
    if (!function_exists('curl_init')) {
        return null;
    }

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

function fetchJsonViaStream(string $url, int $timeoutSeconds): ?array
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
    $status = extract_status_code($headers);

    if (!is_string($raw) || $raw === '' || $status < 200 || $status >= 300) {
        return null;
    }

    $decoded = json_decode($raw, true);
    return is_array($decoded) ? $decoded : null;
}

function extract_status_code(array $headers): int
{
    foreach ($headers as $header) {
        if (preg_match('/^HTTP\/\S+\s+(\d{3})\b/', (string) $header, $matches)) {
            return (int) $matches[1];
        }
    }

    return 0;
}

function emit_payload(array $payload, string $method): void
{
    if ($method === 'HEAD') {
        return;
    }

    echo json_encode($payload, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
}

function normalize_string($value): ?string
{
    if (!is_string($value)) {
        return null;
    }

    $trimmed = trim($value);
    return $trimmed === '' ? null : $trimmed;
}
