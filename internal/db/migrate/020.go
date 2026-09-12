package migrate

import (
	"fmt"
	"time"

	"github.com/xuanli27/octopus/internal/model"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

func init() {
	RegisterBeforeAutoMigration(Migration{
		Version: 20,
		Up:      migrateSiteSyncLease,
	})
}

// 020 creates the singleton database lease used to coordinate site-sync
// workers across application instances and seeds its first free row.
func migrateSiteSyncLease(db *gorm.DB) error {
	if db == nil {
		return fmt.Errorf("db is nil")
	}
	if !db.Migrator().HasTable(&model.SiteSyncLease{}) {
		if err := db.Migrator().CreateTable(&model.SiteSyncLease{}); err != nil {
			return fmt.Errorf("failed to create site_sync_leases: %w", err)
		}
	}
	seed := &model.SiteSyncLease{
		Name:      model.SiteSyncLeaseNameGlobal,
		ExpiresAt: time.Unix(0, 0).UTC(),
	}
	if err := db.Clauses(clause.OnConflict{DoNothing: true}).Create(seed).Error; err != nil {
		return fmt.Errorf("failed to seed site sync lease: %w", err)
	}
	return nil
}
