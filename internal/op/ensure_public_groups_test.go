package op

import (
	"testing"

	dbpkg "github.com/xuanli27/octopus/internal/db"
	"github.com/xuanli27/octopus/internal/model"
	"github.com/xuanli27/octopus/internal/transformer/outbound"
)

func TestEnsurePublicGroupsForSiteAccountCreatesNormalizedGroups(t *testing.T) {
	setupAutoGroupTestDB(t)
	ctx := t.Context()

	if err := SettingSetString(model.SettingKeyAutoGroupNormalizeEnabled, "true"); err != nil {
		t.Fatalf("enable normalize: %v", err)
	}

	site := &model.Site{Name: "s-ensure", BaseURL: "https://example.com", Platform: model.SitePlatformNewAPI, Enabled: true}
	if err := SiteCreate(site, ctx); err != nil {
		t.Fatalf("SiteCreate: %v", err)
	}
	account := &model.SiteAccount{
		SiteID:         site.ID,
		Name:           "acc",
		CredentialType: model.SiteCredentialTypeAccessToken,
		AccessToken:    "token",
		Enabled:        true,
	}
	if err := SiteAccountCreate(account, ctx); err != nil {
		t.Fatalf("SiteAccountCreate: %v", err)
	}

	channel := &model.Channel{
		Name:     "proj-ch",
		Type:     outbound.OutboundTypeOpenAIChat,
		Enabled:  true,
		BaseUrls: []model.BaseUrl{{URL: "https://example.com"}},
		Model:    "gpt-4o-2024-08-06,openai/gpt-4o-mini",
		Keys:     []model.ChannelKey{{ChannelKey: "sk-test", Enabled: true}},
	}
	if err := ChannelCreate(channel, ctx); err != nil {
		t.Fatalf("ChannelCreate: %v", err)
	}
	binding := model.SiteChannelBinding{
		SiteID:        site.ID,
		SiteAccountID: account.ID,
		GroupKey:      model.SiteDefaultGroupKey,
		ChannelID:     channel.ID,
	}
	if err := dbpkg.GetDB().WithContext(ctx).Create(&binding).Error; err != nil {
		t.Fatalf("create binding: %v", err)
	}

	result, err := EnsurePublicGroupsForSiteAccount(site.ID, account.ID, ctx)
	if err != nil {
		t.Fatalf("EnsurePublicGroupsForSiteAccount: %v", err)
	}
	if result.ChannelsProcessed != 1 {
		t.Fatalf("channels_processed=%d, want 1", result.ChannelsProcessed)
	}
	if result.GroupsCreated < 1 {
		t.Fatalf("expected groups created, got %+v", result)
	}

	groups, err := GroupList(ctx)
	if err != nil {
		t.Fatalf("GroupList: %v", err)
	}
	names := map[string]bool{}
	for _, g := range groups {
		names[g.Name] = true
	}
	if !names["gpt-4o"] || !names["gpt-4o-mini"] {
		t.Fatalf("expected normalized public groups, got names=%v result=%+v", names, result)
	}
}
