#!/usr/bin/env bash
#
# Octopus multi-architecture build script.
#
# Usage:
#   scripts/build.sh build <os> <arch>   Build a single target (frontend + binary)
#   scripts/build.sh release             Build all release targets + archives + checksums
#   scripts/build.sh version             Print build metadata and exit
#   scripts/build.sh help                Show help
#
# Environment overrides:
#   JOBS=N            Parallel go builds during release (default: all CPU cores)
#   SKIP_FRONTEND=1   Reuse existing static/out instead of rebuilding the web app
#   SKIP_PRICE=1      Skip the model-price preset regeneration (needs network)
#
# Targets:
#   OS:   linux, windows, darwin, android
#   Arch: x86_64, arm64, armv7, x86
#
# Bash 3.2 compatible (macOS ships 3.2; pre-push-check.sh depends on this file).

# Exit on error/unset vars; ERR trap inherited by functions/subshells (-E)
set -Eeuo pipefail
trap 'handle_error $? $LINENO' ERR

# =============================================================================
# Configuration
# =============================================================================

readonly APP_NAME="octopus"
readonly MAIN_DIR="."
readonly OUTPUT_DIR="build"
readonly WEB_DIR="web"
readonly STATIC_OUT_DIR="static/out"
readonly MODULE_PATH="github.com/xuanli27/octopus"

readonly BUILD_TIME="$(date -u +'%F %T %z')"
readonly GIT_AUTHOR="xuanli27"
readonly GIT_VERSION="$(git describe --tags --abbrev=0 2>/dev/null || echo 'dev')"
readonly COMMIT_ID="$(git rev-parse --short HEAD 2>/dev/null || echo 'unknown')"

readonly LDFLAGS="-X '${MODULE_PATH}/internal/conf.Version=${GIT_VERSION}' \
-X '${MODULE_PATH}/internal/conf.BuildTime=${BUILD_TIME}' \
-X '${MODULE_PATH}/internal/conf.Author=${GIT_AUTHOR}' \
-X '${MODULE_PATH}/internal/conf.Commit=${COMMIT_ID}' \
-s -w"

# Release matrix: <os> <arch> pairs
readonly RELEASE_TARGETS=(
    "linux x86_64"
    "linux arm64"
    "linux armv7"
    "linux x86"
    "windows x86_64"
    "windows arm64"
    "darwin x86_64"
    "darwin arm64"
)

# =============================================================================
# Logging / error handling
# =============================================================================

log_info()    { echo "ℹ️  $1"; }
log_success() { echo "✅ $1"; }
log_error()   { echo "❌ $1" >&2; }
log_warning() { echo "⚠️  $1" >&2; }
log_step()    { echo ""; echo "🔧 $1"; echo "────────────────────────────────────────"; }

handle_error() {
    local exit_code="$1"
    local line_number="$2"
    log_error "Build failed at line ${line_number} with exit code ${exit_code}"
    log_error "Command that failed: $(sed -n "${line_number}p" "$0" | sed 's/^[[:space:]]*//')"
    log_error "Check the output above for more details"
    exit "$exit_code"
}

command_exists() { command -v "$1" >/dev/null 2>&1; }

# =============================================================================
# Environment setup
# =============================================================================

cpu_count() {
    if [ -n "${JOBS:-}" ] && [ "${JOBS}" -gt 0 ] 2>/dev/null; then
        echo "${JOBS}"
        return
    fi
    getconf _NPROCESSORS_ONLN 2>/dev/null || nproc 2>/dev/null || echo 4
}

prepare_environment() {
    log_step "Preparing build environment"

    # Required tools (only what this script actually uses)
    local tool
    for tool in go node pnpm python3 zip git; do
        if ! command_exists "${tool}"; then
            log_error "${tool} is not installed or not in PATH"
            return 1
        fi
    done
    local go_version
    go_version="$(go version 2>/dev/null)" || go_version="go (unknown version)"
    log_success "Required tools present: ${go_version}, node $(node --version), pnpm $(pnpm --version), $(python3 --version 2>/dev/null)"

    # Output directory structure
    local subdir
    for subdir in bin docker archives logs; do
        if ! mkdir -p "${OUTPUT_DIR}/${subdir}"; then
            log_error "Failed to create directory: ${OUTPUT_DIR}/${subdir}"
            return 1
        fi
    done
    log_success "Output directories ready under ${OUTPUT_DIR}/"

    # Download modules without mutating go.mod/go.sum (unlike `go mod tidy`)
    log_info "Downloading Go modules..."
    if ! go mod download >/dev/null 2>&1; then
        log_error "Failed to download Go modules"
        return 1
    fi

    log_success "Build environment ready"
}

# =============================================================================
# Frontend & price preset
# =============================================================================

build_frontend() {
    log_step "Building frontend"

    if [ "${SKIP_FRONTEND:-0}" = "1" ]; then
        if [ -f "${STATIC_OUT_DIR}/index.html" ]; then
            log_warning "SKIP_FRONTEND=1 — reusing existing ${STATIC_OUT_DIR}"
            return 0
        fi
        log_error "SKIP_FRONTEND=1 but ${STATIC_OUT_DIR}/index.html does not exist"
        log_error "Run a full build first, or create a placeholder: mkdir -p ${STATIC_OUT_DIR} && printf '<html></html>' > ${STATIC_OUT_DIR}/index.html"
        return 1
    fi

    if [ ! -d "${WEB_DIR}" ]; then
        log_error "Web directory not found: ${WEB_DIR} (run this script from the project root)"
        return 1
    fi

    log_info "Installing frontend dependencies..."
    if ! (cd "${WEB_DIR}" && pnpm install --frozen-lockfile); then
        log_error "Failed to install frontend dependencies"
        return 1
    fi

    log_info "Building frontend project..."
    if ! (cd "${WEB_DIR}" && NEXT_PUBLIC_APP_VERSION="${GIT_VERSION}" pnpm run build); then
        log_error "Failed to build frontend project"
        return 1
    fi

    if [ ! -f "${WEB_DIR}/out/index.html" ]; then
        log_error "Frontend output not found: ${WEB_DIR}/out/index.html"
        return 1
    fi

    # Swap embedded assets (go:embed all:out reads static/out)
    # Preserve the tracked .keep placeholder so fresh clones can `go build` 
    # before ever running a frontend build.
    local keep_file="${STATIC_OUT_DIR}/.keep"
    local keep_backup=""
    if [ -f "${keep_file}" ]; then
        keep_backup="${OUTPUT_DIR}/.keep.bak"
        mv "${keep_file}" "${keep_backup}"
    fi
    if [ -d "${STATIC_OUT_DIR}" ]; then
        rm -rf "${STATIC_OUT_DIR}"
    fi
    mv "${WEB_DIR}/out" "${STATIC_OUT_DIR}"
    if [ -n "${keep_backup}" ]; then
        mv "${keep_backup}" "${keep_file}"
    fi
    log_success "Frontend output moved to ${STATIC_OUT_DIR}"
}

update_price() {
    if [ "${SKIP_PRICE:-0}" = "1" ]; then
        log_warning "SKIP_PRICE=1 — skipping model price preset update"
        return 0
    fi

    log_step "Updating model price presets"
    if ! python3 scripts/updatePrice.py; then
        log_error "Failed to update price presets (needs network access to models.dev)"
        return 1
    fi
    log_success "Price presets updated"
}

# =============================================================================
# Go builds
# =============================================================================

get_go_arch() {
    case "$1" in
    x86_64) echo "amd64" ;;
    arm64)  echo "arm64" ;;
    x86)    echo "386" ;;
    armv7)  echo "arm" ;;
    *)      log_error "Unsupported architecture: $1"; return 1 ;;
    esac
}

# Extra Go env for special architectures (bash 3.2-safe: echoed KEY=VAL pairs)
get_go_arch_env() {
    case "$1" in
    armv7) echo "GOARM=7" ;;
    *)     return 0 ;;
    esac
}

binary_name() {
    # $1=os $2=arch -> octopus-<os>-<arch>[.exe]
    local name="${APP_NAME}-${1}-${2}"
    [ "$1" = "windows" ] && name="${name}.exe"
    echo "${name}"
}

# Build tags honoring HEADLESS=1 (no embedded admin UI, 10MB smaller)
build_tags() {
    local tags="jsoniter"
    [ "${HEADLESS:-0}" = "1" ] && tags="${tags} headless"
    echo "${tags}"
}

build_standard() {
    local os="$1"
    local arch="$2"
    local go_arch extra_env output_file tags ldflags

    if ! go_arch="$(get_go_arch "${arch}")"; then
        return 1
    fi
    extra_env="$(get_go_arch_env "${arch}")"

    output_file="${OUTPUT_DIR}/bin/$(binary_name "${os}" "${arch}")"
    tags="$(build_tags)"
    ldflags="${LDFLAGS}"
    if [ "${MINIMAL:-0}" = "1" ]; then
        ldflags="${ldflags} -buildid="
    fi

    log_info "Building ${os}/${arch} (tags: ${tags})..."

    # shellcheck disable=SC2086
    if ! env \
        GOOS="${os}" \
        GOARCH="${go_arch}" \
        CGO_ENABLED=0 \
        ${extra_env} \
        go build -trimpath -tags="${tags}" -ldflags="${ldflags}" -o "${output_file}" "${MAIN_DIR}"; then
        log_error "Failed to build ${os}/${arch}"
        return 1
    fi

    if [ ! -f "${output_file}" ]; then
        log_error "Build reported success but output missing: ${output_file}"
        return 1
    fi

    # Optional final compression (MINIMAL=1); unsupported targets are skipped
    if [ "${MINIMAL:-0}" = "1" ] && command_exists upx; then
        case "${os}/${go_arch}" in
        linux/amd64 | linux/arm64 | darwin/amd64 | darwin/arm64 | windows/amd64)
            if upx -q --best "${output_file}" >/dev/null 2>&1; then
                log_success "UPX compressed: $(basename "${output_file}")"
            else
                log_warning "UPX compression failed — binary left uncompressed"
            fi
            ;;
        *)
            log_info "UPX skipped: unsupported target ${os}/${go_arch}"
            ;;
        esac
    fi

    log_success "Built ${os}/${arch} → bin/$(basename "${output_file}")"
}

# Parallel batch builds for release. Args: "os arch" pairs (os1 arch1 os2 arch2 ...).
# Each build's console output is captured to build/logs/<os>-<arch>.log.
# Returns non-zero if any build failed (after building all of them).
build_all_targets() {
    local jobs
    jobs="$(cpu_count)"
    local total="$#"
    log_info "Building ${total} targets with up to ${jobs} parallel go builds"

    : >"${OUTPUT_DIR}/logs/.build-status"

    local idx=1
    while [ "$idx" -le "$total" ]; do
        local batch_pids=""
        local count=0

        # Launch one batch of up to $jobs builds
        while [ "$count" -lt "$jobs" ] && [ "$idx" -le "$total" ]; do
            local os arch
            eval "os=\${$idx}"
            idx=$((idx + 1))
            eval "arch=\${$idx}"
            idx=$((idx + 1))

            local label="${os}-${arch}"
            log_info "→ launching ${label}"
            (
                if build_standard "${os}" "${arch}" >"${OUTPUT_DIR}/logs/${label}.log" 2>&1; then
                    echo "OK ${label}" >>"${OUTPUT_DIR}/logs/.build-status"
                else
                    echo "FAIL ${label}" >>"${OUTPUT_DIR}/logs/.build-status"
                fi
            ) &
            batch_pids="${batch_pids} $!"
            count=$((count + 1))
        done

        # Drain the batch
        local pid
        for pid in ${batch_pids}; do
            wait "${pid}" || log_error "A build failed — see ${OUTPUT_DIR}/logs/"
        done
    done

    # Aggregate status
    local failed=0 entry
    while IFS= read -r entry; do
        case "${entry}" in
        FAIL*)
            log_error "Build failed: ${entry#FAIL } (log: ${OUTPUT_DIR}/logs/${entry#FAIL }.log)"
            failed=1
            ;;
        esac
    done <"${OUTPUT_DIR}/logs/.build-status"
    rm -f "${OUTPUT_DIR}/logs/.build-status"

    return "$failed"
}

# =============================================================================
# Release post-processing
# =============================================================================

prepare_docker_binaries() {
    log_step "Preparing Docker binaries"

    local docker_dir="${OUTPUT_DIR}/docker"
    mkdir -p "${docker_dir}" || { log_error "Failed to create ${docker_dir}"; return 1; }

    local platforms=(
        "x86_64:linux/amd64"
        "x86:linux/386"
        "armv7:linux/arm/v7"
        "arm64:linux/arm64"
    )

    local copied=0 platform arch docker_platform binary_name platform_dir
    for platform in "${platforms[@]}"; do
        arch="${platform%%:*}"
        docker_platform="${platform#*:}"
        binary_name="${APP_NAME}-linux-${arch}"
        platform_dir="${docker_dir}/${docker_platform}"

        if ! mkdir -p "${platform_dir}"; then
            log_warning "Failed to create ${platform_dir}, skipping ${docker_platform}"
            continue
        fi

        if [ -f "${OUTPUT_DIR}/bin/${binary_name}" ]; then
            if cp "${OUTPUT_DIR}/bin/${binary_name}" "${platform_dir}/${APP_NAME}"; then
                log_info "bin/${binary_name} → docker/${docker_platform}/${APP_NAME}"
                copied=$((copied + 1))
            else
                log_warning "Failed to copy ${binary_name} for ${docker_platform}"
            fi
        else
            log_warning "Binary not found (skipping ${docker_platform}): bin/${binary_name}"
        fi
    done

    if [ "$copied" -gt 0 ]; then
        log_success "Prepared ${copied} Docker binary directories in ${docker_dir}/"
    else
        log_warning "No Docker binaries prepared"
    fi
    return 0
}

generate_checksums() {
    log_step "Generating checksums"

    local bin_dir="${OUTPUT_DIR}/bin"
    if ! ls "${bin_dir}/${APP_NAME}-"* >/dev/null 2>&1; then
        log_info "No binaries in ${bin_dir}, skipping checksums"
        return 0
    fi

    local checksum_cmd
    if command_exists sha256sum; then
        checksum_cmd="sha256sum"
    elif command_exists shasum; then
        checksum_cmd="shasum -a 256" # BSD/macOS
    else
        log_error "Neither sha256sum nor shasum available"
        return 1
    fi

    # shellcheck disable=SC2046
    if (cd "${bin_dir}" && ${checksum_cmd} ${APP_NAME}-* > sha256.txt); then
        log_success "Generated $(ls "${bin_dir}/${APP_NAME}-"* | wc -l | tr -d ' ') checksums → bin/sha256.txt"
    else
        log_error "Failed to generate checksums"
        return 1
    fi
}

create_archives() {
    log_step "Creating distribution archives"

    local archives_dir="${OUTPUT_DIR}/archives"
    mkdir -p "${archives_dir}"

    # Stage docs alongside binaries so they land in every archive
    local doc
    for doc in README.md LICENSE; do
        [ -f "${doc}" ] && cp "${doc}" "${archives_dir}/"
    done

    local file base ext zip_name
    for file in "${OUTPUT_DIR}/bin/${APP_NAME}-"*; do
        [ -f "${file}" ] || continue
        base="$(basename "${file}")"
        case "${base}" in
        *.exe) ext=".exe" ;;
        *)     ext="" ;;
        esac
        zip_name="${base}.zip"

        # Stage under the final name, zip, then drop the staging copy
        cp "${file}" "${archives_dir}/${APP_NAME}${ext}"
        if (cd "${archives_dir}" && zip -q "${zip_name}" "${APP_NAME}${ext}" README.md LICENSE); then
            log_success "Archived: archives/${zip_name}"
        else
            log_warning "Failed to create archive: ${zip_name}"
        fi
        rm -f "${archives_dir}/${APP_NAME}${ext}"
    done

    # Remove staged docs
    rm -f "${archives_dir}/README.md" "${archives_dir}/LICENSE"

    log_success "Archives ready in ${archives_dir}/"
}

print_release_summary() {
    log_step "Release summary"
    echo "📦 ${APP_NAME} ${GIT_VERSION} (${COMMIT_ID})"
    echo "  • Binaries:   ${OUTPUT_DIR}/bin/"
    echo "  • Checksums:  ${OUTPUT_DIR}/bin/sha256.txt"
    echo "  • Docker:     ${OUTPUT_DIR}/docker/"
    echo "  • Archives:   ${OUTPUT_DIR}/archives/"
}

# =============================================================================
# CLI
# =============================================================================

show_usage() {
    cat <<EOF
Usage: $0 <command> [os] [arch]

Commands:
  release              Build all release targets, Docker binaries, archives, checksums
  build <os> <arch>    Build a single target (frontend + price + binary)
  bin <os> <arch>      Minimal binary-only build (reuses static/out, skips frontend/price)
  version              Print build metadata
  help                 Show this help

Supported OS:   linux, windows, darwin, android
Supported arch: x86_64, arm64, armv7, x86

Environment:
  JOBS=N            Parallel go builds during release (default: all cores)
  SKIP_FRONTEND=1   Reuse existing static/out (requires a previous full build)
  SKIP_PRICE=1      Skip price preset regeneration
  HEADLESS=1        (bin only) Exclude the embedded admin UI (-tags headless,
                    ~10MB smaller; server runs API-only, UI returns 404)
  MINIMAL=1         Strip build ID; compress with UPX when installed and the
                    target is supported (linux/amd64|arm64, darwin/*, windows/amd64)

Examples:
  $0 build windows x86_64
  $0 build darwin arm64
  SKIP_FRONTEND=1 $0 build linux x86_64
  HEADLESS=1 MINIMAL=1 $0 bin linux x86_64
  JOBS=4 SKIP_PRICE=1 $0 release
EOF
}

validate_os_arch() {
    local os="$1" arch="$2"
    case "${os}" in
    linux | windows | darwin | android) ;;
    *)
        log_error "Unsupported OS: ${os} (supported: linux, windows, darwin, android)"
        return 1
        ;;
    esac
    case "${arch}" in
    x86_64 | arm64 | armv7 | x86) ;;
    *)
        log_error "Unsupported architecture: ${arch} (supported: x86_64, arm64, armv7, x86)"
        return 1
        ;;
    esac
}

main() {
    case "${1:-}" in
    build)
        if [ $# -ne 3 ]; then
            log_error "Usage: $0 build <os> <arch>"
            show_usage
            exit 1
        fi
        validate_os_arch "$2" "$3" || exit 1

        log_step "Single platform build"
        echo "📦 ${APP_NAME} ${GIT_VERSION} (${COMMIT_ID}) for ${2}/${3}"

        prepare_environment
        build_frontend
        update_price
        build_standard "$2" "$3"

        log_step "Build completed"
        log_success "Binary ready: ${OUTPUT_DIR}/bin/$(binary_name "$2" "$3")"
        ;;

    bin)
        # Minimal binary-only build: no frontend rebuild, no price update,
        # no archives. Flags: HEADLESS=1 (no embedded UI), MINIMAL=1 (smaller).
        if [ $# -ne 3 ]; then
            log_error "Usage: $0 bin <os> <arch>"
            show_usage
            exit 1
        fi
        validate_os_arch "$2" "$3" || exit 1

        if ! command_exists go; then
            log_error "go is required for binary builds"
            exit 1
        fi

        local flavor="full"
        [ "${HEADLESS:-0}" = "1" ] && flavor="headless"
        [ "${MINIMAL:-0}" = "1" ] && flavor="${flavor} + minimal"

        log_step "Minimal binary build (${flavor})"
        echo "📦 ${APP_NAME} ${GIT_VERSION} (${COMMIT_ID}) for ${2}/${3}"

        mkdir -p "${OUTPUT_DIR}/bin" "${OUTPUT_DIR}/logs"

        if [ "${HEADLESS:-0}" != "1" ] && [ ! -f "${STATIC_OUT_DIR}/index.html" ]; then
            log_error "${STATIC_OUT_DIR}/index.html not found (required to embed the UI)"
            log_error "Run a full build first, use 'build' instead, or pass HEADLESS=1 to skip the UI"
            exit 1
        fi

        build_standard "$2" "$3"

        log_step "Build completed"
        log_success "Binary ready: ${OUTPUT_DIR}/bin/$(binary_name "$2" "$3")"
        ;;

    release)
        log_step "Release build"
        echo "📦 ${APP_NAME} ${GIT_VERSION} (${COMMIT_ID})"

        prepare_environment
        build_frontend
        update_price

        log_step "Building binaries"
        local build_failed=0
        # shellcheck disable=SC2086
        build_all_targets ${RELEASE_TARGETS[*]} || build_failed=1

        prepare_docker_binaries || log_warning "Docker binary prep failed, continuing"
        generate_checksums || log_warning "Checksum generation failed, continuing"
        create_archives || log_warning "Archive creation failed, continuing"

        print_release_summary
        if [ "$build_failed" -ne 0 ]; then
            log_error "One or more targets failed to build — see ${OUTPUT_DIR}/logs/"
            exit 1
        fi
        ;;

    version)
        echo "version:  ${GIT_VERSION}"
        echo "commit:   ${COMMIT_ID}"
        echo "built:    ${BUILD_TIME}"
        echo "author:   ${GIT_AUTHOR}"
        ;;

    help | -h | --help)
        show_usage
        ;;

    "")
        log_error "No command specified"
        show_usage
        exit 1
        ;;

    *)
        log_error "Unknown command: $1"
        show_usage
        exit 1
        ;;
    esac
}

main "$@"
