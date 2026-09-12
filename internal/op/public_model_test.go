package op

import (
	"strings"
	"testing"

	"github.com/xuanli27/octopus/internal/model"
)

func TestPublicModelAliasResolvesAndAutoGroups(t *testing.T) {
	setupAutoGroupTestDB(t)
	ctx := t.Context()

	if err := SettingSetString(model.SettingKeyAutoGroupNormalizeEnabled, "true"); err != nil {
		t.Fatalf("normalize: %v", err)
	}
	if err := SettingSetString(model.SettingKeyAutoGroupCreateMissingEnabled, "true"); err != nil {
		t.Fatalf("create missing: %v", err)
	}

	pm, err := PublicModelCreate(&model.PublicModelCreateRequest{
		Name:    "claude-3.5-sonnet",
		Aliases: []string{"claude-3-5-sonnet-20241022", "anthropic/claude-3.5-sonnet"},
	}, ctx)
	if err != nil {
		t.Fatalf("PublicModelCreate: %v", err)
	}
	if pm.Name != "claude-3.5-sonnet" || len(pm.Aliases) != 2 {
		t.Fatalf("unexpected public model: %+v", pm)
	}

	// Seed an existing group for the public name and attach via auto-group
	if err := GroupCreate(&model.Group{Name: "claude-3.5-sonnet", Mode: model.GroupModeRoundRobin}, ctx); err != nil {
		t.Fatalf("GroupCreate: %v", err)
	}

	ch := testChannel("alias-ch", "anthropic/claude-3-5-sonnet-20241022,gpt-4o-2024-08-06", model.AutoGroupTypeExact)
	if err := ChannelCreate(ch, ctx); err != nil {
		t.Fatalf("ChannelCreate: %v", err)
	}
	loaded, _ := ChannelGet(ch.ID, ctx)
	ChannelAutoGroupWithMode(loaded, model.AutoGroupTypeExact, ctx)

	groups, err := GroupList(ctx)
	if err != nil {
		t.Fatalf("GroupList: %v", err)
	}
	// expect claude group has anthropic upstream id; gpt-4o created by create-missing normalize
	var claudeOK, gptOK bool
	for _, g := range groups {
		names := groupModelNames(t, g.ID, ch.ID)
		switch strings.ToLower(g.Name) {
		case "claude-3.5-sonnet":
			if hasAllModels(names, "anthropic/claude-3-5-sonnet-20241022") {
				claudeOK = true
			}
		case "gpt-4o":
			if hasAllModels(names, "gpt-4o-2024-08-06") {
				gptOK = true
			}
		}
	}
	if !claudeOK {
		t.Fatalf("alias did not attach claude upstream into public group, groups=%+v", groups)
	}
	if !gptOK {
		t.Fatalf("normalize create-missing did not create/attach gpt-4o, groups=%+v", groups)
	}
}

func TestResolvePublicModelNamePriority(t *testing.T) {
	setupAutoGroupTestDB(t)
	ctx := t.Context()
	_, err := PublicModelCreate(&model.PublicModelCreateRequest{
		Name:    "gpt-4o",
		Aliases: []string{"gpt-4o-all", "openai/gpt-4o-fast"},
	}, ctx)
	if err != nil {
		t.Fatalf("create: %v", err)
	}
	idx, err := loadPublicAliasIndex(ctx)
	if err != nil {
		t.Fatalf("index: %v", err)
	}
	pub, via := ResolvePublicModelName("gpt-4o-all", idx, true)
	if pub != "gpt-4o" || via != "exact_alias" {
		t.Fatalf("got %q via %q", pub, via)
	}
	pub, via = ResolvePublicModelName("openai/gpt-4o-2024-08-06", idx, true)
	if pub != "gpt-4o" {
		t.Fatalf("normalize to dict public expected gpt-4o, got %q via %q", pub, via)
	}
}

func TestPublicModelListPendingAndSeed(t *testing.T) {
	setupAutoGroupTestDB(t)
	ctx := t.Context()

	ch := testChannel("pending-ch", "weird-model-xyz,gpt-4o-2024-08-06", model.AutoGroupTypeExact)
	if err := ChannelCreate(ch, ctx); err != nil {
		t.Fatalf("ChannelCreate: %v", err)
	}

	// Without dict, both pending (normalize may suggest gpt-4o)
	pending, err := PublicModelListPending(ctx)
	if err != nil {
		t.Fatalf("pending: %v", err)
	}
	if len(pending) < 1 {
		t.Fatalf("expected pending models, got %+v", pending)
	}

	n, err := PublicModelSeedCommon(ctx)
	if err != nil {
		t.Fatalf("seed: %v", err)
	}
	if n < 1 {
		t.Fatalf("expected seed created >0, got %d", n)
	}

	// After seed + normalize, gpt-4o variant should leave pending; weird remains
	pending2, err := PublicModelListPending(ctx)
	if err != nil {
		t.Fatalf("pending2: %v", err)
	}
	for _, p := range pending2 {
		if p.Upstream == "gpt-4o-2024-08-06" {
			// should be resolved if normalize maps into dict gpt-4o
			t.Fatalf("gpt-4o-2024-08-06 should be resolved via dict+normalize, still pending")
		}
	}
	var weirdOK bool
	for _, p := range pending2 {
		if p.Upstream == "weird-model-xyz" {
			weirdOK = true
		}
	}
	if !weirdOK {
		t.Fatalf("weird-model-xyz should still be pending, got %+v", pending2)
	}
}

func TestPublicModelAssignAlias(t *testing.T) {
	setupAutoGroupTestDB(t)
	ctx := t.Context()
	row, err := PublicModelAssignAlias("gpt-4o", "gpt-4o-all", ctx)
	if err != nil {
		t.Fatalf("assign create: %v", err)
	}
	if row.Name != "gpt-4o" {
		t.Fatalf("name %q", row.Name)
	}
	row2, err := PublicModelAssignAlias("gpt-4o", "openai/gpt-4o-fast", ctx)
	if err != nil {
		t.Fatalf("assign append: %v", err)
	}
	if len(row2.Aliases) < 2 {
		t.Fatalf("expected >=2 aliases, got %+v", row2.Aliases)
	}
}

func TestPublicModelImport(t *testing.T) {
	setupAutoGroupTestDB(t)
	ctx := t.Context()
	res, err := PublicModelImport([]model.PublicModelImportItem{
		{Name: "gpt-4o", Aliases: []string{"gpt-4o-all"}},
		{Name: "gpt-4o", Aliases: []string{"openai/gpt-4o"}},
		{Name: "", Aliases: []string{"x"}},
	}, ctx)
	if err != nil {
		t.Fatalf("import: %v", err)
	}
	if res.Created != 1 || res.Updated != 1 || res.Skipped != 1 {
		t.Fatalf("unexpected result %+v", res)
	}
	row, err := PublicModelGetByName("gpt-4o", ctx)
	if err != nil {
		t.Fatalf("get: %v", err)
	}
	if len(row.Aliases) < 2 {
		t.Fatalf("aliases %+v", row.Aliases)
	}
}

func TestPublicModelRejectsConflictingAliasesWithoutLeavingPartialRows(t *testing.T) {
	setupAutoGroupTestDB(t)
	ctx := t.Context()

	if _, err := PublicModelCreate(&model.PublicModelCreateRequest{
		Name:    "canonical-a",
		Aliases: []string{"upstream/model-a"},
	}, ctx); err != nil {
		t.Fatalf("seed model: %v", err)
	}

	_, err := PublicModelCreate(&model.PublicModelCreateRequest{
		Name:    "canonical-b",
		Aliases: []string{"UPSTREAM/MODEL-A"},
	}, ctx)
	if err == nil || !strings.Contains(strings.ToLower(err.Error()), "already belongs") {
		t.Fatalf("expected readable alias conflict, got %v", err)
	}
	if _, getErr := PublicModelGetByName("canonical-b", ctx); getErr == nil {
		t.Fatal("conflicting create left a partial public model row")
	}

	models, listErr := PublicModelList(ctx)
	if listErr != nil {
		t.Fatalf("list models: %v", listErr)
	}
	if len(models) != 1 {
		t.Fatalf("expected only seed model after rollback, got %d", len(models))
	}
}

func TestPublicModelRejectsNameAliasConflictsCaseInsensitively(t *testing.T) {
	setupAutoGroupTestDB(t)
	ctx := t.Context()

	if _, err := PublicModelCreate(&model.PublicModelCreateRequest{Name: "canonical-name"}, ctx); err != nil {
		t.Fatalf("seed name model: %v", err)
	}
	if _, err := PublicModelCreate(&model.PublicModelCreateRequest{
		Name:    "alias-owner",
		Aliases: []string{"legacy/model"},
	}, ctx); err != nil {
		t.Fatalf("seed alias model: %v", err)
	}

	_, err := PublicModelCreate(&model.PublicModelCreateRequest{
		Name:    "new-model",
		Aliases: []string{"CANONICAL-NAME"},
	}, ctx)
	if err == nil || !strings.Contains(strings.ToLower(err.Error()), "public model name") {
		t.Fatalf("expected alias/name conflict, got %v", err)
	}

	_, err = PublicModelCreate(&model.PublicModelCreateRequest{Name: "LEGACY/MODEL"}, ctx)
	if err == nil || !strings.Contains(strings.ToLower(err.Error()), "conflicts with alias") {
		t.Fatalf("expected name/alias conflict, got %v", err)
	}
}

func TestPublicModelUpdateConflictDoesNotReplaceExistingAliases(t *testing.T) {
	setupAutoGroupTestDB(t)
	ctx := t.Context()

	first, err := PublicModelCreate(&model.PublicModelCreateRequest{
		Name:    "first-model",
		Aliases: []string{"first-alias"},
	}, ctx)
	if err != nil {
		t.Fatalf("create first: %v", err)
	}
	if _, err := PublicModelCreate(&model.PublicModelCreateRequest{
		Name:    "second-model",
		Aliases: []string{"second-alias"},
	}, ctx); err != nil {
		t.Fatalf("create second: %v", err)
	}

	name := "SECOND-MODEL"
	aliases := []string{"replacement-alias"}
	_, err = PublicModelUpdate(&model.PublicModelUpdateRequest{
		ID:      first.ID,
		Name:    &name,
		Aliases: aliases,
	}, ctx)
	if err == nil || !strings.Contains(strings.ToLower(err.Error()), "existing public model") {
		t.Fatalf("expected update name conflict, got %v", err)
	}

	_, err = PublicModelUpdate(&model.PublicModelUpdateRequest{
		ID:      first.ID,
		Aliases: []string{"SECOND-ALIAS"},
	}, ctx)
	if err == nil || !strings.Contains(strings.ToLower(err.Error()), "already belongs") {
		t.Fatalf("expected update alias conflict, got %v", err)
	}

	unchanged, getErr := PublicModelGet(first.ID, ctx)
	if getErr != nil {
		t.Fatalf("get unchanged model: %v", getErr)
	}
	if unchanged.Name != "first-model" || len(unchanged.Aliases) != 1 || unchanged.Aliases[0].Alias != "first-alias" {
		t.Fatalf("conflicting update changed existing row: %+v", unchanged)
	}
}

func TestPublicModelDeduplicatesAliasesCaseInsensitively(t *testing.T) {
	setupAutoGroupTestDB(t)
	ctx := t.Context()

	row, err := PublicModelCreate(&model.PublicModelCreateRequest{
		Name:    "dedupe-model",
		Aliases: []string{" Foo ", "foo", "FOO", "bar"},
	}, ctx)
	if err != nil {
		t.Fatalf("create dedupe model: %v", err)
	}
	if len(row.Aliases) != 2 || row.Aliases[0].Alias != "Foo" || row.Aliases[1].Alias != "bar" {
		t.Fatalf("unexpected normalized aliases: %+v", row.Aliases)
	}
}
