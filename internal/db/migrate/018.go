package migrate

import (
	"fmt"
	"strings"

	"github.com/xuanli27/octopus/internal/model"
	"gorm.io/gorm"
)

func init() {
	RegisterBeforeAutoMigration(Migration{
		Version: 18,
		Up:      migratePublicModelCaseInsensitiveName,
	})
}

// 018:
// - backfill public_models.name_lower
// - reject pre-existing case-insensitive name duplicates
// - create the database-level unique index before normal AutoMigrate runs
func migratePublicModelCaseInsensitiveName(db *gorm.DB) error {
	if db == nil {
		return fmt.Errorf("db is nil")
	}
	if !db.Migrator().HasTable(&model.PublicModel{}) {
		return nil
	}

	if !db.Migrator().HasColumn(&model.PublicModel{}, "NameLower") {
		if err := db.Migrator().AddColumn(&model.PublicModel{}, "NameLower"); err != nil {
			return fmt.Errorf("failed to add public_models.name_lower: %w", err)
		}
	}

	// Drop a partially-created index before backfilling so a failed migration
	// can be retried safely after duplicate names are corrected.
	if db.Migrator().HasIndex("public_models", "idx_public_model_name_lower") {
		if err := db.Migrator().DropIndex("public_models", "idx_public_model_name_lower"); err != nil {
			return fmt.Errorf("failed to drop public_models name_lower index: %w", err)
		}
	}

	if err := db.Exec("UPDATE public_models SET name_lower = LOWER(TRIM(name))").Error; err != nil {
		return fmt.Errorf("failed to backfill public_models.name_lower: %w", err)
	}

	type duplicateName struct {
		NameLower string
		Count     int64
	}
	var duplicates []duplicateName
	if err := db.Table("public_models").
		Select("name_lower, COUNT(*) AS count").
		Group("name_lower").
		Having("COUNT(*) > 1").
		Order("name_lower ASC").
		Find(&duplicates).Error; err != nil {
		return fmt.Errorf("failed to inspect public model name conflicts: %w", err)
	}
	if len(duplicates) > 0 {
		parts := make([]string, 0, len(duplicates))
		for _, duplicate := range duplicates {
			parts = append(parts, fmt.Sprintf("%q (%d rows)", duplicate.NameLower, duplicate.Count))
		}
		return fmt.Errorf("public model names conflict case-insensitively: %s", strings.Join(parts, ", "))
	}

	if err := db.Exec("CREATE UNIQUE INDEX idx_public_model_name_lower ON public_models(name_lower)").Error; err != nil {
		return fmt.Errorf("failed to create public_models name_lower unique index: %w", err)
	}
	return nil
}
