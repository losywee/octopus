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
	"gorm.io/gorm/clause"
)

var errSiteSyncLeaseJobOwnerMismatch = errors.New("site sync lease job owner mismatch")

func normalizeSiteSyncLeaseInput(name, owner string, jobID int, now time.Time, ttl time.Duration) (string, string, time.Time, error) {
	name = strings.TrimSpace(name)
	owner = strings.TrimSpace(owner)
	if name == "" {
		return "", "", time.Time{}, fmt.Errorf("site sync lease name is required")
	}
	if owner == "" {
		return "", "", time.Time{}, fmt.Errorf("site sync lease owner is required")
	}
	if len(owner) > 96 {
		return "", "", time.Time{}, fmt.Errorf("site sync lease owner is too long")
	}
	if jobID <= 0 {
		return "", "", time.Time{}, fmt.Errorf("site sync lease job id is required")
	}
	if ttl <= 0 {
		return "", "", time.Time{}, fmt.Errorf("site sync lease ttl must be positive")
	}
	if now.IsZero() {
		now = time.Now()
	}
	return name, owner, now.UTC(), nil
}

func ensureSiteSyncLeaseRow(ctx context.Context, name string) error {
	database := db.GetDB()
	if database == nil {
		return fmt.Errorf("database is not initialized")
	}
	seed := &model.SiteSyncLease{
		Name:      name,
		ExpiresAt: time.Unix(0, 0).UTC(),
	}
	return database.WithContext(ctx).Clauses(clause.OnConflict{DoNothing: true}).Create(seed).Error
}

// SiteSyncLeaseAcquire atomically acquires or replaces an expired singleton
// lease. A live lease held by another owner is returned with acquired=false.
func SiteSyncLeaseAcquire(ctx context.Context, name, owner string, jobID int, now time.Time, ttl time.Duration) (*model.SiteSyncLease, bool, error) {
	name, owner, now, err := normalizeSiteSyncLeaseInput(name, owner, jobID, now, ttl)
	if err != nil {
		return nil, false, err
	}
	if err := ensureSiteSyncLeaseRow(ctx, name); err != nil {
		return nil, false, err
	}
	database := db.GetDB()
	if database == nil {
		return nil, false, fmt.Errorf("database is not initialized")
	}

	var lease model.SiteSyncLease
	acquired := false
	expiresAt := now.Add(ttl)
	err = database.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		query := tx.Where("name = ?", name)
		if tx.Dialector != nil && tx.Dialector.Name() != "sqlite" {
			query = query.Clauses(clause.Locking{Strength: "UPDATE"})
		}
		if err := query.First(&lease).Error; err != nil {
			return err
		}

		leaseIsLive := lease.Owner != "" && lease.ExpiresAt.After(now)
		sameOwner := lease.Owner == owner && lease.JobID == jobID
		if leaseIsLive && !sameOwner {
			return nil
		}

		if lease.Owner != "" && !sameOwner && lease.JobID > 0 {
			message := fmt.Sprintf("site sync lease expired and was acquired by job %d", jobID)
			if err := tx.Model(&model.SiteSyncJob{}).
				Where("id = ? AND status IN ? AND (lease_owner = ? OR lease_owner = '')", lease.JobID, []model.SiteSyncJobStatus{model.SiteSyncJobStatusQueued, model.SiteSyncJobStatusRunning}, lease.Owner).
				Updates(map[string]any{
					"status":           model.SiteSyncJobStatusFailed,
					"finished_at":      now,
					"heartbeat_at":     now,
					"lease_owner":      "",
					"lease_expires_at": nil,
					"error_message":    message,
					"updated_at":       now,
				}).Error; err != nil {
				return err
			}
		}

		updates := map[string]any{
			"owner":        owner,
			"job_id":       jobID,
			"acquired_at":  now,
			"heartbeat_at": now,
			"expires_at":   expiresAt,
			"updated_at":   now,
		}
		if err := tx.Model(&model.SiteSyncLease{}).Where("name = ?", name).Updates(updates).Error; err != nil {
			return err
		}
		lease.Name = name
		lease.Owner = owner
		lease.JobID = jobID
		lease.AcquiredAt = now
		lease.HeartbeatAt = now
		lease.ExpiresAt = expiresAt
		lease.UpdatedAt = now
		acquired = true
		return nil
	})
	if err != nil {
		return nil, false, err
	}
	return &lease, acquired, nil
}

// SiteSyncLeaseRenew extends a lease only while both the singleton row and the
// running job still belong to the same owner. Returning renewed=false means
// the worker must stop because another instance has taken over.
func SiteSyncLeaseRenew(ctx context.Context, name, owner string, jobID int, now time.Time, ttl time.Duration) (*model.SiteSyncLease, bool, error) {
	name, owner, now, err := normalizeSiteSyncLeaseInput(name, owner, jobID, now, ttl)
	if err != nil {
		return nil, false, err
	}
	database := db.GetDB()
	if database == nil {
		return nil, false, fmt.Errorf("database is not initialized")
	}
	expiresAt := now.Add(ttl)
	lease := &model.SiteSyncLease{
		Name:        name,
		Owner:       owner,
		JobID:       jobID,
		HeartbeatAt: now,
		ExpiresAt:   expiresAt,
		UpdatedAt:   now,
	}
	renewed := false
	err = database.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		leaseResult := tx.Model(&model.SiteSyncLease{}).
			Where("name = ? AND owner = ? AND job_id = ? AND expires_at > ?", name, owner, jobID, now).
			Updates(map[string]any{
				"heartbeat_at": now,
				"expires_at":   expiresAt,
				"updated_at":   now,
			})
		if leaseResult.Error != nil {
			return leaseResult.Error
		}
		if leaseResult.RowsAffected == 0 {
			return nil
		}

		jobResult := tx.Model(&model.SiteSyncJob{}).
			Where("id = ? AND lease_owner = ? AND status = ?", jobID, owner, model.SiteSyncJobStatusRunning).
			Updates(map[string]any{
				"heartbeat_at":     now,
				"lease_expires_at": expiresAt,
				"updated_at":       now,
			})
		if jobResult.Error != nil {
			return jobResult.Error
		}
		if jobResult.RowsAffected == 0 {
			return errSiteSyncLeaseJobOwnerMismatch
		}
		renewed = true
		return nil
	})
	if errors.Is(err, errSiteSyncLeaseJobOwnerMismatch) {
		return lease, false, nil
	}
	if err != nil {
		return nil, false, err
	}
	return lease, renewed, nil
}

func SiteSyncLeaseRelease(ctx context.Context, name, owner string, jobID int, now time.Time) (bool, error) {
	name = strings.TrimSpace(name)
	owner = strings.TrimSpace(owner)
	if name == "" || owner == "" || jobID <= 0 {
		return false, nil
	}
	if now.IsZero() {
		now = time.Now()
	}
	now = now.UTC()
	database := db.GetDB()
	if database == nil {
		return false, fmt.Errorf("database is not initialized")
	}
	result := database.WithContext(ctx).Model(&model.SiteSyncLease{}).
		Where("name = ? AND owner = ? AND job_id = ?", name, owner, jobID).
		Updates(map[string]any{
			"owner":        "",
			"job_id":       0,
			"heartbeat_at": now,
			"expires_at":   now,
			"updated_at":   now,
		})
	return result.RowsAffected > 0, result.Error
}

func SiteSyncLeaseGet(ctx context.Context, name string) (*model.SiteSyncLease, error) {
	database := db.GetDB()
	if database == nil {
		return nil, fmt.Errorf("database is not initialized")
	}
	var lease model.SiteSyncLease
	if err := database.WithContext(ctx).Where("name = ?", strings.TrimSpace(name)).First(&lease).Error; err != nil {
		return nil, err
	}
	return &lease, nil
}
