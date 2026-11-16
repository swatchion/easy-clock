UUID := easy-clock@swatchion.github.io
SRC_DIR := src
SCHEMA_DIR := $(SRC_DIR)/schemas
PO_DIR := po
DIST_DIR := dist
ZIP_FILE := $(DIST_DIR)/$(UUID).shell-extension.zip

.PHONY: all schema pack test test-shell prefs-sandbox nested install-local uninstall-local clean

all: pack

schema:
	glib-compile-schemas --strict $(SCHEMA_DIR)

pack: schema
	mkdir -p $(DIST_DIR)
	gnome-extensions pack $(SRC_DIR) \
		--extra-source=lib \
		--podir=../$(PO_DIR) \
		--gettext-domain=easy-clock \
		--force \
		--out-dir=$(DIST_DIR)

test: pack
	@echo "==> Checking packaged zip structure..."
	@unzip -l $(ZIP_FILE)
	@echo "==> Running isolated GJS unit & EGO compliance tests (GSETTINGS_BACKEND=memory)..."
	GSETTINGS_BACKEND=memory EASY_CLOCK_ROOT="$(CURDIR)" gjs -m tests/run-tests.js
	@echo "==> Running isolated GTK4/Libadwaita Preferences smoke check..."
	LD_LIBRARY_PATH=/usr/lib/gnome-shell GI_TYPELIB_PATH=/usr/lib/gnome-shell/girepository-1.0 GSETTINGS_BACKEND=memory EASY_CLOCK_ROOT="$(CURDIR)" EASY_CLOCK_PREFS_SMOKE=1 gjs -m scripts/open-prefs-sandbox.js

test-shell: pack
	chmod +x scripts/headless-shell-test.sh
	./scripts/headless-shell-test.sh

prefs-sandbox: schema
	LD_LIBRARY_PATH=/usr/lib/gnome-shell GI_TYPELIB_PATH=/usr/lib/gnome-shell/girepository-1.0 GSETTINGS_BACKEND=memory EASY_CLOCK_ROOT="$(CURDIR)" gjs -m scripts/open-prefs-sandbox.js

nested: pack
	chmod +x scripts/nested-shell.sh
	./scripts/nested-shell.sh

install-local: pack
	gnome-extensions install --force $(ZIP_FILE)

uninstall-local:
	-gnome-extensions uninstall $(UUID)

clean:
	rm -rf $(DIST_DIR) .sandbox $(SCHEMA_DIR)/gschemas.compiled
