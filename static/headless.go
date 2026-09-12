//go:build headless

package static

import (
	"embed"
	"io/fs"
)

// Headless build (-tags headless): no admin UI is embedded.
// The server still serves the full REST/proxy API; management UI returns 404.

// Zero-value embed.FS acts as an empty filesystem.
var staticFS embed.FS

// StaticFS 返回空的文件系统（headless 构建不嵌入前端产物）
var StaticFS, _ = fs.Sub(staticFS, "out")
