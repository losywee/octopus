package migrate

import (
	"testing"

	"github.com/xuanli27/octopus/internal/model"
)

func TestMigrateSiteSyncJobsCreatesDurableTableAndIndexes(t *testing.T) {
	db := openMigrationTestDB(t)

	if err := migrateSiteSyncJobs(db); err != nil {
		t.Fatalf("migrateSiteSyncJobs failed: %v", err)
	}
	if !db.Migrator().HasTable(&model.SiteSyncJob{}) {
		t.Fatal("expected site_sync_jobs table")
	}
	if !db.Migrator().HasIndex("site_sync_jobs", "idx_site_sync_jobs_status_created") {
		t.Fatal("expected status/created index")
	}
	if !db.Migrator().HasIndex("site_sync_jobs", "idx_site_sync_jobs_phase_created") {
		t.Fatal("expected phase/created index")
	}

	// The migration is intentionally safe to call again on an upgraded DB.
	if err := migrateSiteSyncJobs(db); err != nil {
		t.Fatalf("re-running migrateSiteSyncJobs failed: %v", err)
	}
}
