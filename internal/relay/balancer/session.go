package balancer

import (
	"fmt"
	"strings"
	"sync"
	"time"
)

// SessionEntry 会话保持条目
type SessionEntry struct {
	ChannelID    int
	ChannelKeyID int
	Timestamp    time.Time
}

// 全局会话存储
var globalSession sync.Map // key: string -> value: *SessionEntry

// sessionKey 生成会话键：apiKeyID:requestModel
func sessionKey(apiKeyID int, requestModel string) string {
	return fmt.Sprintf("%d:%s", apiKeyID, requestModel)
}

// GetSticky 获取粘性通道（ttl 内有效）
// ttl 由 Group.SessionKeepTime 决定，返回 nil 表示无有效会话
func GetSticky(apiKeyID int, requestModel string, ttl time.Duration) *SessionEntry {
	key := sessionKey(apiKeyID, requestModel)
	v, ok := globalSession.Load(key)
	if !ok {
		return nil
	}
	entry := v.(*SessionEntry)

	if time.Since(entry.Timestamp) > ttl {
		// 过期，惰性清除
		globalSession.Delete(key)
		return nil
	}

	return entry
}

// SetSticky 写入/更新粘性记录
func SetSticky(apiKeyID int, requestModel string, channelID, keyID int) {
	key := sessionKey(apiKeyID, requestModel)
	globalSession.Store(key, &SessionEntry{
		ChannelID:    channelID,
		ChannelKeyID: keyID,
		Timestamp:    time.Now(),
	})
}

func DeleteSticky(apiKeyID int, requestModel string) {
	globalSession.Delete(sessionKey(apiKeyID, requestModel))
}

func resetStickyByChannel(channelID int) {
	globalSession.Range(func(key, value any) bool {
		entry, ok := value.(*SessionEntry)
		if ok && entry.ChannelID == channelID {
			globalSession.Delete(key)
		}
		return true
	})
}


// StickySnapshot is a read-only sticky-session view for runtime dashboards.
type StickySnapshot struct {
	APIKeyID     int       `json:"api_key_id"`
	RequestModel string    `json:"request_model"`
	ChannelID    int       `json:"channel_id"`
	ChannelKeyID int       `json:"channel_key_id"`
	AgeMS        int64     `json:"age_ms"`
}

// stickySnapshotMaxAge drops orphan sessions that no group still uses.
// GetSticky uses per-group TTL; listing has no group context, so we use a hard cap.
const stickySnapshotMaxAge = 24 * time.Hour

// ListStickySnapshots returns current sticky sessions, optionally filtered by channelID (0=all).
// Entries older than stickySnapshotMaxAge are lazily deleted.
func ListStickySnapshots(channelID int) []StickySnapshot {
	out := make([]StickySnapshot, 0)
	now := time.Now()
	globalSession.Range(func(key, value any) bool {
		entry, ok := value.(*SessionEntry)
		if !ok || entry == nil {
			globalSession.Delete(key)
			return true
		}
		age := now.Sub(entry.Timestamp)
		if age > stickySnapshotMaxAge || age < 0 {
			globalSession.Delete(key)
			return true
		}
		if channelID > 0 && entry.ChannelID != channelID {
			return true
		}
		k, _ := key.(string)
		// key format: apiKeyID:requestModel
		apiKeyID := 0
		requestModel := ""
		if parts := strings.SplitN(k, ":", 2); len(parts) == 2 {
			fmt.Sscanf(parts[0], "%d", &apiKeyID)
			requestModel = parts[1]
		}
		out = append(out, StickySnapshot{
			APIKeyID:     apiKeyID,
			RequestModel: requestModel,
			ChannelID:    entry.ChannelID,
			ChannelKeyID: entry.ChannelKeyID,
			AgeMS:        age.Milliseconds(),
		})
		return true
	})
	return out
}
