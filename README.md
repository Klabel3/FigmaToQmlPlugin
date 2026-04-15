# Figma to QML Plugin

![License](https://img.shields.io/badge/license-MIT-blue)
![TypeScript](https://img.shields.io/badge/TypeScript-5.0-blue)
![Figma](https://img.shields.io/badge/Figma-Plugin-green)

🔗 **GitHub:** [github.com/Klabel3/figma-to-qml](https://github.com/Klabel3/FigmaToQmlPlugin.git)

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


## ⚠️ Known Limitations

### Groups vs Frames

**Groups have limited support.** Coordinates of child elements inside a Group may be incorrect when exported.

**Why?** In Figma, Groups use absolute positioning for their children, while Frames use relative positioning. The plugin's positioning logic is optimized for Frames.

**Recommendation:** Use **Frames** instead of Groups for better results. Select a Group and press `Ctrl+Shift+G` (or `Cmd+Shift+G` on Mac) to convert it to a Frame, or manually replace Groups with Frames in your design.

Groups will still work, but the generated QML code may have unexpected `x` and `y` values for nested elements.