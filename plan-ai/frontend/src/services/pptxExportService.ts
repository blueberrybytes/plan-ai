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

  const bodyTextColor = isDarkMode ? "CBD5E1" : "334155";
  const mutedTextColor = isDarkMode ? "94A3B8" : "64748B";
  const cardTitleColor = isDarkMode ? "F8FAFC" : "0F172A";
  const rootCardBgColor = isDarkMode ? "1E293B" : "F1F5F9";

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
        if (params.badge) {
          addSlideText(slidePage, String(params.badge).toUpperCase(), {
            x: 0.8,
            y: 0.6,
            w: 8.4,
            h: 0.3,
            fontFace: safeBodyFont,
            fontSize: 12,
            color: secondaryColor.replace("#", ""),
            bold: true,
          });
        }
        addSlideText(slidePage, String(params.title || ""), {
          x: 0.8,
          y: 0.9,
          w: 8.4,
          h: 0.8,
          fontFace: safeHeadingFont,
          fontSize: 36,
          color: primaryColor.replace("#", ""),
          bold: true,
        });
        let bodyStartY = 1.9;
        if (params.subtitle) {
          addSlideText(slidePage, String(params.subtitle), {
            x: 0.8,
            y: 1.6,
            w: 8.4,
            h: 0.6,
            fontFace: safeBodyFont,
            fontSize: 22,
            color: mutedTextColor,
          });
          bodyStartY = 2.4;
        }
        addSlideText(slidePage, String(params.body || ""), {
          x: 0.8,
          y: bodyStartY,
          w: 8.4,
          h: 5.625 - bodyStartY - 0.5,
          fontFace: safeBodyFont,
          fontSize: 18,
          color: bodyTextColor,
          valign: "top",
        });
        break;
      }

      case "text_image":
        if (params.badge) {
          addSlideText(slidePage, String(params.badge).toUpperCase(), {
            x: 0.8,
            y: 0.5,
            w: 4.2,
            h: 0.3,
            fontFace: safeBodyFont,
            fontSize: 12,
            color: secondaryColor.replace("#", ""),
            bold: true,
          });
        }
        addSlideText(slidePage, String(params.title || ""), {
          x: 0.8,
          y: 0.8,
          w: 4.2,
          h: 1.2,
          fontFace: safeHeadingFont,
          fontSize: 32,
          color: primaryColor.replace("#", ""),
          bold: true,
        });
        addSlideText(slidePage, String(params.body || ""), {
          x: 0.8,
          y: 2.1,
          w: 4.2,
          h: 3.0,
          fontFace: safeBodyFont,
          fontSize: 16,
          color: bodyTextColor,
          valign: "top",
        });
        if (params.imageUrl) {
          const proxiedData = await fetchProxiedImage(params.imageUrl as string);
          if (proxiedData) {
            slidePage.addImage({
              data: proxiedData,
              x: 5.5,
              y: 0.8,
              sizing: { type: "cover", w: 3.7, h: 4.0 },
            });
          } else {
            slidePage.addImage({
              path: params.imageUrl as string,
              x: 5.5,
              y: 0.8,
              sizing: { type: "cover", w: 3.7, h: 4.0 },
            });
          }
        } else {
          slidePage.addShape(pptx.ShapeType.roundRect, {
            x: 5.5,
            y: 0.8,
            w: 3.7,
            h: 4.0,
            fill: { color: rootCardBgColor },
            rectRadius: 0.08,
          });
          addSlideText(slidePage, "Image Placeholder", {
            x: 5.5,
            y: 0.8,
            w: 3.7,
            h: 4.0,
            align: "center",
            color: mutedTextColor,
            fontFace: safeBodyFont,
          });
        }
        break;

      case "bullet_list": {
        if (params.badge) {
          addSlideText(slidePage, String(params.badge).toUpperCase(), {
            x: 0.8,
            y: 0.6,
            w: 8.4,
            h: 0.3,
            fontFace: safeBodyFont,
            fontSize: 12,
            color: secondaryColor.replace("#", ""),
            bold: true,
          });
        }
        addSlideText(slidePage, String(params.title || ""), {
          x: 0.8,
          y: 0.9,
          w: 8.4,
          h: 0.8,
          fontFace: safeHeadingFont,
          fontSize: 32,
          color: primaryColor.replace("#", ""),
          bold: true,
        });

        let listStartY = 1.8;
        if (params.subtitle) {
          addSlideText(slidePage, String(params.subtitle), {
            x: 0.8,
            y: 1.5,
            w: 8.4,
            h: 0.6,
            fontFace: safeBodyFont,
            fontSize: 20,
            color: mutedTextColor,
          });
          listStartY = 2.2;
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

        const bulletText = bullets.map((b) => ({
          text: b,
          options: {
            breakLine: true,
            bullet: { code: "2022", color: primaryColor.replace("#", "") },
            marginPt: 0,
            paraSpaceBefore: 12, // add breathing room between bullet points
          },
        }));
        addSlideText(slidePage, bulletText as PptxGenJS.TextProps[], {
          x: 0.8,
          y: listStartY,
          w: 8.4,
          h: 5.625 - listStartY - 0.5,
          fontFace: safeBodyFont,
          fontSize: 18,
          color: bodyTextColor,
          valign: "top",
          lineSpacing: 24, // spacing between lines of a SINGLE bullet point
        });
        break;
      }

      case "two_columns":
        if (params.badge) {
          addSlideText(slidePage, String(params.badge).toUpperCase(), {
            x: 1,
            y: 0.3,
            w: 8,
            h: 0.3,
            fontFace: safeBodyFont,
            fontSize: 12,
            color: secondaryColor.replace("#", ""),
            bold: true,
            align: "center",
          });
        }
        addSlideText(slidePage, String(params.title || ""), {
          x: 1,
          y: 0.6,
          w: 8,
          h: 0.6,
          fontFace: safeHeadingFont,
          fontSize: 32,
          color: primaryColor.replace("#", ""),
          bold: true,
          align: "center",
        });

        // Left Column
        slidePage.addShape(pptx.ShapeType.roundRect, {
          x: 0.6,
          y: 1.5,
          w: 4.2,
          h: 3.8,
          fill: { color: rootCardBgColor },
          rectRadius: 0.08,
        });

        if (params.leftTitle) {
          addSlideText(slidePage, String(params.leftTitle), {
            x: 0.8,
            y: 1.7,
            w: 3.8,
            h: 0.4,
            fontFace: safeHeadingFont,
            fontSize: 20,
            color: primaryColor.replace("#", ""),
            bold: true,
          });
        }
        addSlideText(slidePage, String(params.leftBody || ""), {
          x: 0.8,
          y: 2.2,
          w: 3.8,
          h: 2.9,
          fontFace: safeBodyFont,
          fontSize: 15,
          color: mutedTextColor,
          valign: "top",
        });

        // Right Column
        slidePage.addShape(pptx.ShapeType.roundRect, {
          x: 5.2,
          y: 1.5,
          w: 4.2,
          h: 3.8,
          fill: { color: rootCardBgColor },
          rectRadius: 0.08,
        });

        if (params.rightTitle) {
          addSlideText(slidePage, String(params.rightTitle), {
            x: 5.4,
            y: 1.7,
            w: 3.8,
            h: 0.4,
            fontFace: safeHeadingFont,
            fontSize: 20,
            color: primaryColor.replace("#", ""),
            bold: true,
          });
        }
        addSlideText(slidePage, String(params.rightBody || ""), {
          x: 5.4,
          y: 2.2,
          w: 3.8,
          h: 2.9,
          fontFace: safeBodyFont,
          fontSize: 15,
          color: mutedTextColor,
          valign: "top",
        });
        break;

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
        addSlideText(slidePage, String(params.title || ""), {
          x: 0.6,
          y: 2,
          w: 3.3,
          h: 2.5,
          fontFace: safeHeadingFont,
          fontSize: 40,
          color: backgroundColor.replace("#", ""),
          bold: true,
          valign: "top",
        });

        // Right column KPIs
        const kpis = Array.isArray(params.kpis) ? params.kpis : [];
        kpis.forEach((kpi: Record<string, unknown>, idx) => {
          const yPos = 1 + idx * 1.5;
          addSlideText(slidePage, String(kpi.value || ""), {
            x: 5.2,
            y: yPos,
            w: 4.2,
            h: 0.8,
            fontFace: safeHeadingFont,
            fontSize: 54,
            color: primaryColor.replace("#", ""),
            bold: true,
          });
          addSlideText(slidePage, String(kpi.label || ""), {
            x: 5.2,
            y: yPos + 0.8,
            w: 4.2,
            h: 0.4,
            fontFace: safeHeadingFont,
            fontSize: 18,
            color: cardTitleColor,
            bold: true,
          });
          if (kpi.description) {
            addSlideText(slidePage, String(kpi.description), {
              x: 5.2,
              y: yPos + 1.2,
              w: 4.2,
              h: 0.3,
              fontFace: safeBodyFont,
              fontSize: 13,
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
        let currentY = 0.6;
        if (params.badge) {
          addSlideText(slidePage, String(params.badge).toUpperCase(), {
            x: 4.8,
            y: currentY,
            w: 4.8,
            h: 0.3,
            fontFace: safeBodyFont,
            fontSize: 13,
            color: secondaryColor.replace("#", ""),
            bold: true,
          });
          currentY += 0.35;
        }

        const titleH = 1.2;
        addSlideText(slidePage, String(params.title || ""), {
          x: 4.8,
          y: currentY,
          w: 4.8,
          h: titleH,
          fontFace: safeHeadingFont,
          fontSize: 32,
          color: primaryColor.replace("#", ""),
          bold: true,
          valign: "top",
        });
        currentY += titleH + 0.1;

        // Cards
        const cards = Array.isArray(params.cards) ? params.cards : [];
        const cardH = cards.length >= 3 ? 1.0 : 1.2;
        const cardGap = cards.length >= 3 ? 0.15 : 0.4;

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

          // Thick left border (Using standard Rect to emulate the CSS border-left)
          slidePage.addShape(pptx.ShapeType.rect, {
            x: 4.8,
            y: yPos,
            w: 0.08,
            h: cardH,
            fill: { color: primaryColor.replace("#", "") },
          });

          // Checkmark (✔) simulating the DynamicIcon
          addSlideText(slidePage, "✔", {
            x: 4.95,
            y: yPos + 0.1,
            w: 0.3,
            h: 0.3,
            fontFace: "Arial",
            fontSize: 16,
            color: primaryColor.replace("#", ""),
            bold: true,
            align: "center",
            valign: "middle",
          });

          // Card Title
          addSlideText(slidePage, String(card.title || ""), {
            x: 5.3,
            y: yPos + 0.1,
            w: 4.2,
            h: 0.3,
            fontFace: safeHeadingFont,
            fontSize: 18,
            color: cardTitleColor,
            bold: true,
            valign: "middle",
          });

          // Card Body
          addSlideText(slidePage, String(card.body || ""), {
            x: 5.3,
            y: yPos + 0.4,
            w: 4.2,
            h: cardH - 0.45,
            fontFace: safeBodyFont,
            fontSize: 13,
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

        addSlideText(slidePage, String(params.title || ""), {
          x: 0.6,
          y: 0.7,
          w: 8.8,
          h: 0.6,
          fontFace: safeHeadingFont,
          fontSize: 32,
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

        // Right list
        const features = Array.isArray(params.features) ? params.features : [];
        const isDense = features.length >= 4;
        const startY = isDense ? 1.3 : 1.6;
        const spacing = isDense ? 1.0 : 1.1;

        features.slice(0, 4).forEach((feat: Record<string, unknown>, idx) => {
          const yPos = startY + idx * spacing;
          addSlideText(slidePage, String(feat.title || ""), {
            x: 4.9,
            y: yPos,
            w: 4.7,
            h: isDense ? 0.35 : 0.4,
            fontFace: safeHeadingFont,
            fontSize: isDense ? 16 : 18,
            color: cardTitleColor,
            bold: true,
          });
          addSlideText(slidePage, String(feat.description || ""), {
            x: 4.9,
            y: yPos + (isDense ? 0.35 : 0.4),
            w: 4.7,
            h: isDense ? 0.6 : 0.6,
            fontFace: safeBodyFont,
            fontSize: isDense ? 12 : 13,
            color: mutedTextColor,
            valign: "top",
          });
        });
        break;
      }

      case "three_columns": {
        if (params.badge) {
          addSlideText(slidePage, String(params.badge || "").toUpperCase(), {
            x: 0.5,
            y: 0.3,
            w: 9,
            h: 0.3,
            fontFace: safeBodyFont,
            fontSize: 12,
            color: secondaryColor.replace("#", ""),
            bold: true,
            align: "center",
          });
        }
        addSlideText(slidePage, String(params.title || ""), {
          x: 0.5,
          y: 0.6,
          w: 9,
          h: 0.6,
          fontFace: safeHeadingFont,
          fontSize: 32,
          color: primaryColor.replace("#", ""),
          bold: true,
          align: "center",
        });
        if (params.subtitle) {
          addSlideText(slidePage, String(params.subtitle || ""), {
            x: 1,
            y: 1.2,
            w: 8,
            h: 0.5,
            fontFace: safeBodyFont,
            fontSize: 16,
            color: bodyTextColor,
            align: "center",
          });
        }

        const columns = Array.isArray(params.columns) ? params.columns : [];
        const colWidth = 2.8;
        const startX = 0.5;
        const spacing = 0.3;

        columns.slice(0, 3).forEach((col: Record<string, unknown>, idx) => {
          const cx = startX + idx * (colWidth + spacing);

          // Draw circular icon (pill) instead of card backgrounds
          const iconSize = 0.5;
          slidePage.addShape(pptx.ShapeType.ellipse, {
            x: cx + colWidth / 2 - iconSize / 2,
            y: 2.0,
            w: iconSize,
            h: iconSize,
            fill: { color: primaryColor.replace("#", "") },
          });

          addSlideText(slidePage, "✔", {
            x: cx + colWidth / 2 - iconSize / 2,
            y: 2.02,
            w: iconSize,
            h: iconSize,
            fontFace: "Arial",
            fontSize: 14,
            color: "FFFFFF",
            align: "center",
          });

          addSlideText(slidePage, String(col.title || ""), {
            x: cx + 0.1,
            y: 2.7,
            w: colWidth - 0.2,
            h: 0.5,
            fontFace: safeHeadingFont,
            fontSize: 20,
            color: cardTitleColor,
            bold: true,
            align: "center",
          });
          addSlideText(slidePage, String(col.body || ""), {
            x: cx,
            y: 3.2,
            w: colWidth,
            h: 2.0,
            fontFace: safeBodyFont,
            fontSize: 14,
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

        addSlideText(slidePage, String(params.badge || "").toUpperCase(), {
          x: 1,
          y: 1.5,
          w: 8,
          h: 0.5,
          fontFace: safeBodyFont,
          fontSize: 14,
          color: backgroundColor.replace("#", ""),
          bold: true,
          align: "center",
        });

        addSlideText(slidePage, `"${String(params.statement || "")}"`, {
          x: 1,
          y: 2,
          w: 8,
          h: 2.5,
          fontFace: safeHeadingFont,
          fontSize: 42,
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
        addSlideText(slidePage, String(params.title || ""), {
          x: 0.5,
          y: 0.8,
          w: 9,
          h: 0.6,
          fontFace: safeHeadingFont,
          fontSize: 34,
          color: primaryColor.replace("#", ""),
          bold: true,
          align: "center",
        });

        const stats = Array.isArray(params.stats) ? params.stats : [];
        const isThree = stats.length === 3;
        const maxCols = isThree ? 3 : 2;
        const statW = isThree ? 2.8 : 3.5;
        const statH = 1.5;
        const gapX = isThree ? 0.3 : 0.5;
        const gapY = 0.4;

        const itemsToRender = stats.slice(0, 4);
        const startY = 2.4; // Push down slightly

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

          addSlideText(slidePage, String(stat.value || ""), {
            x: cx,
            y: cy + 0.3,
            w: statW,
            h: 0.6,
            fontFace: safeHeadingFont,
            fontSize: isThree ? 38 : 42,
            color: secondaryColor.replace("#", ""),
            bold: true,
            align: "center",
          });

          addSlideText(slidePage, String(stat.label || "").toUpperCase(), {
            x: cx,
            y: cy + 0.9,
            w: statW,
            h: 0.4,
            fontFace: safeBodyFont,
            fontSize: 13,
            color: cardTitleColor,
            align: "center",
            bold: true,
          });
        });
        break;
      }

      case "team_grid": {
        addSlideText(slidePage, String(params.title || ""), {
          x: 0.5,
          y: 0.5,
          w: 9,
          h: 0.6,
          fontFace: safeHeadingFont,
          fontSize: 32,
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
            fill: { color: "334155" },
          });

          addSlideText(slidePage, String(mem.name || ""), {
            x: cx + 0.1,
            y: 3.2,
            w: memW - 0.2,
            h: 0.4,
            fontFace: safeHeadingFont,
            fontSize: 16,
            color: cardTitleColor,
            bold: true,
            align: "center",
          });

          addSlideText(slidePage, String(mem.role || ""), {
            x: cx + 0.1,
            y: 3.6,
            w: memW - 0.2,
            h: 0.3,
            fontFace: safeBodyFont,
            fontSize: 12,
            color: primaryColor.replace("#", ""),
            align: "center",
          });

          addSlideText(slidePage, String(mem.bio || ""), {
            x: cx + 0.1,
            y: 4.0,
            w: memW - 0.2,
            h: 0.8,
            fontFace: safeBodyFont,
            fontSize: 11,
            color: mutedTextColor,
            align: "center",
            valign: "top",
          });
        });
        break;
      }

      case "diagram_slide": {
        if (params.badge) {
          addSlideText(slidePage, String(params.badge).toUpperCase(), {
            x: 0.5,
            y: 0.4,
            w: 9,
            h: 0.3,
            fontFace: safeBodyFont,
            fontSize: 12,
            color: secondaryColor.replace("#", ""),
            bold: true,
          });
        }
        addSlideText(slidePage, String(params.title || "System Diagram"), {
          x: 0.5,
          y: 0.7,
          w: 9,
          h: 0.6,
          fontFace: safeHeadingFont,
          fontSize: 32,
          color: primaryColor.replace("#", ""),
          bold: true,
        });

        slidePage.addShape(pptx.ShapeType.roundRect, {
          x: 0.5,
          y: 1.5,
          w: 9,
          h: 3.5,
          fill: { color: "0F172A" },
          rectRadius: 0.05,
        });

        addSlideText(
          slidePage,
          "Mermaid Diagram Source Code:\n\n" + String(params.mermaidCode || ""),
          {
            x: 0.7,
            y: 1.7,
            w: 8.6,
            h: 3.1,
            fontFace: "Courier New",
            fontSize: 12,
            color: "38BDF8",
            valign: "top",
          },
        );

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
          color: "888888",
          align: "center",
        });
        break;
    }
  }

  await pptx.writeFile({ fileName: `${options.title.replace(/[^a-z0-9-_]/gi, "_")}.pptx` });
};
