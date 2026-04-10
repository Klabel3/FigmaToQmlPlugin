figma.showUI(__html__, { width: 400, height: 550 });

// ========== ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ==========

function colorToHex(color: RGBA): string {
    const r = Math.round(color.r * 255);
    const g = Math.round(color.g * 255);
    const b = Math.round(color.b * 255);
    return ((r << 16) | (g << 8) | b).toString(16).padStart(6, '0');
}

function getSolidColor(paints: readonly Paint[] | typeof figma.mixed): string | null {
    if (paints && Array.isArray(paints) && paints.length > 0 && paints[0].type === 'SOLID') {
        return colorToHex(paints[0].color);
    }
    return null;
}

function getBorder(node: RectangleNode | EllipseNode): { color: string | null; width: number } {
    const strokes = node.strokes;
    let color: string | null = null;
    let width = 0;

    if (strokes && Array.isArray(strokes) && strokes.length > 0 && strokes[0].type === 'SOLID') {
        color = colorToHex(strokes[0].color);
        const strokeWeight = node.strokeWeight;
        width = (strokeWeight && strokeWeight !== figma.mixed) ? strokeWeight as number : 1;
    }

    return { color, width };
}

function getTextAlign(align: string | null): string {
    if (!align) return 'AlignLeft';
    const alignMap: Record<string, string> = {
        'left': 'AlignLeft',
        'center': 'AlignHCenter',
        'right': 'AlignRight',
        'justified': 'AlignJustify'
    };
    return alignMap[align.toLowerCase()] || 'AlignLeft';
}

function cleanNodeName(name: string): string {
    let cleaned = name
        .replace(/[_\-]/g, ' ')
        .replace(/[^a-zA-Z0-9\s]/g, '')
        .trim();

    if (!cleaned) return 'component';

    const words = cleaned.split(/\s+/);
    const result = words.map((word, index) => {
        if (index === 0) {
            return word.charAt(0).toLowerCase() + word.slice(1).toLowerCase();
        }
        return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    }).join('');

    if (result && /^\d/.test(result)) return 'component_' + result;
    return result;
}

// ========== ТЕНИ ==========

interface ShadowParams {
    offsetX: number;
    offsetY: number;
    radius: number;
    color: string;
}

function getShadowParams(node: any): ShadowParams | null {
    const effects = node.effects;
    if (!effects || !Array.isArray(effects)) {
        return null;
    }

    const dropShadow = effects.find((e: any) => e.type === 'DROP_SHADOW');
    if (!dropShadow) {
        return null;
    }

    const offsetX = dropShadow.offset?.x || 0;
    const offsetY = dropShadow.offset?.y || 0;
    const radius = dropShadow.radius || 0;
    const color = dropShadow.color;

    const r = Math.round(color.r * 255);
    const g = Math.round(color.g * 255);
    const b = Math.round(color.b * 255);
    const a = color.a;
    const hex = ((r << 16) | (g << 8) | b).toString(16).padStart(6, '0');
    const alphaHex = Math.round(a * 255).toString(16).padStart(2, '0');

    return {
        offsetX,
        offsetY,
        radius,
        color: `#${hex}${alphaHex}`
    };
}

function generateRectShadow(shadow: ShadowParams): string {
    return `
    layer.enabled: true
    layer.effect: DropShadow {
        horizontalOffset: ${shadow.offsetX}
        verticalOffset: ${shadow.offsetY}
        radius: ${shadow.radius}
        color: "${shadow.color}"
        samples: ${Math.min(shadow.radius * 2, 32)}
    }`;
}

function generateTextShadow(idName: string, shadow: ShadowParams): string {
    return `
DropShadow {
    anchors.fill: ${idName}
    source: ${idName}
    horizontalOffset: ${shadow.offsetX}
    verticalOffset: ${shadow.offsetY}
    radius: ${shadow.radius}
    samples: ${Math.min(shadow.radius * 2, 32)}
    color: "${shadow.color}"
}`;
}

// ========== ГЕНЕРАТОРЫ КОМПОНЕНТОВ ==========

function rectangleToQML(node: RectangleNode): string {
    const idName = cleanNodeName(node.name);
    let qml = `Rectangle {\n`;
    qml += `    id: ${idName}\n`;
    qml += `    width: ${node.width}\n`;
    qml += `    height: ${node.height}\n`;

    const fillColor = getSolidColor(node.fills);
    qml += `    color: "${fillColor || 'transparent'}"\n`;

    const border = getBorder(node);
    if (border.color) {
        qml += `    border.color: "#${border.color}"\n`;
        qml += `    border.width: ${border.width}\n`;
    }

    const cornerRadius = node.cornerRadius;
    if (cornerRadius && cornerRadius !== figma.mixed && cornerRadius > 0) {
        qml += `    radius: ${cornerRadius}\n`;
    }

    const shadow = getShadowParams(node);
    if (shadow) {
        qml += generateRectShadow(shadow);
    }

    qml += `}`;
    return qml;
}

function textToQML(node: TextNode): string {
    const idName = cleanNodeName(node.name);
    let qml = `Text {\n`;
    qml += `    id: ${idName}\n`;
    const escapedText = node.characters.replace(/"/g, '\\"');
    qml += `    text: "${escapedText}"\n`;

    const fontSize = node.fontSize;
    if (fontSize && fontSize !== figma.mixed) {
        qml += `    font.pixelSize: ${fontSize}\n`;
    }

    const textColor = getSolidColor(node.fills);
    if (textColor) {
        qml += `    color: "#${textColor}"\n`;
    }

    qml += `    horizontalAlignment: Text.${getTextAlign(node.textAlignHorizontal)}\n`;
    qml += `}`;

    const shadow = getShadowParams(node);
    if (shadow) {
        qml += generateTextShadow(idName, shadow);
    }

    return qml;
}

function lineToQML(node: LineNode): string {
    const idName = cleanNodeName(node.name);
    let qml = `Rectangle {\n`;
    qml += `    id: ${idName}\n`;

    if (node.width > node.height) {
        qml += `    width: ${node.width}\n`;
        qml += `    height: 2\n`;
    } else {
        qml += `    width: 2\n`;
        qml += `    height: ${node.height}\n`;
    }

    const strokes = node.strokes;
    let color = '#000000';
    if (strokes && Array.isArray(strokes) && strokes.length > 0 && strokes[0].type === 'SOLID') {
        color = `#${colorToHex(strokes[0].color)}`;
    }
    qml += `    color: "${color}"\n`;

    const shadow = getShadowParams(node);
    if (shadow) {
        qml += generateRectShadow(shadow);
    }

    qml += `}`;
    return qml;
}

function ellipseToQML(node: EllipseNode): string {
    const idName = cleanNodeName(node.name);
    let qml = `Rectangle {\n`;
    qml += `    id: ${idName}\n`;
    qml += `    width: ${node.width}\n`;
    qml += `    height: ${node.height}\n`;
    qml += `    radius: ${node.width / 2}\n`;

    const fillColor = getSolidColor(node.fills);
    qml += `    color: "${fillColor || 'transparent'}"\n`;

    const border = getBorder(node);
    if (border.color) {
        qml += `    border.color: "#${border.color}"\n`;
        qml += `    border.width: ${border.width}\n`;
    }

    const shadow = getShadowParams(node);
    if (shadow) {
        qml += generateRectShadow(shadow);
    }

    qml += `}`;
    return qml;
}

function getRequiredImports(qmlCode: string): string {
    let imports = 'import QtQuick 6.0\n';
    if (qmlCode.includes('DropShadow')) {
        imports += 'import QtGraphicalEffects 1.15\n';
    }
    return imports;
}

// ========== ОСНОВНОЙ КОД ПЛАГИНА ==========

figma.ui.onmessage = (msg) => {
    if (msg.type === 'get-selection') {
        const selection = figma.currentPage.selection;

        if (selection.length === 0) {
            figma.ui.postMessage({
                type: 'selection-info',
                error: 'Ничего не выбрано. Выделите элемент на канвасе.'
            });
            return;
        }

        const node = selection[0];
        let info = `Выбран: ${node.name} (${node.type})\n\n`;
        let qml = '';

        switch (node.type) {
            case 'RECTANGLE':
                qml = rectangleToQML(node as RectangleNode);
                info += '✅ Прямоугольник → QML:\n\n';
                break;
            case 'TEXT':
                qml = textToQML(node as TextNode);
                info += '✅ Текст → QML:\n\n';
                break;
            case 'LINE':
                qml = lineToQML(node as LineNode);
                info += '✅ Линия → QML:\n\n';
                break;
            case 'ELLIPSE':
                qml = ellipseToQML(node as EllipseNode);
                info += '✅ Круг/Эллипс → QML:\n\n';
                break;
            default:
                info += '⚠️ Поддерживаются: RECTANGLE, TEXT, LINE, ELLIPSE.\n';
                info += 'Выберите подходящий элемент.';
        }

        const fullQml = qml ? getRequiredImports(qml) + '\n' + qml : qml;

        figma.ui.postMessage({
            type: 'selection-info',
            info: info,
            qml: fullQml,
            nodeName: node.name
        });
    }
};