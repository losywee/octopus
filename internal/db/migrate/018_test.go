package migrate

import (
	"strings"
	"testing"

	"github.com/xuanli27/octopus/internal/model"
)

func TestMigratePublicModelCaseInsensitiveNameCreatesUniqueIndex(t *testing.T) {
	db := openMigrationTestDB(t)
	statements := []string{
		"CREATE TABLE public_models (id INTEGER PRIMARY KEY, name TEXT NOT NULL, enabled BOOLEAN NOT NULL DEFAULT TRUE, note TEXT)",
		"INSERT INTO public_models (id, name, enabled, note) VALUES (1, 'GPT-4o', 1, '')",
		"INSERT INTO public_models (id, name, enabled, note) VALUES (2, 'claude-sonnet', 1, '')",
	}
	for _, statement := range statements {
		if err := db.Exec(statement).Error; err != nil {
			t.Fatalf("seed migration test db failed: %v", err)
		}
	}
	if err := migratePublicModelCaseInsensitiveName(db); err != nil {
		t.Fatalf("migration returned error: %v", err)
	}
	if !db.Migrator().HasColumn("public_models", "name_lower") {
		t.Fatal("expected name_lower column")
	}
	if !db.Migrator().HasIndex("public_models", "idx_public_model_name_lower") {
		t.Fatal("expected case-insensitive unique index")
	}

	var lowerNames []string
	if err := db.Table("public_models").Order("id ASC").Pluck("name_lower", &lowerNames).Error; err != nil {
		t.Fatalf("query backfilled names: %v", err)
	}
	if len(lowerNames) != 2 || lowerNames[0] != "gpt-4o" || lowerNames[1] != "claude-sonnet" {
		t.Fatalf("unexpected backfilled names: %+v", lowerNames)
	}

	if err := db.Exec("INSERT INTO public_models (id, name, name_lower, enabled, note) VALUES (3, 'gPt-4O', 'gpt-4o', 1, '')").Error; err == nil {
		t.Fatal("expected case-insensitive unique index to reject duplicate name")
	}
}

func TestMigratePublicModelCaseInsensitiveNameReportsExistingDuplicates(t *testing.T) {
	db := openMigrationTestDB(t)
	if err := db.Exec("CREATE TABLE public_models (id INTEGER PRIMARY KEY, name TEXT NOT NULL, enabled BOOLEAN NOT NULL DEFAULT TRUE, note TEXT)").Error; err != nil {
		t.Fatalf("create migration test table: %v", err)
	}
	if err := db.Exec("INSERT INTO public_models (id, name, enabled, note) VALUES (1, 'GPT-4o', 1, ''), (2, 'gpt-4O', 1, '')").Error; err != nil {
		t.Fatalf("seed duplicate names: %v", err)
	}

	err := migratePublicModelCaseInsensitiveName(db)
	if err == nil || !strings.Contains(strings.ToLower(err.Error()), "conflict") {
		t.Fatalf("expected readable duplicate-name error, got %v", err)
	}
}

func TestPublicModelNameLowerAutoMigrateEnforcesFreshDatabaseUniqueness(t *testing.T) {
	db := openMigrationTestDB(t)
	if err := db.AutoMigrate(&model.PublicModel{}); err != nil {
		t.Fatalf("auto migrate public model: %v", err)
	}

	first := &model.PublicModel{Name: " GPT-4o ", Enabled: true}
	if err := db.Create(first).Error; err != nil {
		t.Fatalf("create first model: %v", err)
	}
	if first.Name != "GPT-4o" || first.NameLower != "gpt-4o" {
		t.Fatalf("before-save normalization failed: %+v", first)
	}
	if err := db.Create(&model.PublicModel{Name: "gPt-4O", Enabled: true}).Error; err == nil {
		t.Fatal("expected fresh database unique index to reject case-insensitive duplicate")
	}
}
