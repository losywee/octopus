#!/usr/bin/env bash
# Local gate before pushing. Mimic CI + release critical path.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if command -v go >/dev/null 2>&1; then
  :
elif [ -x "$HOME/.local/share/mise/installs/go/1.25.0/bin/go" ]; then
  export PATH="$HOME/.local/share/mise/installs/go/1.25.0/bin:$PATH"
fi

echo "==> 1/6 Go test"
go test ./...

echo "==> 2/6 Go vet"
go vet ./...

echo "==> 3/6 Frontend typecheck"
(cd web && pnpm exec tsc --noEmit)

echo "==> 4/6 Frontend lint"
(cd web && pnpm run lint)

echo "==> 5/6 Release build (frontend + binaries + price update)"
bash scripts/build.sh release

if command -v podman >/dev/null 2>&1 || command -v docker >/dev/null 2>&1; then
  echo "==> 6/6 Container image smoke (linux/amd64 debian Dockerfile)"
  ENGINE=docker
  command -v podman >/dev/null 2>&1 && ENGINE=podman
  # Prefer prebuilt release binary path used by Dockerfiles
  if [ -f build/docker/linux/amd64/octopus ]; then
    $ENGINE build \
      -f scripts/dockerfiles/Dockerfile.debian \
      -t octopus:local-prepush \
      --build-arg TARGETPLATFORM=linux/amd64 \
      . >/tmp/octopus-podman-build.log 2>&1 \
      || { tail -40 /tmp/octopus-podman-build.log; exit 1; }
    echo "    container build OK ($ENGINE octopus:local-prepush)"
  else
    echo "    skip container smoke (missing build/docker/linux/amd64/octopus)"
  fi
else
  echo "==> 6/6 Container smoke skipped (no docker/podman)"
fi

echo
echo "✅ pre-push-check passed — safe to push"
