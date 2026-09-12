package model

import (
	"strings"
	"time"

	"gorm.io/gorm"
)

// PublicModel is a canonical public model name (client `model` / Group.Name).
// Upstream channels keep their raw model ids on GroupItem.ModelName.
type PublicModel struct {
	ID        int                `json:"id" gorm:"primaryKey"`
	Name      string             `json:"name" gorm:"uniqueIndex;size:191;not null"`
	NameLower string             `json:"-" gorm:"size:191;not null;default:'';uniqueIndex:idx_public_model_name_lower"`
	Enabled   bool               `json:"enabled" gorm:"default:true;index"`
	Note      string             `json:"note" gorm:"size:512"`
	Aliases   []PublicModelAlias `json:"aliases,omitempty" gorm:"foreignKey:PublicModelID"`
	CreatedAt time.Time          `json:"created_at"`
	UpdatedAt time.Time          `json:"updated_at"`
}

// BeforeSave keeps the database-level case-insensitive name key in sync for
// direct GORM creates/saves as well as the operation-layer writes.
func (m *PublicModel) BeforeSave(_ *gorm.DB) error {
	m.Name = strings.TrimSpace(m.Name)
	m.NameLower = strings.ToLower(m.Name)
	return nil
}

// PublicModelAlias maps an upstream model id (or variant spelling) to a PublicModel.
type PublicModelAlias struct {
	ID            int    `json:"id" gorm:"primaryKey"`
	PublicModelID int    `json:"public_model_id" gorm:"not null;index;uniqueIndex:idx_public_model_alias_unique,priority:1"`
	Alias         string `json:"alias" gorm:"not null;size:191;uniqueIndex:idx_public_model_alias_unique,priority:2"`
	// AliasLower is stored for case-insensitive exact lookup without DB-specific collations.
	AliasLower string    `json:"-" gorm:"not null;size:191;uniqueIndex:idx_public_model_alias_lower"`
	CreatedAt  time.Time `json:"created_at"`
}

// PublicModelCreateRequest creates a canonical name with optional aliases.
type PublicModelCreateRequest struct {
	Name    string   `json:"name" binding:"required"`
	Note    string   `json:"note"`
	Enabled *bool    `json:"enabled,omitempty"`
	Aliases []string `json:"aliases,omitempty"`
}

// PublicModelUpdateRequest patches a public model.
type PublicModelUpdateRequest struct {
	ID      int      `json:"id" binding:"required"`
	Name    *string  `json:"name,omitempty"`
	Note    *string  `json:"note,omitempty"`
	Enabled *bool    `json:"enabled,omitempty"`
	Aliases []string `json:"aliases,omitempty"` // if non-nil, replaces full alias set (use empty slice to clear)
}

// PublicModelResolveResult is a dry-run mapping for UI previews.
type PublicModelResolveResult struct {
	Upstream string `json:"upstream"`
	// Public is the canonical name if resolved; empty if unresolved.
	Public string `json:"public"`
	// Via: exact_alias | normalize | public_name | none
	Via string `json:"via"`
}

// PublicModelPendingItem is an upstream model id not yet mapped by the dictionary
// (for classification UI).
type PublicModelPendingItem struct {
	Upstream        string `json:"upstream"`
	ChannelID       int    `json:"channel_id"`
	ChannelName     string `json:"channel_name"`
	SuggestedPublic string `json:"suggested_public,omitempty"`
	Via             string `json:"via,omitempty"`
}

// PublicModelImportItem is one dictionary row for JSON import/export.
type PublicModelImportItem struct {
	Name    string   `json:"name"`
	Note    string   `json:"note,omitempty"`
	Aliases []string `json:"aliases,omitempty"`
	Enabled *bool    `json:"enabled,omitempty"`
}

// PublicModelImportResult summarizes import.
type PublicModelImportResult struct {
	Created int `json:"created"`
	Updated int `json:"updated"`
	Skipped int `json:"skipped"`
}
