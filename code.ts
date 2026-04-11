figma.showUI(__html__, { width: 400, height: 580 });

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

// ========== РАДИУСЫ (С УЧЁТОМ ВЕРСИИ QT) ==========

function getRadius(node: RectangleNode, qtVersion: string): {
    topLeft: number | null;
    topRight: number | null;
    bottomLeft: number | null;
    bottomRight: number | null;
    useIndividualRadii: boolean;
    warning: string | null;
} {
    const result = {
        topLeft: null as number | null,
        topRight: null as number | null,
        bottomLeft: null as number | null,
        bottomRight: null as number | null,
        useIndividualRadii: false,
        warning: null as string | null
    };

    const supportsIndividualRadii = qtVersion >= '6.7';

    if (supportsIndividualRadii && 'topLeftRadius' in node) {
        const tl = node.topLeftRadius;
        const tr = node.topRightRadius;
        const bl = node.bottomLeftRadius;
        const br = node.bottomRightRadius;

        // Если все радиусы одинаковые и больше 0
        if (tl !== undefined && tr !== undefined && bl !== undefined && br !== undefined &&
            tl === tr && tl === bl && tl === br && tl > 0) {
            result.topLeft = tl;
            return result;
        }

        // Если есть разные радиусы
        if ((tl !== undefined && tl > 0) || (tr !== undefined && tr > 0) ||
            (bl !== undefined && bl > 0) || (br !== undefined && br > 0)) {
            result.useIndividualRadii = true;
            result.topLeft = (tl !== undefined && tl > 0) ? tl : null;
            result.topRight = (tr !== undefined && tr > 0) ? tr : null;
            result.bottomLeft = (bl !== undefined && bl > 0) ? bl : null;
            result.bottomRight = (br !== undefined && br > 0) ? br : null;
            return result;
        }
    }

    // Fallback к старому способу
    const cornerRadius = node.cornerRadius;
    if (cornerRadius && cornerRadius !== figma.mixed && cornerRadius > 0) {
        result.topLeft = cornerRadius;
    } else if (cornerRadius === 0 || cornerRadius === figma.mixed) {
        // Проверяем, есть ли разные радиусы в старых версиях Qt
        if ('topLeftRadius' in node) {
            const tl = node.topLeftRadius;
            const tr = node.topRightRadius;
            const bl = node.bottomLeftRadius;
            const br = node.bottomRightRadius;

            if ((tl !== undefined && tl > 0) || (tr !== undefined && tr > 0) ||
                (bl !== undefined && bl > 0) || (br !== undefined && br > 0)) {
                result.warning = `    // WARNING: Different corner radii detected (tl:${tl || 0}, tr:${tr || 0}, bl:${bl || 0}, br:${br || 0})\n    // Your Qt version (${qtVersion}) doesn't support individual corner radii\n    // Consider upgrading to Qt 6.7+ or manually implement using Shape\n`;
            }
        }
    }

    return result;
}

// ========== ГЕНЕРАТОРЫ КОМПОНЕНТОВ ==========

function rectangleToQML(node: RectangleNode, qtVersion: string): string {
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

    // Радиусы с учётом версии Qt
    const radius = getRadius(node, qtVersion);
    if (radius.warning) {
        qml += radius.warning;
    }
    if (radius.useIndividualRadii) {
        if (radius.topLeft !== null) qml += `    topLeftRadius: ${radius.topLeft}\n`;
        if (radius.topRight !== null) qml += `    topRightRadius: ${radius.topRight}\n`;
        if (radius.bottomLeft !== null) qml += `    bottomLeftRadius: ${radius.bottomLeft}\n`;
        if (radius.bottomRight !== null) qml += `    bottomRightRadius: ${radius.bottomRight}\n`;
    } else if (radius.topLeft !== null) {
        qml += `    radius: ${radius.topLeft}\n`;
    }

    const shadow = getShadowParams(node);
    if (shadow) {
        qml += generateRectShadow(shadow);
    }

    qml += `}`;
    return qml;
}

function textToQML(node: TextNode, qtVersion: string): string {
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

function lineToQML(node: LineNode, qtVersion: string): string {
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

function ellipseToQML(node: EllipseNode, qtVersion: string): string {
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

function getRequiredImports(qmlCode: string, qtVersion: string): string {
    // Определяем правильный импорт в зависимости от версии
    let imports = '';
    if (qtVersion.startsWith('5.')) {
        imports = `import QtQuick ${qtVersion}\n`;
    } else {
        imports = `import QtQuick ${qtVersion}\n`;
    }

    if (qmlCode.includes('DropShadow')) {
        imports += 'import QtGraphicalEffects 1.15\n';
    }

    return imports;
}

// ========== ОСНОВНОЙ КОД ПЛАГИНА ==========

figma.ui.onmessage = (msg) => {
    if (msg.type === 'get-selection') {
        const selection = figma.currentPage.selection;
        const qtVersion = msg.qtVersion || '6.0';

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
                qml = rectangleToQML(node as RectangleNode, qtVersion);
                info += '✅ Прямоугольник → QML:\n\n';
                break;
            case 'TEXT':
                qml = textToQML(node as TextNode, qtVersion);
                info += '✅ Текст → QML:\n\n';
                break;
            case 'LINE':
                qml = lineToQML(node as LineNode, qtVersion);
                info += '✅ Линия → QML:\n\n';
                break;
            case 'ELLIPSE':
                qml = ellipseToQML(node as EllipseNode, qtVersion);
                info += '✅ Круг/Эллипс → QML:\n\n';
                break;
            default:
                info += '⚠️ Поддерживаются: RECTANGLE, TEXT, LINE, ELLIPSE.\n';
                info += 'Выберите подходящий элемент.';
        }

        const fullQml = qml ? getRequiredImports(qml, qtVersion) + '\n' + qml : qml;

        figma.ui.postMessage({
            type: 'selection-info',
            info: info,
            qml: fullQml,
            nodeName: node.name,
            qtVersion: qtVersion
        });
    }
};