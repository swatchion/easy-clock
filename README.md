# Easy Clock

A lightweight GNOME Shell extension (45 / 46 / 47) that displays an independent clock in the top bar with a customizable timezone and `strftime` format.

## Features

- **Independent Timezone**: Search and pick any IANA timezone from `/usr/share/zoneinfo` or enter a fixed UTC offset (e.g. `UTC`, `Europe/London`, `Asia/Tokyo`, `+08:00`).
- **Custom `strftime` Format**: Customize output using `GLib.DateTime.format()` specifiers (e.g. `%Z %H:%M`, `%H:%M:%S`, `%m-%d %H:%M`) and an optional prefix.
- **Configurable Top Bar Placement**: Place the clock in the `left`, `center`, or `right` panel box with adjustable index ordering.
- **Click to Configure**: Click the clock in the top bar to open Preferences directly.

## Build & Install

```bash
# Package extension into dist/easy-clock@swatchion.github.io.shell-extension.zip
make pack

# Install locally
make install-local
```

## Development & Isolated Testing

```bash
make test          # Run isolated unit tests and GTK4/Libadwaita prefs check
make test-shell    # Run headless GNOME Shell lifecycle integration test
make prefs-sandbox # Preview Preferences UI in an isolated memory backend
make nested        # Launch an isolated nested Wayland GNOME Shell session
```

## License

[MIT](LICENSE)
