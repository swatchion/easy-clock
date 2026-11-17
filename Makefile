UUID := easy-clock@swatchion.github.io
SRC_DIR := src
SCHEMA_DIR := $(SRC_DIR)/schemas
PO_DIR := po
DIST_DIR := dist
SANDBOX_EXT_DIR := .sandbox/ext
ZIP_FILE := $(DIST_DIR)/$(UUID).shell-extension.zip

.PHONY: all schema pack unpack-sandbox test test-shell prefs-sandbox nested install-local uninstall-local clean

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

unpack-sandbox: pack
	rm -rf $(SANDBOX_EXT_DIR)
	mkdir -p $(SANDBOX_EXT_DIR)
	unzip -q -o $(ZIP_FILE) -d $(SANDBOX_EXT_DIR)
	glib-compile-schemas --strict $(SANDBOX_EXT_DIR)/schemas

test: unpack-sandbox
	@echo "==> Checking packaged zip structure..."
	@unzip -l $(ZIP_FILE)
	@echo "==> Running isolated GJS unit, i18n & EGO compliance tests (GSETTINGS_BACKEND=memory)..."
	GSETTINGS_BACKEND=memory EASY_CLOCK_ROOT="$(CURDIR)" EASY_CLOCK_EXT_DIR="$(CURDIR)/$(SANDBOX_EXT_DIR)" gjs -m tests/run-tests.js
	@echo "==> Verifying GTK4/Libadwaita Preferences UI in Chinese (zh_CN)..."
	LC_ALL= LC_MESSAGES= LANG=C.UTF-8 LANGUAGE=zh_CN LD_LIBRARY_PATH=/usr/lib/gnome-shell GI_TYPELIB_PATH=/usr/lib/gnome-shell/girepository-1.0 GSETTINGS_BACKEND=memory EASY_CLOCK_ROOT="$(CURDIR)" EASY_CLOCK_EXT_DIR="$(CURDIR)/$(SANDBOX_EXT_DIR)" EASY_CLOCK_PREFS_SMOKE=1 EASY_CLOCK_EXPECT_TITLE="简易时钟" EASY_CLOCK_EXPECT_PAGE_TITLE="时钟设置" gjs -m scripts/open-prefs-sandbox.js
	@echo "==> Verifying GTK4/Libadwaita Preferences UI in English (en_US:zh_CN)..."
	LC_ALL= LC_MESSAGES= LANG=C.UTF-8 LANGUAGE=en_US:zh_CN LD_LIBRARY_PATH=/usr/lib/gnome-shell GI_TYPELIB_PATH=/usr/lib/gnome-shell/girepository-1.0 GSETTINGS_BACKEND=memory EASY_CLOCK_ROOT="$(CURDIR)" EASY_CLOCK_EXT_DIR="$(CURDIR)/$(SANDBOX_EXT_DIR)" EASY_CLOCK_PREFS_SMOKE=1 EASY_CLOCK_EXPECT_TITLE="Easy Clock" EASY_CLOCK_EXPECT_PAGE_TITLE="Clock Settings" gjs -m scripts/open-prefs-sandbox.js
	@echo "==> Verifying GTK4/Libadwaita Preferences UI fallback to English for unmatched locale (ja_JP)..."
	LC_ALL= LC_MESSAGES= LANG=C.UTF-8 LANGUAGE=ja_JP LD_LIBRARY_PATH=/usr/lib/gnome-shell GI_TYPELIB_PATH=/usr/lib/gnome-shell/girepository-1.0 GSETTINGS_BACKEND=memory EASY_CLOCK_ROOT="$(CURDIR)" EASY_CLOCK_EXT_DIR="$(CURDIR)/$(SANDBOX_EXT_DIR)" EASY_CLOCK_PREFS_SMOKE=1 EASY_CLOCK_EXPECT_TITLE="Easy Clock" EASY_CLOCK_EXPECT_PAGE_TITLE="Clock Settings" gjs -m scripts/open-prefs-sandbox.js

test-shell: pack
	chmod +x scripts/headless-shell-test.sh
	./scripts/headless-shell-test.sh

prefs-sandbox: unpack-sandbox
	LD_LIBRARY_PATH=/usr/lib/gnome-shell GI_TYPELIB_PATH=/usr/lib/gnome-shell/girepository-1.0 GSETTINGS_BACKEND=memory EASY_CLOCK_ROOT="$(CURDIR)" EASY_CLOCK_EXT_DIR="$(CURDIR)/$(SANDBOX_EXT_DIR)" gjs -m scripts/open-prefs-sandbox.js

nested: pack
	chmod +x scripts/nested-shell.sh
	./scripts/nested-shell.sh

install-local: pack
	gnome-extensions install --force $(ZIP_FILE)

uninstall-local:
	-gnome-extensions uninstall $(UUID)

clean:
	rm -rf $(DIST_DIR) .sandbox $(SCHEMA_DIR)/gschemas.compiled
