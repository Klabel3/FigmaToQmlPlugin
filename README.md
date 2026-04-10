# Figma to QML Plugin

Convert Figma designs to QML code for Qt applications.

## Features

- 🔵 **Rectangle** → QML Rectangle (color, border, radius, shadow)
- 📝 **Text** → QML Text (font size, color, alignment, shadow)
- 📏 **Line** → QML Rectangle as line
- ⭕ **Ellipse** → QML Rectangle with radius
- 📋 Copy to clipboard
- 💾 Save as .qml file
- 🏷️ Preserves layer names as QML `id`

## Installation

1. Clone this repo
2. Run `npm install`
3. Run `npx tsc`
4. In Figma: Plugins → Development → Import plugin from manifest…
5. Select `manifest.json`

## Usage

1. Select any element in Figma
2. Run the plugin
3. Copy or save the generated QML code

## Roadmap

- [ ] Auto Layout (RowLayout / ColumnLayout)
- [ ] Gradients support
- [ ] AI-powered animation generation (Pro version)

## License

MIT