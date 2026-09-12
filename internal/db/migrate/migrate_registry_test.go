package migrate

import (
	"testing"

	"gorm.io/gorm"
)

func TestMigrationRegistriesRemainReusableAcrossDatabases(t *testing.T) {
	original := beforeAutoMigrations
	originalAfter := afterAutoMigrations
	t.Cleanup(func() {
		beforeAutoMigrations = original
		afterAutoMigrations = originalAfter
	})

	calls := 0
	beforeAutoMigrations = []Migration{{
		Version: 999999901,
		Up: func(_ *gorm.DB) error {
			calls++
			return nil
		},
	}}

	first := openMigrationTestDB(t)
	if err := BeforeAutoMigrate(first); err != nil {
		t.Fatalf("first database migration failed: %v", err)
	}
	if err := BeforeAutoMigrate(first); err != nil {
		t.Fatalf("repeated first database migration failed: %v", err)
	}
	second := openMigrationTestDB(t)
	if err := BeforeAutoMigrate(second); err != nil {
		t.Fatalf("second database migration failed: %v", err)
	}

	if calls != 2 {
		t.Fatalf("expected migration once per database, got %d calls", calls)
	}

	afterCalls := 0
	afterAutoMigrations = []Migration{{
		Version: 999999902,
		Up: func(_ *gorm.DB) error {
			afterCalls++
			return nil
		},
	}}
	third := openMigrationTestDB(t)
	if err := AfterAutoMigrate(third); err != nil {
		t.Fatalf("first after-auto migration failed: %v", err)
	}
	if err := AfterAutoMigrate(third); err != nil {
		t.Fatalf("repeated after-auto migration failed: %v", err)
	}
	fourth := openMigrationTestDB(t)
	if err := AfterAutoMigrate(fourth); err != nil {
		t.Fatalf("second after-auto migration failed: %v", err)
	}
	if afterCalls != 2 {
		t.Fatalf("expected after migration once per database, got %d calls", afterCalls)
	}
}
