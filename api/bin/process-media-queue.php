#!/usr/bin/env php
<?php
/**
 * NOMAD CMS - Media Queue Worker
 * 
 * Background worker to process pending media queue items.
 * Downloads/decodes images and converts them to WebP.
 * 
 * Usage:
 *   php api/bin/process-media-queue.php [--limit=50] [--verbose]
 * 
 * Options:
 *   --limit=N    Maximum items to process per run (default: 50)
 *   --verbose    Output progress information
 *   --daemon     Run continuously with 5s sleep between batches
 * 
 * Cron Example (every minute):
 *   * * * * * cd /path/to/cms && php api/bin/process-media-queue.php --limit=20 >> /var/log/nomad-media.log 2>&1
 */

declare(strict_types=1);

// Ensure running from CLI
if (php_sapi_name() !== 'cli') {
    die("This script must be run from the command line.\n");
}

// Bootstrap the application
require_once __DIR__ . '/../bootstrap.php';

use NomadCMS\Services\SmartIngestService;

// Parse command line arguments
$options = getopt('', ['limit::', 'verbose', 'daemon']);
$limit = (int)($options['limit'] ?? 50);
$verbose = isset($options['verbose']);
$daemon = isset($options['daemon']);

$log = function(string $message) use ($verbose) {
    if ($verbose) {
        $timestamp = date('Y-m-d H:i:s');
        echo "[{$timestamp}] {$message}\n";
    }
};

$log("NOMAD CMS Media Queue Worker started");
$log("Limit: {$limit} items per batch");

do {
    try {
        // Get queue stats before processing
        $statsBefore = SmartIngestService::getQueueStats();
        $pending = $statsBefore['pending'] ?? 0;
        
        if ($pending === 0) {
            $log("No pending items in queue.");
        } else {
            $log("Processing {$pending} pending items...");
            
            // Process the queue
            $results = SmartIngestService::processPendingQueue($limit);
            
            $log("Processed: {$results['processed']}, Failed: {$results['failed']}");
            
            // Log errors if any
            if (!empty($results['errors']) && $verbose) {
                foreach ($results['errors'] as $error) {
                    $log("  Error ID {$error['id']}: {$error['error']}");
                }
            }
        }
        
    } catch (\Throwable $e) {
        $log("FATAL ERROR: " . $e->getMessage());
        error_log("[MediaQueueWorker] " . $e->getMessage());
    }
    
    // Daemon mode: sleep and continue
    if ($daemon) {
        $log("Sleeping for 5 seconds...");
        sleep(5);
    }
    
} while ($daemon);

$log("Worker finished.");
