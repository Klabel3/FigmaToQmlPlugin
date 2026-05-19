figma.showUI(__html__, { width: 400, height: 580 });

// ========== ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ==========

function colorToHex(color: RGBA, withAlpha: boolean = true): string {
    const r = Math.round(color.r * 255);
    const g = Math.round(color.g * 255);
    const b = Math.round(color.b * 255);

    const rgb = ((r << 16) | (g << 8) | b).toString(16).padStart(6, '0');

    return rgb;
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

function getRequiredImports(qmlCode: string, qtVersion: string, hasLayouts: boolean = false): string {
    let imports = `import QtQuick ${qtVersion}\n`;
    // Добавляем импорт Layouts, если в коде есть RowLayout или ColumnLayout
    if (hasLayouts || qmlCode.includes('RowLayout') || qmlCode.includes('ColumnLayout')) {
        imports += `import QtQuick.Layouts ${qtVersion === '5.15' ? '1.15' : qtVersion}\n`;
    }
    if (qmlCode.includes('DropShadow')) {
        imports += 'import QtGraphicalEffects 1.15\n';
    }
    return imports;
}

function injectLayoutAlignment(childQML: string, alignment: string): string {
    const lines = childQML.split('\n');
    for (let i = lines.length - 1; i >= 0; i--) {
        if (lines[i].trim() === '}') {
            lines.splice(i, 0, `    Layout.alignment: ${alignment}`);
            break;
        }
    }
    let result = lines.join('\n');
    if (!result.endsWith('\n')) result += '\n';
    return result;
}

// Очистка имени от спецсимволов
function sanitizeName(name: string): string {
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

// Генерация уникального id на основе имени узла и множества использованных id
function generateUniqueId(baseName: string, usedIds: Set<string>): string {
    let candidate = sanitizeName(baseName);
    let finalId = candidate;
    let counter = 1;
    while (usedIds.has(finalId)) {
        finalId = `${candidate}_${counter++}`;
    }
    usedIds.add(finalId);
    return finalId;
}

function hasImageFill(node: RectangleNode): boolean {
    const fills = node.fills;
    if (!fills || !Array.isArray(fills) || fills.length === 0) return false;
    return fills.some(fill => fill.type === 'IMAGE');
}

// Возвращает цвет (hex без #) и альфу для заливки
function getSolidColorWithAlpha(paints: readonly Paint[] | typeof figma.mixed): { color: string | null; alpha: number } {
    if (paints && Array.isArray(paints) && paints.length > 0 && paints[0].type === 'SOLID') {
        return {
            color: colorToHex(paints[0].color),
            alpha: paints[0].opacity !== undefined ? paints[0].opacity : 1
        };
    }
    return { color: null, alpha: 1 };
}

// Возвращает цвет (hex без #) и альфу для обводки (border)
function getStrokeColorWithAlpha(node: RectangleNode | EllipseNode): { color: string | null; width: number; alpha: number } {
    const strokes = node.strokes;
    let color: string | null = null;
    let width = 0;
    let alpha = 1;
    if (strokes && Array.isArray(strokes) && strokes.length > 0 && strokes[0].type === 'SOLID') {
        color = colorToHex(strokes[0].color);
        const strokeWeight = node.strokeWeight;
        width = (strokeWeight && strokeWeight !== figma.mixed) ? strokeWeight as number : 1;
        alpha = strokes[0].opacity !== undefined ? strokes[0].opacity : 1;
    }
    return { color, width, alpha };
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
    if (!effects || !Array.isArray(effects)) return null;

    const dropShadow = effects.find((e: any) => e.type === 'DROP_SHADOW');
    if (!dropShadow) return null;

    const offsetX = dropShadow.offset?.x || 0;
    const offsetY = dropShadow.offset?.y || 0;
    const radius = dropShadow.radius || 0;
    const color = dropShadow.color;

    const hex = colorToHex(color);
    const alpha = color.a !== undefined ? color.a : 1;
    const alphaHex = Math.round(alpha * 255).toString(16).padStart(2, '0');

    return {
        offsetX,
        offsetY,
        radius,
        color: `#${alphaHex}${hex}`
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
    }\n`;
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

function rectangleToQML(
    node: RectangleNode,
    qtVersion: string,
    relX: number = 0,
    relY: number = 0,
    isRoot: boolean = false,
    isInsideLayout: boolean = false,
    usedIds: Set<string>
): string {
    const idName = generateUniqueId(node.name, usedIds);
    let qml = `Rectangle {\n`;
    qml += `    id: ${idName}\n`;

    if (!isInsideLayout && !isRoot) {
        qml += `    x: ${relX}\n`;
        qml += `    y: ${relY}\n`;
    }

    qml += `    width: ${node.width}\n`;
    qml += `    height: ${node.height}\n`;

    const fill = getSolidColorWithAlpha(node.fills);
    if (fill.color) {
        qml += `    color: "#${fill.color}"\n`;
        if (fill.alpha < 0.999) qml += `    opacity: ${fill.alpha.toFixed(2)}\n`;
    } else {
        qml += `    color: "transparent"\n`;
    }

    const stroke = getStrokeColorWithAlpha(node);
    if (stroke.color) {
        if (stroke.alpha < 0.999) {
            const alphaHex = Math.round(stroke.alpha * 255).toString(16).padStart(2, '0');
            qml += `    border.color: "#${alphaHex}${stroke.color}"\n`;
        } else {
            qml += `    border.color: "#${stroke.color}"\n`;
        }
        qml += `    border.width: ${stroke.width}\n`;
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

    qml += `}\n`;
    return qml;
}

function textToQML(
    node: TextNode,
    qtVersion: string,
    relX: number = 0,
    relY: number = 0,
    isRoot: boolean = false,
    isInsideLayout: boolean = false,
    usedIds: Set<string>
): string {
    const idName = generateUniqueId(node.name, usedIds);
    let qml = `Text {\n`;
    qml += `    id: ${idName}\n`;

    if (!isInsideLayout && !isRoot) {
        qml += `    x: ${relX}\n`;
        qml += `    y: ${relY}\n`;
    }

    const escapedText = node.characters.replace(/"/g, '\\"');
    qml += `    text: "${escapedText}"\n`;

    const fontSize = node.fontSize;
    if (fontSize && fontSize !== figma.mixed) {
        qml += `    font.pixelSize: ${fontSize}\n`;
    }

    const fontName = node.fontName;
    if (fontName && fontName !== figma.mixed) {
        const family = fontName.family;
        const style = fontName.style;
        const escapedFamily = family.replace(/"/g, '\\"');
        qml += `    font.family: "${escapedFamily}"\n`;
        if (style && style.toLowerCase().includes('italic')) {
            qml += `    font.italic: true\n`;
        }
    }

    const fontWeight = node.fontWeight;
    if (fontWeight && fontWeight !== figma.mixed) {
        let weightString = 'Font.Normal';
        if (fontWeight >= 700) weightString = 'Font.Bold';
        else if (fontWeight <= 300) weightString = 'Font.Light';
        else if (fontWeight >= 500) weightString = 'Font.Medium';
        qml += `    font.weight: ${weightString}\n`;
    }

    const fill = getSolidColorWithAlpha(node.fills);
    if (fill.color) {
        qml += `    color: "#${fill.color}"\n`;
        if (fill.alpha < 0.999) qml += `    opacity: ${fill.alpha.toFixed(2)}\n`;
    }

    qml += `    horizontalAlignment: Text.${getTextAlign(node.textAlignHorizontal)}\n`;

    const verticalAlign = node.textAlignVertical;
    if (verticalAlign) {
        const vAlignMap: Record<string, string> = {
            'TOP': 'AlignTop',
            'CENTER': 'AlignVCenter',
            'BOTTOM': 'AlignBottom'
        };
        const vAlign = vAlignMap[verticalAlign] || 'AlignVCenter';
        qml += `    verticalAlignment: Text.${vAlign}\n`;
    }

    qml += `}\n`;

    const shadow = getShadowParams(node);
    if (shadow) {
        qml += generateTextShadow(idName, shadow);
    }

    return qml;
}

function lineToQML(
    node: LineNode,
    qtVersion: string,
    relX: number = 0,
    relY: number = 0,
    isRoot: boolean = false,
    isInsideLayout: boolean = false,
    usedIds: Set<string>
): string {
    const idName = generateUniqueId(node.name, usedIds);
    let qml = `Rectangle {\n`;
    qml += `    id: ${idName}\n`;

    if (!isInsideLayout && !isRoot) {
        qml += `    x: ${relX}\n`;
        qml += `    y: ${relY}\n`;
    }

    if (node.width > node.height) {
        qml += `    width: ${node.width}\n`;
        qml += `    height: 2\n`;
    } else {
        qml += `    width: 2\n`;
        qml += `    height: ${node.height}\n`;
    }

    const strokes = node.strokes;
    let color = '#000000';
    let alpha = 1;
    if (strokes && Array.isArray(strokes) && strokes.length > 0 && strokes[0].type === 'SOLID') {
        color = `#${colorToHex(strokes[0].color)}`;
        alpha = strokes[0].opacity !== undefined ? strokes[0].opacity : 1;
    }
    qml += `    color: "${color}"\n`;
    if (alpha < 0.999) qml += `    opacity: ${alpha.toFixed(2)}\n`;

    const shadow = getShadowParams(node);
    if (shadow) {
        qml += generateRectShadow(shadow);
    }

    qml += `}\n`;
    return qml;
}

function ellipseToQML(node: EllipseNode,
    qtVersion: string,
    relX: number = 0,
    relY: number = 0,
    isRoot: boolean = false,
    isInsideLayout: boolean = false,
    usedIds: Set<string>
): string {
    const idName = generateUniqueId(node.name, usedIds);
    let qml = `Rectangle {\n`;
    qml += `    id: ${idName}\n`;

    if (!isInsideLayout && !isRoot) {
        qml += `    x: ${relX}\n`;
        qml += `    y: ${relY}\n`;
    }

    qml += `    width: ${node.width}\n`;
    qml += `    height: ${node.height}\n`;
    qml += `    radius: ${node.width / 2}\n`;

    const fill = getSolidColorWithAlpha(node.fills);
    if (fill.color) {
        qml += `    color: "#${fill.color}"\n`;
        if (fill.alpha < 0.999) qml += `    opacity: ${fill.alpha.toFixed(2)}\n`;
    } else {
        qml += `    color: "transparent"\n`;
    }

    const stroke = getStrokeColorWithAlpha(node);
    if (stroke.color) {
        if (stroke.alpha < 0.999) {
            const alphaHex = Math.round(stroke.alpha * 255).toString(16).padStart(2, '0');
            qml += `    border.color: "#${alphaHex}${stroke.color}"\n`;
        } else {
            qml += `    border.color: "#${stroke.color}"\n`;
        }
        qml += `    border.width: ${stroke.width}\n`;
    }

    const shadow = getShadowParams(node);
    if (shadow) {
        qml += generateRectShadow(shadow);
    }

    qml += `}\n`;
    return qml;
}

function imageToQML(
    node: RectangleNode,
    qtVersion: string,
    relX: number = 0,
    relY: number = 0,
    isRoot: boolean = false,
    isInsideLayout: boolean = false,
    usedIds: Set<string>
): string {
    const idName = generateUniqueId(node.name, usedIds);
    let qml = `Image {\n`;
    qml += `    id: ${idName}\n`;

    if (!isInsideLayout && !isRoot) {
        qml += `    x: ${relX}\n`;
        qml += `    y: ${relY}\n`;
    }

    qml += `    width: ${node.width}\n`;
    qml += `    height: ${node.height}\n`;

    // Рекомендация по имени файла (можно взять из имени узла)
    const suggestedName = idName;
    qml += `    // Export image from Figma as PNG and place in 'images/' folder\n`;
    qml += `    source: "images/${suggestedName}.png"\n`;
    qml += `    fillMode: Image.PreserveAspectFit\n`;
    qml += `}\n`;

    return qml;
}

function vectorToQMLImage(
    node: SceneNode, // VECTOR, BOOLEAN_OPERATION, STAR, POLYGON и т.д.
    qtVersion: string,
    relX: number = 0,
    relY: number = 0,
    isRoot: boolean = false,
    isInsideLayout: boolean = false,
    usedIds: Set<string>
): string {
    const idName = generateUniqueId(node.name, usedIds);
    let qml = `Image {\n`;
    qml += `    id: ${idName}\n`;

    if (!isInsideLayout && !isRoot) {
        qml += `    x: ${relX}\n`;
        qml += `    y: ${relY}\n`;
    }

    qml += `    width: ${node.width}\n`;
    qml += `    height: ${node.height}\n`;

    const suggestedName = sanitizeName(node.name) || 'vector';
    qml += `    // Export vector from Figma as SVG and place in 'images/' folder\n`;
    qml += `    // Right-click on "${node.name}" → Export → SVG\n`;
    qml += `    source: "images/${suggestedName}.svg"\n`;
    qml += `    fillMode: Image.PreserveAspectFit\n`;
    qml += `}\n`;

    return qml;
}

function autoLayoutToQML(
    node: FrameNode,
    qtVersion: string,
    relX: number = 0,
    relY: number = 0,
    isRoot: boolean = false,
    isInsideLayout: boolean = false,
    usedIds: Set<string>
): string {
    const idName = generateUniqueId(node.name, usedIds);
    const isHorizontal = node.layoutMode === 'HORIZONTAL';
    const layoutType = isHorizontal ? 'RowLayout' : 'ColumnLayout';

    let qml = `${layoutType} {\n`;
    qml += `    id: ${idName}\n`;

    if (!isRoot && !isInsideLayout) {
        qml += `    x: ${relX}\n`;
        qml += `    y: ${relY}\n`;
    }

    qml += `    width: ${node.width}\n`;
    qml += `    height: ${node.height}\n`;

    if (node.itemSpacing && node.itemSpacing > 0) {
        qml += `    spacing: ${node.itemSpacing}\n`;
    }

    if (node.children && node.children.length > 0) {
        const alignment = isHorizontal ? 'Qt.AlignVCenter' : 'Qt.AlignHCenter';
        for (const child of node.children) {
            let childQML = generateQMLForNode(child, qtVersion, node.x, node.y, false, true, usedIds);
            if (childQML) {
                childQML = injectLayoutAlignment(childQML, alignment);
                const indentedQML = childQML.split('\n').map(line => '    ' + line).join('\n');
                qml += indentedQML;
            }
        }
    }

    qml += `}\n`;
    return qml;
}

function generateQMLForNode(
    node: SceneNode,
    qtVersion: string,
    parentX: number = 0,
    parentY: number = 0,
    isRoot: boolean = true,
    isInsideLayout: boolean = false,
    usedIds: Set<string>
): string | null {
    let relX, relY;

    if (isRoot) {
        relX = 0;
        relY = 0;
    } else {
        if (node.parent?.type === 'GROUP') {
            // Для Group: координаты детей абсолютные, вычитаем координаты родительского Group
            relX = node.x - parentX;
            relY = node.y - parentY;
        } else {
            // Для Frame и прочих: координаты детей уже относительные
            relX = node.x;
            relY = node.y;
        }
    }

    switch (node.type) {
        case 'RECTANGLE':
            const rectNode = node as RectangleNode;
            if (hasImageFill(rectNode)) {
                return imageToQML(rectNode, qtVersion, relX, relY, isRoot && node.parent?.type !== 'GROUP', isInsideLayout, usedIds);
            } else {
                return rectangleToQML(rectNode, qtVersion, relX, relY, isRoot && node.parent?.type !== 'GROUP', isInsideLayout, usedIds);
            }
        case 'TEXT':
            return textToQML(node as TextNode, qtVersion, relX, relY, isRoot && node.parent?.type !== 'GROUP', isInsideLayout, usedIds);
        case 'LINE':
            return lineToQML(node as LineNode, qtVersion, relX, relY, isRoot && node.parent?.type !== 'GROUP', isInsideLayout, usedIds);
        case 'ELLIPSE':
            return ellipseToQML(node as EllipseNode, qtVersion, relX, relY, isRoot && node.parent?.type !== 'GROUP', isInsideLayout, usedIds);
        case 'VECTOR':
        case 'BOOLEAN_OPERATION':
        case 'STAR':
        case 'POLYGON':
            return vectorToQMLImage(node, qtVersion, relX, relY, isRoot && node.parent?.type !== 'GROUP', isInsideLayout, usedIds);
        case 'FRAME':
        case 'GROUP':
            return frameToQML(node as FrameNode | GroupNode, qtVersion, relX, relY, isRoot, isInsideLayout, usedIds);
        default:
            const unsupportedComment = `\n    // Unsupported node: "${node.name}" (type: ${node.type})\n    // This element was not converted. Consider manual implementation.\n\n`;
            console.warn(`Unsupported node type: ${node.type} (name: ${node.name})`);
            return unsupportedComment;
    }
}

function frameToQML(
    node: FrameNode | GroupNode,
    qtVersion: string,
    relX: number = 0,
    relY: number = 0,
    isRoot: boolean = false,
    isInsideLayout: boolean = false,
    usedIds: Set<string>
): string {
    const idName = generateUniqueId(node.name, usedIds);

    let hasAutoLayout = false;
    if (node.type === 'FRAME') {
        const frameNode = node as FrameNode;
        hasAutoLayout = frameNode.layoutMode && frameNode.layoutMode !== 'NONE';
    }

    if (hasAutoLayout) {
        return autoLayoutToQML(node as FrameNode, qtVersion, relX, relY, isRoot, isInsideLayout, usedIds);
    }

    let qml = `Item {\n`;
    qml += `    id: ${idName}\n`;
    if (node.type === 'GROUP') {
        qml += `    // NOTE: Group support is limited. Consider converting to Frame.\n`;
    }
    if (!isInsideLayout && !isRoot) {
        qml += `    x: ${relX}\n`;
        qml += `    y: ${relY}\n`;
    }
    qml += `    width: ${node.width}\n`;
    qml += `    height: ${node.height}\n`;

    console.log("Node data:", node);
    if (node.children && node.children.length > 0) {
        for (const child of node.children) {
            const childQML = generateQMLForNode(child, qtVersion, node.x, node.y, false, isInsideLayout, usedIds);
            if (childQML) {
                const indentedQML = childQML.split('\n').map(line => '    ' + line).join('\n');
                qml += indentedQML;
                if (!qml.endsWith('\n')) qml += '\n';
            }
        }
    }

    qml += `}\n`;
    return qml;
}

// ========== ОСНОВНОЙ КОД ПЛАГИНА ==========

figma.ui.onmessage = (msg) => {
    if (msg.type === 'get-selection') {
        const selection = figma.currentPage.selection;
        const qtVersion = msg.qtVersion || '6.0';
        const includeImports = msg.includeImports !== false; // по умолчанию true

        if (selection.length === 0) {
            figma.ui.postMessage({
                type: 'selection-info',
                error: 'Ничего не выбрано. Выделите элемент на канвасе.'
            });
            return;
        }

        const node = selection[0];
        let info = `Выбран: ${node.name} (${node.type})\n\n`;

        const usedIds = new Set<string>();
        let qml = generateQMLForNode(node, qtVersion, 0, 0, true, false, usedIds) || '';

        if (qml) {
            info += `✅ ${node.type} → QML:\n\n`;
        } else {
            info += `⚠️ Тип "${node.type}" пока не поддерживается.\n`;
        }

        let fullQml = qml;
        if (includeImports && qml) {
            fullQml = getRequiredImports(qml, qtVersion) + '\n' + qml;
        }

        figma.ui.postMessage({
            type: 'selection-info',
            info: info,
            qml: fullQml,
            nodeName: node.name,
            qtVersion: qtVersion
        });
    }
};