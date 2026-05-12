import PptxGenJS from "pptxgenjs";

const fetchProxiedImage = async (url: string): Promise<string> => {
  try {
    const backendUrl = process.env.REACT_APP_API_BACKEND_URL || "";
    const proxyResponse = await fetch(
      `${backendUrl}/api/proxy/image?url=${encodeURIComponent(url)}`,
    );
    if (!proxyResponse.ok) throw new Error("Proxy fetch failed");
    const proxyData = await proxyResponse.json();
    return `data:${proxyData.mimeType};base64,${proxyData.base64}`;
  } catch (e) {
    console.error("Failed to proxy PPTX image via backend", e);
    return ""; // Empty string triggers fallback or skips image
  }
};

interface SlideData {
  slideTypeKey: string;
  parameters: Record<string, unknown>;
}

interface ExportOptions {
  title: string;
  slides: SlideData[];
  theme: {
    primaryColor: string;
    secondaryColor: string;
    backgroundColor: string;
    headingFont: string;
    bodyFont: string;
    logoUrl?: string;
  };
}

// Fallback font utility for safe cross-platform PPTX rendering
const getSafeFont = (fontFamily: string, type: "heading" | "body") => {
  // If no recognized font is explicitly embedded, force Arial so PowerPoint doesn't substitute it poorly
  return fontFamily && fontFamily !== "Inter" ? fontFamily : type === "heading" ? "Arial" : "Arial";
};

/**
 * Wrapper around slide.addText that enforces `shrinkText: true` on every call.
 *
 * This activates PowerPoint's native "Shrink text on overflow" option, which
 * automatically reduces the font size until the text fits its bounding box.
 * Without this, long real-world titles or body text simply overflow/clip.
 */
const addSlideText = (
  slide: PptxGenJS.Slide,
  text: string | PptxGenJS.TextProps[],
  opts: PptxGenJS.TextPropsOptions,
) => slide.addText(text, { shrinkText: true, ...opts });

export interface FontConfig {
  size: number;
  lineSpacing?: number;
  paraSpace?: number;
}

/**
 * Calculates dynamic font configuration (size, spacing) based on string length.
 * Allows each slide type to define precise bounding box breakpoints.
 */
export const calculateDynamicFontConfig = (
  textLength: number,
  baseConfig: FontConfig,
  breakpoints: Array<{ chars: number; config: FontConfig }>,
): FontConfig => {
  let finalConfig = { ...baseConfig };
  const sorted = [...breakpoints].sort((a, b) => a.chars - b.chars);
  for (const bp of sorted) {
    if (textLength >= bp.chars) {
      finalConfig = { ...finalConfig, ...bp.config };
    }
  }
  return finalConfig;
};

export const tintShadeHex = (hex: string, percent: number): string => {
  const cleanHex = hex.replace("#", "");
  const r = parseInt(cleanHex.substring(0, 2), 16);
  const g = parseInt(cleanHex.substring(2, 4), 16);
  const b = parseInt(cleanHex.substring(4, 6), 16);

  const t = percent < 0 ? 0 : 255;
  const p = Math.abs(percent);

  const R = Math.round((t - r) * p) + r;
  const G = Math.round((t - g) * p) + g;
  const B = Math.round((t - b) * p) + b;

  return ((1 << 24) + (R << 16) + (G << 8) + B).toString(16).slice(1).toUpperCase();
};

export const exportToPptx = async (options: ExportOptions) => {
  const pptx = new PptxGenJS();
  pptx.layout = "LAYOUT_16x9";
  pptx.title = options.title;

  const { primaryColor, secondaryColor, backgroundColor, headingFont, bodyFont } = options.theme;

  const safeHeadingFont = getSafeFont(headingFont, "heading");
  const safeBodyFont = getSafeFont(bodyFont, "body");

  const bgHex = backgroundColor.replace("#", "");
  const r = parseInt(bgHex.substring(0, 2), 16) || 0;
  const g = parseInt(bgHex.substring(2, 4), 16) || 0;
  const b = parseInt(bgHex.substring(4, 6), 16) || 0;
  const isDarkMode = (r * 299 + g * 587 + b * 114) / 1000 < 128;

  // Deriving tonal palette from the actual background color
  const bodyTextColor = tintShadeHex(bgHex, isDarkMode ? 0.75 : -0.75);
  const mutedTextColor = tintShadeHex(bgHex, isDarkMode ? 0.5 : -0.6);
  const cardTitleColor = tintShadeHex(bgHex, isDarkMode ? 0.95 : -0.95);
  const rootCardBgColor = tintShadeHex(bgHex, isDarkMode ? 0.08 : -0.05);

  const objectsArray: Exclude<PptxGenJS.SlideMasterProps["objects"], undefined> = [];

  if (options.theme.logoUrl) {
    const proxiedLogo = await fetchProxiedImage(options.theme.logoUrl);
    objectsArray.push({
      image: {
        x: 8.2, // ~bottom/right aligned based on 10x5.625 standard 16:9 layout
        y: 0.3, // top edge
        sizing: { type: "contain", w: 1.5, h: 0.6 },
        ...(proxiedLogo ? { data: proxiedLogo } : { path: options.theme.logoUrl }),
      },
    });
  }

  const masterProps: PptxGenJS.SlideMasterProps = {
    title: "MASTER_SLIDE",
    background: { color: bgHex },
    objects: objectsArray,
  };

  // Define master slide with background and standard objects
  pptx.defineSlideMaster(masterProps);

  for (const slide of options.slides) {
    if (slide.slideTypeKey === "diagram_slide") {
      continue; // Mermaid diagrams cannot be rendered in PPTX natively
    }
    const slidePage = pptx.addSlide({ masterName: "MASTER_SLIDE" });
    const params = slide.parameters;

    switch (slide.slideTypeKey) {
      case "title_only":
        if (options.theme.logoUrl) {
          const proxiedLogo = await fetchProxiedImage(options.theme.logoUrl);
          if (proxiedLogo) {
            slidePage.addImage({
              data: proxiedLogo,
              x: 4.0,
              y: 0.8,
              sizing: { type: "contain", w: 2, h: 1 },
            });
          } else {
            slidePage.addImage({
              path: options.theme.logoUrl,
              x: 4.0,
              y: 0.8,
              sizing: { type: "contain", w: 2, h: 1 },
            });
          }
        } else if (params.iconName && typeof params.iconName === "string") {
          slidePage.addShape(pptx.ShapeType.ellipse, {
            x: 4.5,
            y: 0.8,
            w: 1,
            h: 1,
            fill: { color: rootCardBgColor },
          });
          addSlideText(slidePage, "★", {
            x: 4.5,
            y: 0.8,
            w: 1,
            h: 1,
            align: "center",
            valign: "middle",
            color: secondaryColor.replace("#", ""),
            fontSize: 24,
          });
        }

        addSlideText(slidePage, String(params.title || ""), {
          x: 1,
          y: "35%",
          w: "80%",
          h: 1.5,
          align: "center",
          fontFace: safeHeadingFont,
          fontSize: 48,
          color: primaryColor.replace("#", ""),
          bold: true,
        });
        if (params.subtitle) {
          addSlideText(slidePage, String(params.subtitle), {
            x: 1.5,
            y: "65%",
            w: "70%",
            h: 1,
            align: "center",
            fontFace: safeBodyFont,
            fontSize: 22,
            color: secondaryColor.replace("#", ""),
          });
        }
        break;

      case "text_block": {
        let tbNextY = 0.5;
        if (params.badge) {
          addSlideText(slidePage, String(params.badge).toUpperCase(), {
            x: 0.8,
            y: tbNextY,
            w: 8.4,
            h: 0.3,
            fontFace: safeBodyFont,
            fontSize: 11,
            color: secondaryColor.replace("#", ""),
            bold: true,
          });
          tbNextY += 0.3;
        }
        addSlideText(slidePage, String(params.title || ""), {
          x: 0.8,
          y: tbNextY,
          w: 8.4,
          h: 0.7,
          fontFace: safeHeadingFont,
          fontSize: 28,
          color: primaryColor.replace("#", ""),
          bold: true,
        });
        tbNextY += 0.75;
        if (params.subtitle) {
          addSlideText(slidePage, String(params.subtitle), {
            x: 0.8,
            y: tbNextY,
            w: 8.4,
            h: 0.4,
            fontFace: safeBodyFont,
            fontSize: 16,
            color: mutedTextColor,
          });
          tbNextY += 0.45;
        }
        const bodyText = String(params.body || "");
        const fontConf = calculateDynamicFontConfig(bodyText.length, { size: 14 }, [
          { chars: 400, config: { size: 13 } },
          { chars: 600, config: { size: 12 } },
          { chars: 900, config: { size: 11 } },
          { chars: 1200, config: { size: 10 } },
        ]);

        addSlideText(slidePage, bodyText, {
          x: 0.8,
          y: tbNextY,
          w: 8.4,
          h: 5.625 - tbNextY - 0.3,
          fontFace: safeBodyFont,
          fontSize: fontConf.size,
          color: bodyTextColor,
          valign: "top",
        });
        break;
      }

      case "text_image": {
        let tiNextY = 0.5;
        if (params.badge) {
          addSlideText(slidePage, String(params.badge).toUpperCase(), {
            x: 0.8,
            y: tiNextY,
            w: 4.2,
            h: 0.3,
            fontFace: safeBodyFont,
            fontSize: 11,
            color: secondaryColor.replace("#", ""),
            bold: true,
          });
          tiNextY += 0.3;
        }
        const titleText = String(params.title || "");
        const tConf = calculateDynamicFontConfig(titleText.length, { size: 28 }, [
          { chars: 40, config: { size: 24 } },
          { chars: 80, config: { size: 20 } },
          { chars: 120, config: { size: 18 } },
        ]);
        const estLines = Math.max(1, Math.ceil(titleText.length / 25));
        const tHeight = Math.min(1.5, estLines * (tConf.size * 0.015));

        addSlideText(slidePage, titleText, {
          x: 0.8,
          y: tiNextY,
          w: 4.2,
          h: tHeight,
          fontFace: safeHeadingFont,
          fontSize: tConf.size,
          color: primaryColor.replace("#", ""),
          bold: true,
        });
        tiNextY += tHeight + 0.05;

        const bodyText = String(params.body || "");
        const bConf = calculateDynamicFontConfig(bodyText.length, { size: 14 }, [
          { chars: 300, config: { size: 13 } },
          { chars: 500, config: { size: 12 } },
          { chars: 700, config: { size: 11 } },
          { chars: 1000, config: { size: 10 } },
          { chars: 1500, config: { size: 9 } },
        ]);

        addSlideText(slidePage, bodyText, {
          x: 0.8,
          y: tiNextY,
          w: 4.2,
          h: 5.625 - tiNextY - 0.3,
          fontFace: safeBodyFont,
          fontSize: bConf.size,
          color: bodyTextColor,
          valign: "top",
        });
        if (params.imageUrl) {
          const proxiedData = await fetchProxiedImage(params.imageUrl as string);
          if (proxiedData) {
            slidePage.addImage({
              data: proxiedData,
              x: 5.5,
              y: 0.5,
              sizing: { type: "cover", w: 4.0, h: 4.5 },
            });
          } else {
            slidePage.addImage({
              path: params.imageUrl as string,
              x: 5.5,
              y: 0.5,
              sizing: { type: "cover", w: 4.0, h: 4.5 },
            });
          }
        } else {
          slidePage.addShape(pptx.ShapeType.roundRect, {
            x: 5.5,
            y: 0.5,
            w: 4.0,
            h: 4.5,
            fill: { color: rootCardBgColor },
            rectRadius: 0.08,
          });
          addSlideText(slidePage, "Image Placeholder", {
            x: 5.5,
            y: 0.5,
            w: 4.0,
            h: 4.5,
            align: "center",
            color: mutedTextColor,
            fontFace: safeBodyFont,
          });
        }
        break;
      }

      case "bullet_list": {
        let blNextY = 0.5;
        if (params.badge) {
          addSlideText(slidePage, String(params.badge).toUpperCase(), {
            x: 0.8,
            y: blNextY,
            w: 8.4,
            h: 0.3,
            fontFace: safeBodyFont,
            fontSize: 12,
            color: secondaryColor.replace("#", ""),
            bold: true,
          });
          blNextY += 0.35;
        }
        const titleText = String(params.title || "");
        const tConf = calculateDynamicFontConfig(titleText.length, { size: 28 }, [
          { chars: 50, config: { size: 24 } },
          { chars: 100, config: { size: 20 } },
        ]);
        const estTitleLines = Math.max(1, Math.ceil(titleText.length / 40));
        const titleH = Math.min(1.2, estTitleLines * (tConf.size * 0.018));

        addSlideText(slidePage, titleText, {
          x: 0.8,
          y: blNextY,
          w: 8.4,
          h: titleH,
          fontFace: safeHeadingFont,
          fontSize: tConf.size,
          color: primaryColor.replace("#", ""),
          bold: true,
        });
        blNextY += titleH + 0.05;

        if (params.subtitle) {
          const subText = String(params.subtitle);
          const subConf = calculateDynamicFontConfig(subText.length, { size: 16 }, [
            { chars: 80, config: { size: 14 } },
          ]);
          const estSubLines = Math.max(1, Math.ceil(subText.length / 60));
          const subH = Math.min(0.8, estSubLines * (subConf.size * 0.018));

          addSlideText(slidePage, subText, {
            x: 0.8,
            y: blNextY,
            w: 8.4,
            h: subH,
            fontFace: safeBodyFont,
            fontSize: subConf.size,
            color: mutedTextColor,
          });
          blNextY += subH + 0.05;
        }

        const bullets = Array.isArray(params.bullets)
          ? params.bullets.map(String)
          : typeof params.bullets === "string"
            ? (params.bullets as string)
                .replace(/\n-/g, "\n")
                .split("\n")
                .map((b) => b.trim().replace(/^- /, ""))
                .filter(Boolean)
            : [];

        const totalChars = bullets.reduce((sum, b) => sum + b.length, 0);
        const bulletCount = bullets.length;
        const effectiveLength = totalChars + bulletCount * 50; // Add weight for bullet line breaks

        const fontConf = calculateDynamicFontConfig(
          effectiveLength,
          { size: 18, lineSpacing: 24, paraSpace: 12 }, // Base layout
          [
            { chars: 300, config: { size: 16, lineSpacing: 22, paraSpace: 10 } },
            { chars: 500, config: { size: 14, lineSpacing: 18, paraSpace: 8 } },
            { chars: 700, config: { size: 12, lineSpacing: 16, paraSpace: 6 } },
            { chars: 900, config: { size: 11, lineSpacing: 14, paraSpace: 4 } },
            { chars: 1200, config: { size: 10, lineSpacing: 12, paraSpace: 2 } },
            { chars: 1600, config: { size: 9, lineSpacing: 11, paraSpace: 1 } },
            { chars: 2200, config: { size: 8, lineSpacing: 10, paraSpace: 0 } },
            { chars: 3000, config: { size: 7, lineSpacing: 9, paraSpace: 0 } },
          ],
        );

        const bulletText = bullets.map((b) => ({
          text: b,
          options: {
            breakLine: true,
            bullet: { code: "2022", color: primaryColor.replace("#", "") },
            marginPt: 0,
            paraSpaceBefore: fontConf.paraSpace,
          },
        }));
        addSlideText(slidePage, bulletText as PptxGenJS.TextProps[], {
          x: 0.8,
          y: blNextY,
          w: 8.4,
          h: 5.625 - blNextY - 0.3,
          fontFace: safeBodyFont,
          fontSize: fontConf.size,
          color: bodyTextColor,
          valign: "top",
          lineSpacing: fontConf.lineSpacing,
        });
        break;
      }

      case "two_columns": {
        let tcNextY = 0.4;
        if (params.badge) {
          addSlideText(slidePage, String(params.badge).toUpperCase(), {
            x: 1,
            y: tcNextY,
            w: 8,
            h: 0.3,
            fontFace: safeBodyFont,
            fontSize: 11,
            color: secondaryColor.replace("#", ""),
            bold: true,
            align: "center",
          });
          tcNextY += 0.3;
        }
        addSlideText(slidePage, String(params.title || ""), {
          x: 1,
          y: tcNextY,
          w: 8,
          h: 0.6,
          fontFace: safeHeadingFont,
          fontSize: 28,
          color: primaryColor.replace("#", ""),
          bold: true,
          align: "center",
        });
        tcNextY += 0.7;

        const colTop = tcNextY + 0.1;
        const colH = 5.625 - colTop - 0.3;

        // Left Column
        slidePage.addShape(pptx.ShapeType.roundRect, {
          x: 0.6,
          y: colTop,
          w: 4.2,
          h: colH,
          fill: { color: rootCardBgColor },
          rectRadius: 0.08,
        });

        let leftCurrentY = colTop + 0.15;
        const leftTitle = String(params.leftTitle || "");
        if (leftTitle) {
          const tConf = calculateDynamicFontConfig(leftTitle.length, { size: 18 }, [
            { chars: 40, config: { size: 16 } },
            { chars: 80, config: { size: 14 } },
            { chars: 150, config: { size: 12 } },
          ]);
          const estLines = Math.max(1, Math.ceil(leftTitle.length / 35));
          const tHeight = Math.min(1.0, estLines * (tConf.size * 0.015));

          addSlideText(slidePage, leftTitle, {
            x: 0.8,
            y: leftCurrentY,
            w: 3.8,
            h: tHeight,
            fontFace: safeHeadingFont,
            fontSize: tConf.size,
            color: primaryColor.replace("#", ""),
            bold: true,
          });
          leftCurrentY += tHeight + 0.05;
        }

        const leftBody = String(params.leftBody || "");
        if (leftBody) {
          const bConf = calculateDynamicFontConfig(leftBody.length, { size: 13 }, [
            { chars: 200, config: { size: 12 } },
            { chars: 400, config: { size: 11 } },
            { chars: 600, config: { size: 10 } },
            { chars: 800, config: { size: 9 } },
          ]);
          addSlideText(slidePage, leftBody, {
            x: 0.8,
            y: leftCurrentY,
            w: 3.8,
            h: colTop + colH - 0.15 - leftCurrentY,
            fontFace: safeBodyFont,
            fontSize: bConf.size,
            color: mutedTextColor,
            valign: "top",
          });
        }

        // Right Column
        slidePage.addShape(pptx.ShapeType.roundRect, {
          x: 5.2,
          y: colTop,
          w: 4.2,
          h: colH,
          fill: { color: rootCardBgColor },
          rectRadius: 0.08,
        });

        let rightCurrentY = colTop + 0.15;
        const rightTitle = String(params.rightTitle || "");
        if (rightTitle) {
          const tConf = calculateDynamicFontConfig(rightTitle.length, { size: 18 }, [
            { chars: 40, config: { size: 16 } },
            { chars: 80, config: { size: 14 } },
            { chars: 150, config: { size: 12 } },
          ]);
          const estLines = Math.max(1, Math.ceil(rightTitle.length / 35));
          const tHeight = Math.min(1.0, estLines * (tConf.size * 0.015));

          addSlideText(slidePage, rightTitle, {
            x: 5.4,
            y: rightCurrentY,
            w: 3.8,
            h: tHeight,
            fontFace: safeHeadingFont,
            fontSize: tConf.size,
            color: primaryColor.replace("#", ""),
            bold: true,
          });
          rightCurrentY += tHeight + 0.05;
        }

        const rightBody = String(params.rightBody || "");
        if (rightBody) {
          const bConf = calculateDynamicFontConfig(rightBody.length, { size: 13 }, [
            { chars: 200, config: { size: 12 } },
            { chars: 400, config: { size: 11 } },
            { chars: 600, config: { size: 10 } },
            { chars: 800, config: { size: 9 } },
          ]);
          addSlideText(slidePage, rightBody, {
            x: 5.4,
            y: rightCurrentY,
            w: 3.8,
            h: colTop + colH - 0.15 - rightCurrentY,
            fontFace: safeBodyFont,
            fontSize: bConf.size,
            color: mutedTextColor,
            valign: "top",
          });
        }
        break;
      }

      case "showcase":
        addSlideText(slidePage, String(params.title || ""), {
          x: 1,
          y: 0.4,
          w: 8,
          h: 0.6,
          fontFace: safeHeadingFont,
          fontSize: 28,
          color: primaryColor.replace("#", ""),
          bold: true,
          align: "center",
        });
        if (params.imageUrl) {
          const proxiedData = await fetchProxiedImage(params.imageUrl as string);
          if (proxiedData) {
            slidePage.addImage({
              data: proxiedData,
              x: 1.5,
              y: 1.2,
              sizing: { type: "contain", w: 7, h: 3.5 },
            });
          } else {
            slidePage.addImage({
              path: params.imageUrl as string,
              x: 1.5,
              y: 1.2,
              sizing: { type: "contain", w: 7, h: 3.5 },
            });
          }
        } else {
          slidePage.addShape(pptx.ShapeType.roundRect, {
            x: 1.5,
            y: 1.2,
            w: 7,
            h: 3.5,
            fill: { color: rootCardBgColor },
            rectRadius: 0.1,
          });
        }
        addSlideText(slidePage, String(params.caption || ""), {
          x: 1,
          y: 4.8,
          w: 8,
          h: 0.5,
          fontFace: safeBodyFont,
          fontSize: 14,
          color: mutedTextColor,
          align: "center",
        });
        break;

      case "split_kpi": {
        // Left column
        slidePage.addShape(pptx.ShapeType.rect, {
          x: 0,
          y: 0,
          w: 4.5,
          h: 5.625,
          fill: { color: primaryColor.replace("#", "") },
        });
        if (params.badge) {
          addSlideText(slidePage, String(params.badge).toUpperCase(), {
            x: 0.6,
            y: 1.5,
            w: 3.3,
            h: 0.5,
            fontFace: safeBodyFont,
            fontSize: 14,
            color: backgroundColor.replace("#", ""),
            bold: true,
          });
        }
        const titleText = String(params.title || "");
        const tConf = calculateDynamicFontConfig(titleText.length, { size: 40 }, [
          { chars: 40, config: { size: 32 } },
          { chars: 80, config: { size: 24 } },
          { chars: 150, config: { size: 20 } },
        ]);

        addSlideText(slidePage, titleText, {
          x: 0.6,
          y: 2,
          w: 3.3,
          h: 2.5,
          fontFace: safeHeadingFont,
          fontSize: tConf.size,
          color: backgroundColor.replace("#", ""),
          bold: true,
          valign: "top",
        });

        // Right column KPIs — dynamically sized
        const kpis = Array.isArray(params.kpis) ? params.kpis : [];
        const kpiAvailH = 5.625 - 0.8; // top margin 0.4 each side
        const kpiGap = 0.2;
        const kpiTotalGaps = Math.max(0, kpis.length - 1) * kpiGap;
        const kpiRowH = Math.min(1.4, (kpiAvailH - kpiTotalGaps) / Math.max(1, kpis.length));

        kpis.forEach((kpi: Record<string, unknown>, idx) => {
          const yPos = 0.4 + idx * (kpiRowH + kpiGap);
          const valFontSize = kpiRowH >= 1.2 ? 48 : 36;
          addSlideText(slidePage, String(kpi.value || ""), {
            x: 5.2,
            y: yPos,
            w: 4.2,
            h: kpiRowH * 0.55,
            fontFace: safeHeadingFont,
            fontSize: valFontSize,
            color: primaryColor.replace("#", ""),
            bold: true,
          });
          const labelText = String(kpi.label || "");
          const lConf = calculateDynamicFontConfig(labelText.length, { size: 16 }, [
            { chars: 30, config: { size: 14 } },
            { chars: 60, config: { size: 12 } },
            { chars: 100, config: { size: 10 } },
          ]);
          addSlideText(slidePage, labelText, {
            x: 5.2,
            y: yPos + kpiRowH * 0.55,
            w: 4.2,
            h: kpiRowH * 0.3,
            fontFace: safeHeadingFont,
            fontSize: lConf.size,
            color: cardTitleColor,
            bold: true,
          });
          if (kpi.description) {
            const descText = String(kpi.description);
            const dConf = calculateDynamicFontConfig(descText.length, { size: 11 }, [
              { chars: 60, config: { size: 10 } },
              { chars: 120, config: { size: 9 } },
              { chars: 200, config: { size: 8 } },
            ]);
            addSlideText(slidePage, descText, {
              x: 5.2,
              y: yPos + kpiRowH * 0.85,
              w: 4.2,
              h: kpiRowH * 0.15,
              fontFace: safeBodyFont,
              fontSize: dConf.size,
              color: mutedTextColor,
            });
          }
        });
        break;
      }

      case "split_cards": {
        // Left column Image (45% -> 4.5 inches wide)
        if (params.imageUrl) {
          const proxiedData = await fetchProxiedImage(params.imageUrl as string);
          if (proxiedData) {
            slidePage.addImage({
              data: proxiedData,
              x: 0,
              y: 0,
              sizing: { type: "cover", w: 4.5, h: 5.625 },
            });
          } else {
            slidePage.addImage({
              path: params.imageUrl as string,
              x: 0,
              y: 0,
              sizing: { type: "cover", w: 4.5, h: 5.625 },
            });
          }
        } else {
          slidePage.addShape(pptx.ShapeType.roundRect, {
            x: 0,
            y: 0,
            w: 4.5,
            h: 5.625,
            fill: { color: rootCardBgColor },
            rectRadius: 0,
          });
        }

        // Right column (x: 4.8)
        let currentY = 0.5;
        if (params.badge) {
          addSlideText(slidePage, String(params.badge).toUpperCase(), {
            x: 4.8,
            y: currentY,
            w: 4.8,
            h: 0.3,
            fontFace: safeBodyFont,
            fontSize: 12,
            color: secondaryColor.replace("#", ""),
            bold: true,
          });
          currentY += 0.3;
        }

        const titleText = String(params.title || "");
        const tConf = calculateDynamicFontConfig(titleText.length, { size: 28 }, [
          { chars: 40, config: { size: 24 } },
          { chars: 80, config: { size: 20 } },
          { chars: 150, config: { size: 16 } },
        ]);
        const estLines = Math.max(1, Math.ceil(titleText.length / 30));
        const scTitleH = Math.min(1.5, estLines * (tConf.size * 0.015));

        addSlideText(slidePage, titleText, {
          x: 4.8,
          y: currentY,
          w: 4.8,
          h: scTitleH,
          fontFace: safeHeadingFont,
          fontSize: tConf.size,
          color: primaryColor.replace("#", ""),
          bold: true,
          valign: "top",
        });
        currentY += scTitleH + 0.05;

        // Cards — dynamically size to fit available space
        const cards = Array.isArray(params.cards) ? params.cards : [];
        const availableH = 5.625 - currentY - 0.2; // bottom margin
        const cardGap = 0.12;
        const totalGaps = Math.max(0, cards.length - 1) * cardGap;
        const cardH = Math.min(1.1, (availableH - totalGaps) / Math.max(1, cards.length));

        cards.forEach((card: Record<string, unknown>, idx) => {
          const yPos = currentY + idx * (cardH + cardGap);

          // Main Body rect (Rounded)
          slidePage.addShape(pptx.ShapeType.roundRect, {
            x: 4.8,
            y: yPos,
            w: 4.8,
            h: cardH,
            rectRadius: 0.1,
            fill: { color: rootCardBgColor },
          });

          // Thick left border
          slidePage.addShape(pptx.ShapeType.rect, {
            x: 4.8,
            y: yPos,
            w: 0.08,
            h: cardH,
            fill: { color: primaryColor.replace("#", "") },
          });

          // Checkmark
          addSlideText(slidePage, "✔", {
            x: 4.95,
            y: yPos + 0.05,
            w: 0.3,
            h: 0.25,
            fontFace: "Arial",
            fontSize: 14,
            color: primaryColor.replace("#", ""),
            bold: true,
            align: "center",
            valign: "middle",
          });

          // Card Title
          const titleText = String(card.title || "");
          const titleConf = calculateDynamicFontConfig(
            titleText.length,
            { size: cardH < 0.9 ? 14 : 16 },
            [
              { chars: 30, config: { size: 12 } },
              { chars: 60, config: { size: 10 } },
              { chars: 100, config: { size: 9 } },
            ],
          );
          addSlideText(slidePage, titleText, {
            x: 5.3,
            y: yPos + 0.05,
            w: 4.1,
            h: 0.25,
            fontFace: safeHeadingFont,
            fontSize: titleConf.size,
            color: cardTitleColor,
            bold: true,
            valign: "middle",
          });

          // Card Body
          const bodyText = String(card.body || "");
          const bodyConf = calculateDynamicFontConfig(
            bodyText.length,
            { size: cardH < 0.9 ? 11 : 12 },
            [
              { chars: 100, config: { size: 10 } },
              { chars: 200, config: { size: 9 } },
              { chars: 300, config: { size: 8 } },
              { chars: 500, config: { size: 7 } },
            ],
          );
          addSlideText(slidePage, bodyText, {
            x: 5.3,
            y: yPos + 0.32,
            w: 4.1,
            h: cardH - 0.37,
            fontFace: safeBodyFont,
            fontSize: bodyConf.size,
            color: mutedTextColor,
            valign: "top",
          });
        });
        break;
      }

      case "image_with_list": {
        if (params.badge) {
          addSlideText(slidePage, String(params.badge || "").toUpperCase(), {
            x: 0.6,
            y: 0.4,
            w: 8.8,
            h: 0.3,
            fontFace: safeBodyFont,
            fontSize: 12,
            color: secondaryColor.replace("#", ""),
            bold: true,
          });
        }

        const titleText = String(params.title || "");
        const tConf = calculateDynamicFontConfig(titleText.length, { size: 32 }, [
          { chars: 40, config: { size: 28 } },
          { chars: 80, config: { size: 24 } },
          { chars: 120, config: { size: 20 } },
        ]);

        addSlideText(slidePage, titleText, {
          x: 0.6,
          y: 0.7,
          w: 8.8,
          h: 0.6,
          fontFace: safeHeadingFont,
          fontSize: tConf.size,
          color: primaryColor.replace("#", ""),
          bold: true,
        });

        // Left image
        if (params.imageUrl) {
          const proxiedData = await fetchProxiedImage(params.imageUrl as string);
          if (proxiedData) {
            slidePage.addImage({
              data: proxiedData,
              x: 0.6,
              y: 1.5,
              sizing: { type: "cover", w: 4, h: 3.5 },
            });
          } else {
            slidePage.addImage({
              path: params.imageUrl as string,
              x: 0.6,
              y: 1.5,
              sizing: { type: "cover", w: 4, h: 3.5 },
            });
          }
        } else {
          slidePage.addShape(pptx.ShapeType.roundRect, {
            x: 0.6,
            y: 1.5,
            w: 4,
            h: 3.5,
            fill: { color: rootCardBgColor },
            rectRadius: 0.08,
          });
        }

        // Right list — dynamically sized
        const features = Array.isArray(params.features) ? params.features : [];
        const featItems = features.slice(0, 4);
        const featAvail = 5.625 - 1.5 - 0.3; // from image top to bottom margin
        const featGap = 0.1;
        const featTotalGaps = Math.max(0, featItems.length - 1) * featGap;
        const featRowH = Math.min(1.0, (featAvail - featTotalGaps) / Math.max(1, featItems.length));

        featItems.forEach((feat: Record<string, unknown>, idx) => {
          const yPos = 1.5 + idx * (featRowH + featGap);
          const fTitleText = String(feat.title || "");
          const fTitleConf = calculateDynamicFontConfig(
            fTitleText.length,
            { size: featRowH < 0.85 ? 14 : 16 },
            [
              { chars: 40, config: { size: 12 } },
              { chars: 80, config: { size: 11 } },
            ],
          );
          const titleH = Math.min(0.3, featRowH * 0.35);

          addSlideText(slidePage, fTitleText, {
            x: 4.9,
            y: yPos,
            w: 4.7,
            h: titleH,
            fontFace: safeHeadingFont,
            fontSize: fTitleConf.size,
            color: cardTitleColor,
            bold: true,
          });

          const fDescText = String(feat.description || "");
          const fDescConf = calculateDynamicFontConfig(
            fDescText.length,
            { size: featRowH < 0.85 ? 11 : 12 },
            [
              { chars: 100, config: { size: 10 } },
              { chars: 200, config: { size: 9 } },
              { chars: 300, config: { size: 8 } },
            ],
          );
          addSlideText(slidePage, fDescText, {
            x: 4.9,
            y: yPos + titleH,
            w: 4.7,
            h: featRowH - titleH - 0.05,
            fontFace: safeBodyFont,
            fontSize: fDescConf.size,
            color: mutedTextColor,
            valign: "top",
          });
        });
        break;
      }

      case "three_columns": {
        let tcColNextY = 0.35;
        if (params.badge) {
          addSlideText(slidePage, String(params.badge || "").toUpperCase(), {
            x: 0.5,
            y: tcColNextY,
            w: 9,
            h: 0.3,
            fontFace: safeBodyFont,
            fontSize: 11,
            color: secondaryColor.replace("#", ""),
            bold: true,
            align: "center",
          });
          tcColNextY += 0.3;
        }
        addSlideText(slidePage, String(params.title || ""), {
          x: 0.5,
          y: tcColNextY,
          w: 9,
          h: 0.6,
          fontFace: safeHeadingFont,
          fontSize: 28,
          color: primaryColor.replace("#", ""),
          bold: true,
          align: "center",
        });
        tcColNextY += 0.65;
        if (params.subtitle) {
          addSlideText(slidePage, String(params.subtitle || ""), {
            x: 1,
            y: tcColNextY,
            w: 8,
            h: 0.4,
            fontFace: safeBodyFont,
            fontSize: 14,
            color: bodyTextColor,
            align: "center",
          });
          tcColNextY += 0.45;
        }

        const columns = Array.isArray(params.columns) ? params.columns : [];
        const colWidth = 2.8;
        const startX = 0.5;
        const colSpacing = 0.3;
        const iconY = tcColNextY + 0.15;
        const colBodyEnd = 5.625 - 0.3; // bottom margin

        columns.slice(0, 3).forEach((col: Record<string, unknown>, idx) => {
          const cx = startX + idx * (colWidth + colSpacing);

          const iconSize = 0.45;
          slidePage.addShape(pptx.ShapeType.ellipse, {
            x: cx + colWidth / 2 - iconSize / 2,
            y: iconY,
            w: iconSize,
            h: iconSize,
            fill: { color: primaryColor.replace("#", "") },
          });

          addSlideText(slidePage, "✔", {
            x: cx + colWidth / 2 - iconSize / 2,
            y: iconY + 0.02,
            w: iconSize,
            h: iconSize,
            fontFace: "Arial",
            fontSize: 13,
            color: backgroundColor.replace("#", ""),
            align: "center",
          });

          const colTitleY = iconY + iconSize + 0.1;
          const colTitleText = String(col.title || "");
          const titleConf = calculateDynamicFontConfig(colTitleText.length, { size: 18 }, [
            { chars: 30, config: { size: 16 } },
            { chars: 60, config: { size: 14 } },
            { chars: 100, config: { size: 12 } },
          ]);
          const estLines = Math.max(1, Math.ceil(colTitleText.length / 25));
          const tHeight = Math.min(0.8, estLines * (titleConf.size * 0.015));

          addSlideText(slidePage, colTitleText, {
            x: cx + 0.1,
            y: colTitleY,
            w: colWidth - 0.2,
            h: tHeight,
            fontFace: safeHeadingFont,
            fontSize: titleConf.size,
            color: cardTitleColor,
            bold: true,
            align: "center",
          });

          const colBodyText = String(col.body || "");
          const bodyConf = calculateDynamicFontConfig(colBodyText.length, { size: 13 }, [
            { chars: 100, config: { size: 12 } },
            { chars: 200, config: { size: 11 } },
            { chars: 300, config: { size: 10 } },
            { chars: 400, config: { size: 9 } },
          ]);
          const colBodyY = colTitleY + tHeight + 0.05;
          addSlideText(slidePage, colBodyText, {
            x: cx,
            y: colBodyY,
            w: colWidth,
            h: colBodyEnd - colBodyY,
            fontFace: safeBodyFont,
            fontSize: bodyConf.size,
            color: mutedTextColor,
            align: "center",
            valign: "top",
          });
        });
        break;
      }

      case "quote_showcase": {
        slidePage.addShape(pptx.ShapeType.rect, {
          x: 0,
          y: 0,
          w: 10,
          h: 5.625,
          fill: { color: primaryColor.replace("#", "") },
        });

        if (params.badge) {
          addSlideText(slidePage, String(params.badge).toUpperCase(), {
            x: 1,
            y: 0.6,
            w: 8,
            h: 0.4,
            fontFace: safeBodyFont,
            fontSize: 13,
            color: backgroundColor.replace("#", ""),
            bold: true,
            align: "center",
          });
        }

        const quoteText = String(params.statement || "");
        const fontConf = calculateDynamicFontConfig(quoteText.length, { size: 36 }, [
          { chars: 150, config: { size: 28 } },
          { chars: 300, config: { size: 24 } },
          { chars: 500, config: { size: 20 } },
          { chars: 800, config: { size: 16 } },
          { chars: 1200, config: { size: 14 } },
        ]);

        addSlideText(slidePage, `"${quoteText}"`, {
          x: 1,
          y: 1.2,
          w: 8,
          h: 3.6,
          fontFace: safeHeadingFont,
          fontSize: fontConf.size,
          color: backgroundColor.replace("#", ""),
          bold: true,
          align: "center",
          valign: "middle",
        });
        break;
      }

      case "stats": {
        if (params.badge) {
          const badgeText = String(params.badge || "").toUpperCase();
          const badgeW = Math.max(2, badgeText.length * 0.15);

          slidePage.addShape(pptx.ShapeType.roundRect, {
            x: (10 - badgeW) / 2,
            y: 0.32,
            w: badgeW,
            h: 0.4,
            fill: { color: primaryColor.replace("#", ""), transparency: 85 },
            rectRadius: 0.5,
          });

          addSlideText(slidePage, badgeText, {
            x: (10 - badgeW) / 2,
            y: 0.33,
            w: badgeW,
            h: 0.4,
            fontFace: safeBodyFont,
            fontSize: 11,
            color: primaryColor.replace("#", ""),
            bold: true,
            align: "center",
          });
        }
        const titleText = String(params.title || "");
        const tConf = calculateDynamicFontConfig(titleText.length, { size: 34 }, [
          { chars: 40, config: { size: 28 } },
          { chars: 80, config: { size: 24 } },
          { chars: 120, config: { size: 20 } },
        ]);

        addSlideText(slidePage, titleText, {
          x: 0.5,
          y: 0.8,
          w: 9,
          h: 0.6,
          fontFace: safeHeadingFont,
          fontSize: tConf.size,
          color: primaryColor.replace("#", ""),
          bold: true,
          align: "center",
        });

        const stats = Array.isArray(params.stats) ? params.stats : [];
        const isThree = stats.length === 3;
        const maxCols = isThree ? 3 : 2;
        const statW = isThree ? 2.8 : 3.5;
        const statH = 1.3;
        const gapX = isThree ? 0.3 : 0.5;
        const gapY = 0.3;

        const itemsToRender = stats.slice(0, 4);
        const startY = 1.8;

        itemsToRender.forEach((stat: Record<string, unknown>, idx) => {
          const row = Math.floor(idx / maxCols);
          const col = idx % maxCols;

          // Re-calculate startX per row if we have a bottom row with fewer items (e.g. 3 stats in 2 columns? No, if length=3, maxCols=3. If length=2, maxCols=2. If length=1, maxCols=2 (actualCols=1). If length=4, maxCols=2 (cols=2 per row))
          const itemsInThisRow = Math.min(itemsToRender.length - row * maxCols, maxCols);
          const rowTotalW = itemsInThisRow * statW + (itemsInThisRow - 1) * gapX;
          const rowStartX = (10 - rowTotalW) / 2;

          const cx = rowStartX + col * (statW + gapX);
          const cy = startY + row * (statH + gapY);

          slidePage.addShape(pptx.ShapeType.roundRect, {
            x: cx,
            y: cy,
            w: statW,
            h: statH,
            fill: { color: rootCardBgColor },
            rectRadius: 0.15,
          });

          const valText = String(stat.value || "");
          const valConf = calculateDynamicFontConfig(valText.length, { size: isThree ? 38 : 42 }, [
            { chars: 15, config: { size: 28 } },
            { chars: 30, config: { size: 20 } },
          ]);

          addSlideText(slidePage, valText, {
            x: cx,
            y: cy + 0.3,
            w: statW,
            h: 0.6,
            fontFace: safeHeadingFont,
            fontSize: valConf.size,
            color: secondaryColor.replace("#", ""),
            bold: true,
            align: "center",
          });

          const labelText = String(stat.label || "").toUpperCase();
          const lblConf = calculateDynamicFontConfig(labelText.length, { size: 13 }, [
            { chars: 30, config: { size: 11 } },
            { chars: 60, config: { size: 9 } },
          ]);

          addSlideText(slidePage, labelText, {
            x: cx,
            y: cy + 0.9,
            w: statW,
            h: 0.4,
            fontFace: safeBodyFont,
            fontSize: lblConf.size,
            color: cardTitleColor,
            align: "center",
            bold: true,
          });
        });
        break;
      }

      case "team_grid": {
        const titleText = String(params.title || "");
        const tConf = calculateDynamicFontConfig(titleText.length, { size: 32 }, [
          { chars: 40, config: { size: 28 } },
          { chars: 80, config: { size: 24 } },
          { chars: 120, config: { size: 20 } },
        ]);

        addSlideText(slidePage, titleText, {
          x: 0.5,
          y: 0.5,
          w: 9,
          h: 0.6,
          fontFace: safeHeadingFont,
          fontSize: tConf.size,
          color: primaryColor.replace("#", ""),
          bold: true,
          align: "center",
        });

        const members = Array.isArray(params.members) ? params.members : [];
        const memW = 2.0;
        const memH = 3.5;
        const startX = 0.5;
        const spacing = (9 - 4 * memW) / 3; // spread evenly

        members.slice(0, 4).forEach((mem: Record<string, unknown>, idx) => {
          const cx = startX + idx * (memW + spacing);
          slidePage.addShape(pptx.ShapeType.roundRect, {
            x: cx,
            y: 1.5,
            w: memW,
            h: memH,
            fill: { color: rootCardBgColor },
            rectRadius: 0.1,
          });

          // Image / Avatar placeholder
          slidePage.addShape(pptx.ShapeType.ellipse, {
            x: cx + memW / 2 - 0.6,
            y: 1.8,
            w: 1.2,
            h: 1.2,
            fill: { color: mutedTextColor },
          });

          const nameText = String(mem.name || "");
          const nameConf = calculateDynamicFontConfig(nameText.length, { size: 16 }, [
            { chars: 25, config: { size: 14 } },
            { chars: 50, config: { size: 12 } },
          ]);
          addSlideText(slidePage, nameText, {
            x: cx + 0.1,
            y: 3.2,
            w: memW - 0.2,
            h: 0.4,
            fontFace: safeHeadingFont,
            fontSize: nameConf.size,
            color: cardTitleColor,
            bold: true,
            align: "center",
          });

          const roleText = String(mem.role || "");
          const roleConf = calculateDynamicFontConfig(roleText.length, { size: 12 }, [
            { chars: 30, config: { size: 11 } },
            { chars: 60, config: { size: 9 } },
          ]);
          addSlideText(slidePage, roleText, {
            x: cx + 0.1,
            y: 3.6,
            w: memW - 0.2,
            h: 0.3,
            fontFace: safeBodyFont,
            fontSize: roleConf.size,
            color: primaryColor.replace("#", ""),
            align: "center",
          });

          const bioText = String(mem.bio || "");
          const fontConf = calculateDynamicFontConfig(bioText.length, { size: 12 }, [
            { chars: 80, config: { size: 11 } },
            { chars: 120, config: { size: 10 } },
            { chars: 160, config: { size: 9 } },
            { chars: 250, config: { size: 8 } },
            { chars: 400, config: { size: 7 } },
          ]);

          addSlideText(slidePage, bioText, {
            x: cx + 0.1,
            y: 4.0,
            w: memW - 0.2,
            h: 0.8,
            fontFace: safeBodyFont,
            fontSize: fontConf.size,
            color: mutedTextColor,
            align: "center",
            valign: "top",
          });
        });
        break;
      }

      // Fallback for others
      default:
        addSlideText(slidePage, String(params.title || "Untitled Slide"), {
          x: 0.5,
          y: 0.5,
          w: "90%",
          h: 0.8,
          fontFace: safeHeadingFont,
          fontSize: 32,
          color: primaryColor.replace("#", ""),
          bold: true,
        });
        addSlideText(slidePage, "Content not fully supported in PPTX export natively.", {
          x: 0.5,
          y: 2,
          w: "90%",
          h: 1,
          fontFace: safeBodyFont,
          fontSize: 14,
          color: mutedTextColor,
          align: "center",
        });
        break;
    }
  }

  await pptx.writeFile({ fileName: `${options.title.replace(/[^a-z0-9-_]/gi, "_")}.pptx` });
};
