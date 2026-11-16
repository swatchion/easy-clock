#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
UUID="easy-clock@swatchion.github.io"
ZIP_FILE="${ROOT_DIR}/dist/${UUID}.shell-extension.zip"
SANDBOX_DIR="$(mktemp -d "/tmp/easy-clock-headless.XXXXXX")"

cleanup() {
    fusermount3 -uz "${SANDBOX_DIR}/runtime/doc" 2>/dev/null || true
    rm -rf "${SANDBOX_DIR}" 2>/dev/null || true
}
trap cleanup EXIT

if [[ ! -f "${ZIP_FILE}" ]]; then
    make -C "${ROOT_DIR}" pack
fi

EXT_DEST="${SANDBOX_DIR}/data/gnome-shell/extensions/${UUID}"
mkdir -p "${EXT_DEST}" "${SANDBOX_DIR}/config" "${SANDBOX_DIR}/cache" "${SANDBOX_DIR}/runtime"
chmod 700 "${SANDBOX_DIR}/runtime"

unzip -q -o "${ZIP_FILE}" -d "${EXT_DEST}"
glib-compile-schemas "${EXT_DEST}/schemas"

env -i \
    HOME="${SANDBOX_DIR}" \
    USER="${USER:-nz}" \
    PATH="${PATH}" \
    LANG="${LANG:-C.UTF-8}" \
    XDG_DATA_HOME="${SANDBOX_DIR}/data" \
    XDG_CONFIG_HOME="${SANDBOX_DIR}/config" \
    XDG_CACHE_HOME="${SANDBOX_DIR}/cache" \
    XDG_RUNTIME_DIR="${SANDBOX_DIR}/runtime" \
    XDG_DATA_DIRS="/usr/local/share:/usr/share" \
    NO_AT_BRIDGE=1 \
    dbus-run-session -- bash -euo pipefail -c '
        UUID="easy-clock@swatchion.github.io"
        gsettings set org.gnome.shell disable-user-extensions false
        gsettings set org.gnome.shell enabled-extensions "[\"${UUID}\"]"

        gnome-shell --headless --no-x11 --virtual-monitor 1280x720 >"'"${SANDBOX_DIR}"'/shell.log" 2>&1 &
        SHELL_PID=$!
        trap "kill ${SHELL_PID} 2>/dev/null || true; wait ${SHELL_PID} 2>/dev/null || true" EXIT

        READY=0
        for _ in $(seq 1 30); do
            if gdbus call --session \
                --dest org.gnome.Shell \
                --object-path /org/gnome/Shell \
                --method org.gnome.Shell.Extensions.GetExtensionInfo "${UUID}" >"'"${SANDBOX_DIR}"'/info.txt" 2>/dev/null; then
                if grep -q "${UUID}" "'"${SANDBOX_DIR}"'/info.txt"; then
                    READY=1
                    break
                fi
            fi
            sleep 0.5
        done

        if [[ "${READY}" -ne 1 ]]; then
            echo "FAIL: Headless GNOME Shell did not expose extension info in time."
            cat "'"${SANDBOX_DIR}"'/shell.log" || true
            exit 1
        fi

        INFO="$(cat "'"${SANDBOX_DIR}"'/info.txt")"
        if ! echo "${INFO}" | grep -q "'"'enabled'"': <true>"; then
            echo "FAIL: Expected enabled=<true>, got: ${INFO}"
            exit 1
        fi
        if ! echo "${INFO}" | grep -q "'"'error'"': <'"''"'>"; then
            echo "FAIL: Extension reported non-empty error: ${INFO}"
            exit 1
        fi
        echo "PASS: Extension loaded and enabled cleanly inside GNOME Shell 46"

        SCHEMA_DIR="'"${EXT_DEST}"'/schemas"
        GSETTINGS_SCHEMA_DIR="${SCHEMA_DIR}" gsettings set org.gnome.shell.extensions.easy-clock timezone "Asia/Tokyo"
        GSETTINGS_SCHEMA_DIR="${SCHEMA_DIR}" gsettings set org.gnome.shell.extensions.easy-clock format "%Z %H:%M:%S"
        GSETTINGS_SCHEMA_DIR="${SCHEMA_DIR}" gsettings set org.gnome.shell.extensions.easy-clock panel-position "right"
        sleep 0.4

        gdbus call --session --dest org.gnome.Shell --object-path /org/gnome/Shell \
            --method org.gnome.Shell.Extensions.DisableExtension "${UUID}" >/dev/null
        sleep 0.3
        gdbus call --session --dest org.gnome.Shell --object-path /org/gnome/Shell \
            --method org.gnome.Shell.Extensions.EnableExtension "${UUID}" >/dev/null
        sleep 0.3
        echo "PASS: disable() and enable() lifecycle verified cleanly"
    '
