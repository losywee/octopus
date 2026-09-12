package migrate

import (
	"testing"

	"github.com/xuanli27/octopus/internal/model"
)

func TestMigrateSiteSyncLeaseCreatesSingletonRowAndIsIdempotent(t *testing.T) {
	db := openMigrationTestDB(t)

	if err := migrateSiteSyncLease(db); err != nil {
		t.Fatalf("migrateSiteSyncLease failed: %v", err)
	}
	if !db.Migrator().HasTable(&model.SiteSyncLease{}) {
		t.Fatal("expected site_sync_leases table")
	}
	if !db.Migrator().HasIndex("site_sync_leases", "idx_site_sync_leases_expires_at") {
		t.Fatal("expected expires_at index")
	}

	var leases []model.SiteSyncLease
	if err := db.Find(&leases).Error; err != nil {
		t.Fatalf("query seeded lease: %v", err)
	}
	if len(leases) != 1 || leases[0].Name != model.SiteSyncLeaseNameGlobal || leases[0].Owner != "" || leases[0].JobID != 0 {
		t.Fatalf("unexpected seeded lease rows: %+v", leases)
	}

	if err := migrateSiteSyncLease(db); err != nil {
		t.Fatalf("re-running migrateSiteSyncLease failed: %v", err)
	}
	var count int64
	if err := db.Model(&model.SiteSyncLease{}).Count(&count).Error; err != nil {
		t.Fatalf("count lease rows: %v", err)
	}
	if count != 1 {
		t.Fatalf("expected one singleton lease row after rerun, got %d", count)
	}
}
