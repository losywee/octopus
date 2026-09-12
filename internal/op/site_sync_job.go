package op

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/xuanli27/octopus/internal/db"
	"github.com/xuanli27/octopus/internal/model"
	"gorm.io/gorm"
)

// ErrSiteSyncJobLeaseOwnershipLost is returned when a worker tries to write a
// job after another worker has taken over its database lease. Callers should
// stop doing work and must not retry the stale write with the old owner.
var ErrSiteSyncJobLeaseOwnershipLost = errors.New("site sync job lease ownership lost")

const (
	defaultSiteSyncJobHistoryLimit = 20
	maxSiteSyncJobHistoryLimit     = 100
	defaultSiteSyncJobRetention    = 200
)

// SiteSyncJobCreate records a queued sync before a worker starts. The caller
// may pass an empty phase/trigger only for compatibility; normal callers use
// "sync" and one of the SiteBatchTrigger values.
func SiteSyncJobCreate(ctx context.Context, phase, trigger string) (*model.SiteSyncJob, error) {
	database := db.GetDB()
	if database == nil {
		return nil, fmt.Errorf("database is not initialized")
	}
	job := &model.SiteSyncJob{
		Phase:   strings.TrimSpace(phase),
		Trigger: strings.TrimSpace(trigger),
		Status:  model.SiteSyncJobStatusQueued,
	}
	if job.Phase == "" {
		job.Phase = "sync"
	}
	if job.Trigger == "" {
		job.Trigger = "scheduled"
	}
	if err := database.WithContext(ctx).Create(job).Error; err != nil {
		return nil, err
	}
	return job, nil
}

func SiteSyncJobMarkRunning(ctx context.Context, id, total int, startedAt time.Time, leaseOwner string, leaseExpiresAt time.Time) error {
	if id <= 0 {
		return nil
	}
	leaseOwner = strings.TrimSpace(leaseOwner)
	if leaseOwner == "" {
		return fmt.Errorf("site sync job lease owner is required")
	}
	database := db.GetDB()
	if database == nil {
		return fmt.Errorf("database is not initialized")
	}
	if startedAt.IsZero() {
		startedAt = time.Now()
	}
	if leaseExpiresAt.IsZero() {
		return fmt.Errorf("site sync job lease expiry is required")
	}
	updatedAt := time.Now()
	result := database.WithContext(ctx).Model(&model.SiteSyncJob{}).Where("id = ? AND status = ? AND lease_owner = ''", id, model.SiteSyncJobStatusQueued).Updates(map[string]any{
		"status":            model.SiteSyncJobStatusRunning,
		"total":             total,
		"attempted":         0,
		"success":           0,
		"partial":           0,
		"failed":            0,
		"skipped":           0,
		"warnings":          0,
		"canceled":          false,
		"blocked_by_job_id": 0,
		"cancel_reason":     "",
		"duration_ms":       0,
		"started_at":        startedAt,
		"heartbeat_at":      startedAt,
		"lease_owner":       leaseOwner,
		"lease_expires_at":  leaseExpiresAt,
		"finished_at":       nil,
		"error_message":     "",
		"updated_at":        updatedAt,
	})
	if result.Error != nil {
		return result.Error
	}
	if result.RowsAffected == 0 {
		return siteSyncJobWriteMissError(ctx, database, id, leaseOwner)
	}
	return nil
}

// SiteSyncJobSaveProgress persists counters and a heartbeat while a worker is
// running. The job argument is treated as a snapshot; only known mutable
// fields are written, so timestamps and identity cannot be accidentally
// overwritten by a progress update.
func SiteSyncJobSaveProgress(ctx context.Context, job *model.SiteSyncJob) error {
	if job == nil || job.ID <= 0 {
		return nil
	}
	database := db.GetDB()
	if database == nil {
		return fmt.Errorf("database is not initialized")
	}
	job.LeaseOwner = strings.TrimSpace(job.LeaseOwner)
	if job.LeaseOwner == "" {
		return fmt.Errorf("site sync job lease owner is required")
	}
	heartbeat := job.HeartbeatAt
	if heartbeat == nil || heartbeat.IsZero() {
		now := time.Now()
		heartbeat = &now
	}
	updatedAt := time.Now()
	result := database.WithContext(ctx).Model(&model.SiteSyncJob{}).Where("id = ? AND lease_owner = ? AND status = ?", job.ID, job.LeaseOwner, model.SiteSyncJobStatusRunning).Updates(map[string]any{
		"status":            model.SiteSyncJobStatusRunning,
		"total":             job.Total,
		"attempted":         job.Attempted,
		"success":           job.Success,
		"partial":           job.Partial,
		"failed":            job.Failed,
		"skipped":           job.Skipped,
		"warnings":          job.Warnings,
		"canceled":          job.Canceled,
		"blocked_by_job_id": job.BlockedByJobID,
		"cancel_reason":     job.CancelReason,
		"error_message":     job.ErrorMessage,
		"heartbeat_at":      heartbeat,
		"duration_ms":       job.DurationMS,
		"lease_expires_at":  job.LeaseExpiresAt,
		"updated_at":        updatedAt,
	})
	if result.Error != nil {
		return result.Error
	}
	if result.RowsAffected == 0 {
		return siteSyncJobWriteMissError(ctx, database, job.ID, job.LeaseOwner)
	}
	return nil
}

func SiteSyncJobFinish(ctx context.Context, job *model.SiteSyncJob) error {
	if job == nil || job.ID <= 0 {
		return nil
	}
	database := db.GetDB()
	if database == nil {
		return fmt.Errorf("database is not initialized")
	}
	finishedAt := job.FinishedAt
	if finishedAt == nil || finishedAt.IsZero() {
		now := time.Now()
		finishedAt = &now
	}
	updatedAt := time.Now()
	query := database.WithContext(ctx).Model(&model.SiteSyncJob{}).Where("id = ?", job.ID)
	job.LeaseOwner = strings.TrimSpace(job.LeaseOwner)
	if job.LeaseOwner != "" {
		query = query.Where("lease_owner = ?", job.LeaseOwner)
	} else {
		query = query.Where("lease_owner = '' AND status = ?", model.SiteSyncJobStatusQueued)
	}
	result := query.Updates(map[string]any{
		"status":            job.Status,
		"total":             job.Total,
		"attempted":         job.Attempted,
		"success":           job.Success,
		"partial":           job.Partial,
		"failed":            job.Failed,
		"skipped":           job.Skipped,
		"warnings":          job.Warnings,
		"canceled":          job.Canceled,
		"blocked_by_job_id": job.BlockedByJobID,
		"cancel_reason":     job.CancelReason,
		"error_message":     job.ErrorMessage,
		"finished_at":       finishedAt,
		"heartbeat_at":      finishedAt,
		"duration_ms":       job.DurationMS,
		"lease_owner":       "",
		"lease_expires_at":  nil,
		"updated_at":        updatedAt,
	})
	if result.Error != nil {
		return result.Error
	}
	if result.RowsAffected == 0 {
		return siteSyncJobWriteMissError(ctx, database, job.ID, job.LeaseOwner)
	}
	return nil
}

// siteSyncJobWriteMissError distinguishes an absent job from a stale worker
// whose owner no longer matches. Some SQL drivers report zero affected rows
// for a no-op UPDATE, so callers can still verify the row before deciding that
// the lease was lost.
func siteSyncJobWriteMissError(ctx context.Context, database *gorm.DB, id int, owner string) error {
	var current model.SiteSyncJob
	err := database.WithContext(ctx).Select("id, lease_owner, status").First(&current, id).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return fmt.Errorf("site sync job %d not found", id)
	}
	if err != nil {
		return err
	}
	if owner != "" && current.LeaseOwner != owner {
		return fmt.Errorf("%w: job %d", ErrSiteSyncJobLeaseOwnershipLost, id)
	}
	return fmt.Errorf("site sync job %d is no longer writable", id)
}

func SiteSyncJobGet(ctx context.Context, id int) (*model.SiteSyncJob, error) {
	database := db.GetDB()
	if database == nil {
		return nil, fmt.Errorf("database is not initialized")
	}
	var job model.SiteSyncJob
	if err := database.WithContext(ctx).First(&job, id).Error; err != nil {
		return nil, err
	}
	return &job, nil
}

func SiteSyncJobList(ctx context.Context, limit int) ([]model.SiteSyncJob, error) {
	database := db.GetDB()
	if database == nil {
		return nil, fmt.Errorf("database is not initialized")
	}
	if limit <= 0 {
		limit = defaultSiteSyncJobHistoryLimit
	}
	if limit > maxSiteSyncJobHistoryLimit {
		limit = maxSiteSyncJobHistoryLimit
	}
	var jobs []model.SiteSyncJob
	if err := database.WithContext(ctx).Order("id DESC").Limit(limit).Find(&jobs).Error; err != nil {
		return nil, err
	}
	return jobs, nil
}

func SiteSyncJobPrune(ctx context.Context, keep int) error {
	database := db.GetDB()
	if database == nil {
		return fmt.Errorf("database is not initialized")
	}
	if keep <= 0 {
		keep = defaultSiteSyncJobRetention
	}
	var ids []int
	if err := database.WithContext(ctx).
		Model(&model.SiteSyncJob{}).
		Where("status NOT IN ?", []model.SiteSyncJobStatus{model.SiteSyncJobStatusQueued, model.SiteSyncJobStatusRunning}).
		Order("id DESC").
		Offset(keep).
		Pluck("id", &ids).Error; err != nil {
		return err
	}
	if len(ids) == 0 {
		return nil
	}
	return database.WithContext(ctx).Where("id IN ?", ids).Delete(&model.SiteSyncJob{}).Error
}

// SiteSyncJobFailStale marks abandoned workers as failed. The cutoff is
// intentionally caller-controlled so startup code can choose a conservative
// grace period and future distributed workers can use their own lease policy.
func SiteSyncJobFailStale(ctx context.Context, cutoff time.Time, message string) (int64, error) {
	database := db.GetDB()
	if database == nil {
		return 0, fmt.Errorf("database is not initialized")
	}
	if cutoff.IsZero() {
		cutoff = time.Now()
	}
	if strings.TrimSpace(message) == "" {
		message = "site sync worker stopped before completion"
	}
	now := time.Now()
	result := database.WithContext(ctx).Model(&model.SiteSyncJob{}).
		Where("status IN ? AND COALESCE(heartbeat_at, updated_at, created_at) < ?", []model.SiteSyncJobStatus{model.SiteSyncJobStatusQueued, model.SiteSyncJobStatusRunning}, cutoff).
		Updates(map[string]any{
			"status":           model.SiteSyncJobStatusFailed,
			"finished_at":      now,
			"heartbeat_at":     now,
			"error_message":    message,
			"lease_owner":      "",
			"lease_expires_at": nil,
			"updated_at":       now,
		})
	return result.RowsAffected, result.Error
}
