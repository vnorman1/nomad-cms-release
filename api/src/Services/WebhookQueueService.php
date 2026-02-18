<?php
/**
 * NOMAD CMS - Webhook Queue Service
 * 
 * Handles async processing of queued webhooks.
 * Designed for shared hosting (no cron, no daemon):
 * - Piggyback processing via register_shutdown_function
 * - HTTP endpoint for manual/external triggers
 * 
 * Features:
 * - Non-blocking queue processing
 * - Exponential backoff for retries
 * - Time-limited batch processing
 * - Memory-efficient design
 */

declare(strict_types=1);

namespace NomadCMS\Services;

use NomadCMS\Database\AuthDatabase;
use NomadCMS\Security\WebhookService;
use PDO;

final class WebhookQueueService
{
    // Processing limits (shared hosting friendly)
    private const BATCH_SIZE = 5;           // Max webhooks per piggyback run
    private const MAX_EXECUTION_TIME = 5;   // Max seconds per piggyback run
    
    // Exponential backoff delays (in seconds)
    private const RETRY_DELAYS = [60, 300, 900]; // 1min, 5min, 15min
    
    private static ?self $instance = null;
    private WebhookService $webhookService;
    
    /**
     * Get singleton instance
     */
    public static function getInstance(): self
    {
        return self::$instance ??= new self();
    }
    
    private function __construct()
    {
        $this->webhookService = new WebhookService();
    }
    
    /**
     * Process queued webhooks (call from piggyback or HTTP endpoint)
     * 
     * Non-blocking, time-limited processing suitable for shared hosting.
     * Processes up to BATCH_SIZE items or until MAX_EXECUTION_TIME is reached.
     * 
     * @return array Processing statistics
     */
    public function processQueue(): array
    {
        $startTime = microtime(true);
        $processed = 0;
        $succeeded = 0;
        $failed = 0;
        
        $db = AuthDatabase::getInstance();
        
        // Get configurable limits from env
        $batchSize = (int)($_ENV['WEBHOOK_QUEUE_BATCH_SIZE'] ?? self::BATCH_SIZE);
        $maxTime = (int)($_ENV['WEBHOOK_QUEUE_MAX_EXECUTION_TIME'] ?? self::MAX_EXECUTION_TIME);
        
        while ($processed < $batchSize) {
            // Time limit check
            if ((microtime(true) - $startTime) > $maxTime) {
                break;
            }
            
            // Get next pending item (with lock)
            $item = $this->getNextQueueItem($db);
            if (!$item) {
                break; // No more items to process
            }
            
            // Process webhook
            $result = $this->processQueueItem($item, $db);
            
            $processed++;
            if ($result['success']) {
                $succeeded++;
            } else {
                $failed++;
            }
        }
        
        return [
            'processed' => $processed,
            'succeeded' => $succeeded,
            'failed' => $failed,
            'duration_ms' => round((microtime(true) - $startTime) * 1000, 2)
        ];
    }
    
    /**
     * Get next queue item and mark as processing
     * 
     * Uses transaction for optimistic locking to prevent
     * multiple workers from processing the same item.
     */
    private function getNextQueueItem(PDO $db): ?array
    {
        $db->beginTransaction();
        
        try {
            // Select next item that's ready for processing
            $stmt = $db->prepare("
                SELECT * FROM webhook_queue 
                WHERE status IN ('pending', 'failed') 
                AND attempts < max_attempts
                AND (next_attempt_at IS NULL OR next_attempt_at <= ?)
                ORDER BY created_at ASC
                LIMIT 1
            ");
            $stmt->execute([time()]);
            $item = $stmt->fetch(PDO::FETCH_ASSOC);
            
            if (!$item) {
                $db->commit();
                return null;
            }
            
            // Mark as processing (optimistic lock)
            $stmt = $db->prepare("UPDATE webhook_queue SET status = 'processing' WHERE id = ?");
            $stmt->execute([$item['id']]);
            
            $db->commit();
            return $item;
            
        } catch (\Exception $e) {
            $db->rollBack();
            error_log("[WEBHOOK QUEUE] Lock error: " . $e->getMessage());
            return null;
        }
    }
    
    /**
     * Process single queue item
     */
    private function processQueueItem(array $item, PDO $db): array
    {
        $payload = json_decode($item['payload'], true);
        
        try {
            // Send webhook (actual HTTP call)
            $result = $this->webhookService->sendWebhookDirect(
                (int)$item['webhook_id'],
                $item['event'],
                $payload
            );
            
            if ($result->success) {
                $this->markCompleted($item['id'], $db);
                return ['success' => true];
            } else {
                $this->markFailed($item, $db, $result->error ?? 'Unknown error');
                return ['success' => false, 'reason' => $result->error];
            }
            
        } catch (\Exception $e) {
            $this->markFailed($item, $db, $e->getMessage());
            return ['success' => false, 'reason' => $e->getMessage()];
        }
    }
    
    /**
     * Mark queue item as completed
     */
    private function markCompleted(int $id, PDO $db, ?string $note = null): void
    {
        $stmt = $db->prepare("
            UPDATE webhook_queue 
            SET status = 'completed', completed_at = ?, last_error = ?
            WHERE id = ?
        ");
        $stmt->execute([time(), $note, $id]);
    }
    
    /**
     * Mark queue item as failed and schedule retry with exponential backoff
     */
    private function markFailed(array $item, PDO $db, string $error): void
    {
        $attempts = (int)$item['attempts'] + 1;
        $maxAttempts = (int)$item['max_attempts'];
        
        if ($attempts >= $maxAttempts) {
            // Final failure - no more retries
            $stmt = $db->prepare("
                UPDATE webhook_queue 
                SET status = 'failed', attempts = ?, last_error = ?, next_attempt_at = NULL
                WHERE id = ?
            ");
            $stmt->execute([$attempts, $error, $item['id']]);
            
            error_log(sprintf(
                "[WEBHOOK QUEUE] Final failure after %d attempts: webhook_id=%d, event=%s, error=%s",
                $attempts,
                $item['webhook_id'],
                $item['event'],
                $error
            ));
        } else {
            // Schedule retry with exponential backoff
            $delayIndex = min($attempts - 1, count(self::RETRY_DELAYS) - 1);
            $nextAttempt = time() + self::RETRY_DELAYS[$delayIndex];
            
            $stmt = $db->prepare("
                UPDATE webhook_queue 
                SET status = 'pending', attempts = ?, next_attempt_at = ?, last_error = ?
                WHERE id = ?
            ");
            $stmt->execute([$attempts, $nextAttempt, $error, $item['id']]);
            
            error_log(sprintf(
                "[WEBHOOK QUEUE] Retry scheduled: webhook_id=%d, attempt=%d/%d, next_at=%s",
                $item['webhook_id'],
                $attempts,
                $maxAttempts,
                date('Y-m-d H:i:s', $nextAttempt)
            ));
        }
    }
    
    /**
     * Get queue statistics
     */
    public function getQueueStats(): array
    {
        $db = AuthDatabase::getInstance();
        
        $stmt = $db->query("
            SELECT 
                status,
                COUNT(*) as count,
                MIN(created_at) as oldest
            FROM webhook_queue
            GROUP BY status
        ");
        
        $stats = [
            'pending' => 0,
            'processing' => 0,
            'completed' => 0,
            'failed' => 0
        ];
        
        while ($row = $stmt->fetch()) {
            $stats[$row['status']] = (int)$row['count'];
        }
        
        // Get retry queue size
        $stmt = $db->prepare("
            SELECT COUNT(*) as count FROM webhook_queue 
            WHERE status = 'pending' AND attempts > 0
        ");
        $stmt->execute();
        $stats['retrying'] = (int)$stmt->fetch()['count'];
        
        return $stats;
    }
    
    /**
     * Get pending queue count (for quick check)
     */
    public function getPendingCount(): int
    {
        $db = AuthDatabase::getInstance();
        $stmt = $db->prepare("
            SELECT COUNT(*) as count FROM webhook_queue 
            WHERE status IN ('pending', 'failed') 
            AND attempts < max_attempts
            AND (next_attempt_at IS NULL OR next_attempt_at <= ?)
        ");
        $stmt->execute([time()]);
        return (int)$stmt->fetch()['count'];
    }
    
    /**
     * Cleanup old completed entries
     * 
     * Removes completed queue items older than specified days.
     * Should be called periodically (e.g., during piggyback).
     * 
     * @param int $olderThanDays Days to keep completed items (default: 3, aggressive)
     * @return int Number of deleted items
     */
    public function cleanup(int $olderThanDays = 3): int
    {
        $db = AuthDatabase::getInstance();
        $stmt = $db->prepare("
            DELETE FROM webhook_queue 
            WHERE status = 'completed' 
            AND completed_at < ?
        ");
        $stmt->execute([time() - ($olderThanDays * 86400)]);
        return $stmt->rowCount();
    }
    
    /**
     * Cleanup stale processing items
     * 
     * Items stuck in 'processing' state for too long are reset to 'pending'.
     * This handles cases where the worker crashed during processing.
     * 
     * @param int $staleMinutes Minutes after which to consider processing stale (default: 5, aggressive)
     * @return int Number of reset items
     */
    public function cleanupStaleProcessing(int $staleMinutes = 5): int
    {
        $db = AuthDatabase::getInstance();
        $stmt = $db->prepare("
            UPDATE webhook_queue 
            SET status = 'pending'
            WHERE status = 'processing' 
            AND created_at < ?
        ");
        $stmt->execute([time() - ($staleMinutes * 60)]);
        return $stmt->rowCount();
    }
    
    /**
     * Force retry all failed webhooks
     * 
     * Resets all failed webhooks to pending for immediate retry.
     * Admin action only.
     * 
     * @return int Number of webhooks reset
     */
    public function retryAllFailed(): int
    {
        $db = AuthDatabase::getInstance();
        $stmt = $db->prepare("
            UPDATE webhook_queue 
            SET status = 'pending', attempts = 0, next_attempt_at = ?
            WHERE status = 'failed'
        ");
        $stmt->execute([time()]);
        return $stmt->rowCount();
    }
    
    /**
     * Clear entire queue (admin action)
     * 
     * @param string|null $status Only clear specific status (pending, completed, failed)
     * @return int Number of deleted items
     */
    public function clearQueue(?string $status = null): int
    {
        $db = AuthDatabase::getInstance();
        
        if ($status) {
            $stmt = $db->prepare("DELETE FROM webhook_queue WHERE status = ?");
            $stmt->execute([$status]);
        } else {
            $stmt = $db->query("DELETE FROM webhook_queue");
        }
        
        return $stmt->rowCount();
    }
}
