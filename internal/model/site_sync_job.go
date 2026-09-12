package model

import "time"

// SiteSyncJobStatus describes the durable lifecycle of a site sync batch.
// Runtime progress is still exposed by sitesync's in-process tracker; this
// record is the restart-safe history and the hand-off point for future
// distributed workers.
type SiteSyncJobStatus string

const (
	SiteSyncJobStatusQueued   SiteSyncJobStatus = "queued"
	SiteSyncJobStatusRunning  SiteSyncJobStatus = "running"
	SiteSyncJobStatusSuccess  SiteSyncJobStatus = "success"
	SiteSyncJobStatusPartial  SiteSyncJobStatus = "partial"
	SiteSyncJobStatusFailed   SiteSyncJobStatus = "failed"
	SiteSyncJobStatusCanceled SiteSyncJobStatus = "canceled"
	SiteSyncJobStatusSkipped  SiteSyncJobStatus = "skipped"
)

// SiteSyncJob stores one full or account-scoped model synchronization run.
// Counts are snapshots of the corresponding SiteBatchSummary counters, so a
// UI can show useful progress even after the worker process has restarted.
type SiteSyncJob struct {
	ID             int               `json:"id" gorm:"primaryKey"`
	Phase          string            `json:"phase" gorm:"type:varchar(16);not null;index:idx_site_sync_jobs_phase_created,priority:1"`
	Trigger        string            `json:"trigger" gorm:"type:varchar(16);not null"`
	Status         SiteSyncJobStatus `json:"status" gorm:"type:varchar(16);not null;index:idx_site_sync_jobs_status_created,priority:1"`
	Total          int               `json:"total" gorm:"not null;default:0"`
	Attempted      int               `json:"attempted" gorm:"not null;default:0"`
	Success        int               `json:"success" gorm:"not null;default:0"`
	Partial        int               `json:"partial" gorm:"not null;default:0"`
	Failed         int               `json:"failed" gorm:"not null;default:0"`
	Skipped        int               `json:"skipped" gorm:"not null;default:0"`
	Warnings       int               `json:"warnings" gorm:"not null;default:0"`
	Canceled       bool              `json:"canceled" gorm:"not null;default:false"`
	BlockedByJobID int               `json:"blocked_by_job_id,omitempty" gorm:"not null;default:0;index"`

	CancelReason string `json:"cancel_reason,omitempty" gorm:"type:varchar(64)"`
	ErrorMessage string `json:"error_message,omitempty" gorm:"type:text"`
	LeaseOwner   string `json:"-" gorm:"type:varchar(96);not null;default:'';index"`

	StartedAt      *time.Time `json:"started_at,omitempty"`
	HeartbeatAt    *time.Time `json:"heartbeat_at,omitempty"`
	LeaseExpiresAt *time.Time `json:"lease_expires_at,omitempty"`
	FinishedAt     *time.Time `json:"finished_at,omitempty"`
	DurationMS     int64      `json:"duration_ms" gorm:"not null;default:0"`
	CreatedAt      time.Time  `json:"created_at" gorm:"index:idx_site_sync_jobs_status_created,priority:2;index:idx_site_sync_jobs_phase_created,priority:2"`
	UpdatedAt      time.Time  `json:"updated_at"`
}
