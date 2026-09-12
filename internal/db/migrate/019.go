package migrate

import (
	"fmt"

	"github.com/xuanli27/octopus/internal/model"
	"gorm.io/gorm"
)

func init() {
	RegisterBeforeAutoMigration(Migration{
		Version: 19,
		Up:      migrateSiteSyncJobs,
	})
}

// 019 creates the durable site-sync job table before the regular model
// migration. AutoMigrate still owns additive columns on later upgrades; the
// explicit create keeps first boot and old databases on the same path.
func migrateSiteSyncJobs(db *gorm.DB) error {
	if db == nil {
		return fmt.Errorf("db is nil")
	}
	if db.Migrator().HasTable(&model.SiteSyncJob{}) {
		return nil
	}
	if err := db.Migrator().CreateTable(&model.SiteSyncJob{}); err != nil {
		return fmt.Errorf("failed to create site_sync_jobs: %w", err)
	}
	return nil
}
