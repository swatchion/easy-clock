#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
UUID="easy-clock@swatchion.github.io"
ZIP_FILE="${ROOT_DIR}/dist/${UUID}.shell-extension.zip"
SANDBOX_DIR="${ROOT_DIR}/.sandbox"

if [[ ! -f "${ZIP_FILE}" ]]; then
    make -C "${ROOT_DIR}" pack
fi

rm -rf "${SANDBOX_DIR}"
EXT_DEST="${SANDBOX_DIR}/data/gnome-shell/extensions/${UUID}"
mkdir -p "${EXT_DEST}" "${SANDBOX_DIR}/config" "${SANDBOX_DIR}/cache" "${SANDBOX_DIR}/runtime"
chmod 700 "${SANDBOX_DIR}/runtime"

unzip -q -o "${ZIP_FILE}" -d "${EXT_DEST}"
glib-compile-schemas "${EXT_DEST}/schemas"

export XDG_DATA_HOME="${SANDBOX_DIR}/data"
export XDG_CONFIG_HOME="${SANDBOX_DIR}/config"
export XDG_CACHE_HOME="${SANDBOX_DIR}/cache"
export MUTTER_DEBUG_DUMMY_MODE_SPECS="${MUTTER_DEBUG_DUMMY_MODE_SPECS:-1280x720}"

exec dbus-run-session -- bash -c "
    gsettings set org.gnome.shell disable-user-extensions false
    gsettings set org.gnome.shell enabled-extensions \"['${UUID}']\"
    exec gnome-shell --nested --wayland
"
