package model

import "time"

const SiteSyncLeaseNameGlobal = "site-sync"

// SiteSyncLease is a database-backed singleton lease for a class of sync
// work. The primary key makes acquisition serialisable across application
// instances; owner tokens prevent an expired worker from updating a job after
// another instance has taken over.
type SiteSyncLease struct {
	Name        string    `json:"name" gorm:"primaryKey;size:64"`
	Owner       string    `json:"-" gorm:"type:varchar(96);not null;default:'';index"`
	JobID       int       `json:"job_id" gorm:"not null;default:0;index"`
	AcquiredAt  time.Time `json:"acquired_at"`
	HeartbeatAt time.Time `json:"heartbeat_at"`
	ExpiresAt   time.Time `json:"expires_at" gorm:"index"`
	CreatedAt   time.Time `json:"created_at"`
	UpdatedAt   time.Time `json:"updated_at"`
}
