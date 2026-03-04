import PptxGenJS from "pptxgenjs";

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
  };
}

export const exportToPptx = async (options: ExportOptions) => {
  const pptx = new PptxGenJS();
  pptx.layout = "LAYOUT_16x9";
  pptx.title = options.title;

  const { primaryColor, secondaryColor, backgroundColor, headingFont, bodyFont } = options.theme;

  // Define master slide with background
  pptx.defineSlideMaster({
    title: "MASTER_SLIDE",
    background: { color: backgroundColor.replace("#", "") },
    objects: [],
  });

  for (const slide of options.slides) {
    const slidePage = pptx.addSlide({ masterName: "MASTER_SLIDE" });
    const params = slide.parameters;

    switch (slide.slideTypeKey) {
      case "title_only":
        slidePage.addText(String(params.title || ""), {
          x: 1,
          y: "40%",
          w: "80%",
          h: 1,
          align: "center",
          fontFace: headingFont,
          fontSize: 44,
          color: primaryColor.replace("#", ""),
          bold: true,
        });
        if (params.subtitle) {
          slidePage.addText(String(params.subtitle), {
            x: 1.5,
            y: "55%",
            w: "70%",
            h: 0.5,
            align: "center",
            fontFace: bodyFont,
            fontSize: 20,
            color: secondaryColor.replace("#", ""),
          });
        }
        break;

      case "text_block":
        slidePage.addText(String(params.title || ""), {
          x: 0.5,
          y: 0.5,
          w: "90%",
          h: 0.8,
          fontFace: headingFont,
          fontSize: 32,
          color: primaryColor.replace("#", ""),
          bold: true,
        });
        slidePage.addText(String(params.body || ""), {
          x: 0.5,
          y: 1.4,
          w: "90%",
          h: 4,
          fontFace: bodyFont,
          fontSize: 16,
          color: "CBD5E1",
          valign: "top",
        });
        break;

      case "text_image":
        slidePage.addText(String(params.title || ""), {
          x: 0.5,
          y: 0.5,
          w: "45%",
          h: 0.8,
          fontFace: headingFont,
          fontSize: 28,
          color: primaryColor.replace("#", ""),
          bold: true,
        });
        slidePage.addText(String(params.body || ""), {
          x: 0.5,
          y: 1.4,
          w: "45%",
          h: 3.5,
          fontFace: bodyFont,
          fontSize: 14,
          color: "CBD5E1",
          valign: "middle",
        });
        if (params.imageUrl) {
          slidePage.addImage({
            path: params.imageUrl as string,
            x: 5.5,
            y: 1,
            w: 4,
            h: 3.5,
          });
        } else {
          slidePage.addText("Image Placeholder", {
            x: 5.5,
            y: 1,
            w: 4,
            h: 3.5,
            fill: { color: "333333" },
            align: "center",
            color: "FFFFFF",
          });
        }
        break;

      case "bullet_list": {
        slidePage.addText(String(params.title || ""), {
          x: 0.5,
          y: 0.5,
          w: "90%",
          h: 0.8,
          fontFace: headingFont,
          fontSize: 32,
          color: primaryColor.replace("#", ""),
          bold: true,
        });
        const bullets = Array.isArray(params.bullets)
          ? params.bullets.map(String)
          : typeof params.bullets === "string"
            ? (params.bullets as string)
                .split("\n")
                .map((b) => b.trim())
                .filter(Boolean)
            : [];
        const bulletText = bullets.map((b) => ({ text: b, options: { breakLine: true } }));
        slidePage.addText(bulletText, {
          x: 0.5,
          y: 1.5,
          w: "90%",
          h: 3.5,
          fontFace: bodyFont,
          fontSize: 16,
          color: "CBD5E1",
          bullet: { code: "2022" },
          valign: "top",
        });
        break;
      }

      case "two_columns":
        slidePage.addText(String(params.title || ""), {
          x: 0.5,
          y: 0.4,
          w: "90%",
          h: 0.6,
          fontFace: headingFont,
          fontSize: 32,
          color: primaryColor.replace("#", ""),
          bold: true,
          align: "center",
        });
        // Left
        // Left Column Background + Content
        slidePage.addShape(pptx.ShapeType.rect, {
          x: 0.5,
          y: 1.1,
          w: 4.25,
          h: 4,
          fill: { color: "6366f1", alpha: 94 }, // ~0.06 opacity
          line: { color: "6366f1", width: 1, alpha: 85 },
        });

        if (params.leftTitle) {
          slidePage.addText(String(params.leftTitle), {
            x: 0.6,
            y: 1.2,
            w: 4,
            h: 0.4,
            fontFace: headingFont,
            fontSize: 18,
            color: "E2E8F0",
            bold: true,
          });
        }
        slidePage.addText(String(params.leftBody || ""), {
          x: 0.6,
          y: 1.7,
          w: 4,
          h: 3.3,
          fontFace: bodyFont,
          fontSize: 14,
          color: "94A3B8",
          valign: "top",
        });

        // Right Column Background + Content
        slidePage.addShape(pptx.ShapeType.rect, {
          x: 5.25,
          y: 1.1,
          w: 4.25,
          h: 4,
          fill: { color: "10b981", alpha: 94 }, // ~0.06 opacity
          line: { color: "10b981", width: 1, alpha: 85 },
        });

        if (params.rightTitle) {
          slidePage.addText(String(params.rightTitle), {
            x: 5.35,
            y: 1.2,
            w: 4,
            h: 0.4,
            fontFace: headingFont,
            fontSize: 18,
            color: "E2E8F0",
            bold: true,
          });
        }
        slidePage.addText(String(params.rightBody || ""), {
          x: 5.35,
          y: 1.7,
          w: 4,
          h: 3.3,
          fontFace: bodyFont,
          fontSize: 14,
          color: "94A3B8",
          valign: "top",
        });
        break;

      case "showcase":
        slidePage.addText(String(params.title || ""), {
          x: 1,
          y: 0.4,
          w: "80%",
          h: 0.6,
          fontFace: headingFont,
          fontSize: 28,
          color: primaryColor.replace("#", ""),
          bold: true,
          align: "center",
        });
        if (params.imageUrl) {
          slidePage.addImage({
            path: params.imageUrl as string,
            x: 2,
            y: 1.2,
            w: 6,
            h: 3,
          });
        }
        slidePage.addText(String(params.caption || ""), {
          x: 2,
          y: 4.4,
          w: 6,
          h: 0.5,
          fontFace: bodyFont,
          fontSize: 12,
          color: "94A3B8",
          align: "center",
        });
        break;

      case "split_kpi": {
        // Left column
        slidePage.addShape(pptx.ShapeType.rect, {
          x: 0,
          y: 0,
          w: 4,
          h: 5.625,
          fill: { color: primaryColor.replace("#", "") },
        });
        if (params.badge) {
          slidePage.addText(String(params.badge).toUpperCase(), {
            x: 0.5,
            y: 1.5,
            w: 3,
            h: 0.5,
            fontFace: bodyFont,
            fontSize: 12,
            color: backgroundColor.replace("#", ""),
            bold: true,
          });
        }
        slidePage.addText(String(params.title || ""), {
          x: 0.5,
          y: 2,
          w: 3,
          h: 2,
          fontFace: headingFont,
          fontSize: 36,
          color: backgroundColor.replace("#", ""),
          bold: true,
          valign: "top",
        });

        // Right column KPIs
        const kpis = Array.isArray(params.kpis) ? params.kpis : [];
        kpis.forEach((kpi: Record<string, unknown>, idx) => {
          const yPos = 1 + idx * 1.5;
          slidePage.addText(String(kpi.value || ""), {
            x: 5,
            y: yPos,
            w: 4,
            h: 0.8,
            fontFace: headingFont,
            fontSize: 48,
            color: primaryColor.replace("#", ""),
            bold: true,
          });
          slidePage.addText(String(kpi.label || ""), {
            x: 5,
            y: yPos + 0.8,
            w: 4,
            h: 0.3,
            fontFace: headingFont,
            fontSize: 16,
            color: secondaryColor.replace("#", ""),
            bold: true,
          });
          if (kpi.description) {
            slidePage.addText(String(kpi.description), {
              x: 5,
              y: yPos + 1.1,
              w: 4,
              h: 0.3,
              fontFace: bodyFont,
              fontSize: 12,
              color: "94A3B8",
            });
          }
        });
        break;
      }

      case "split_cards": {
        // Left column
        if (params.badge) {
          slidePage.addText(String(params.badge).toUpperCase(), {
            x: 0.5,
            y: 1,
            w: 4,
            h: 0.5,
            fontFace: bodyFont,
            fontSize: 12,
            color: secondaryColor.replace("#", ""),
            bold: true,
          });
        }
        slidePage.addText(String(params.title || ""), {
          x: 0.5,
          y: 1.5,
          w: 3.5,
          h: 3,
          fontFace: headingFont,
          fontSize: 36,
          color: primaryColor.replace("#", ""),
          bold: true,
          valign: "top",
        });

        // Right column Cards
        const cards = Array.isArray(params.cards) ? params.cards : [];
        cards.forEach((card: Record<string, unknown>, idx) => {
          const yPos = 0.8 + idx * 1.5;
          slidePage.addShape(pptx.ShapeType.rect, {
            x: 4.5,
            y: yPos,
            w: 5,
            h: 1.3,
            fill: { color: "1E293B" }, // dark slate
            line: { color: "334155", width: 1 },
          });
          slidePage.addText(String(card.title || ""), {
            x: 4.7,
            y: yPos + 0.2,
            w: 4.6,
            h: 0.4,
            fontFace: headingFont,
            fontSize: 20,
            color: "F8FAFC",
            bold: true,
          });
          slidePage.addText(String(card.body || ""), {
            x: 4.7,
            y: yPos + 0.6,
            w: 4.6,
            h: 0.7,
            fontFace: bodyFont,
            fontSize: 14,
            color: "94A3B8",
            valign: "top",
          });
        });
        break;
      }

      case "image_with_list": {
        // Left text/image
        slidePage.addText(String(params.badge || "").toUpperCase(), {
          x: 0.5,
          y: 0.5,
          w: 4,
          h: 0.4,
          fontFace: bodyFont,
          fontSize: 12,
          color: secondaryColor.replace("#", ""),
          bold: true,
        });
        slidePage.addText(String(params.title || ""), {
          x: 0.5,
          y: 0.9,
          w: 4,
          h: 1,
          fontFace: headingFont,
          fontSize: 32,
          color: primaryColor.replace("#", ""),
          bold: true,
        });
        slidePage.addText(String(params.body || ""), {
          x: 0.5,
          y: 2,
          w: 4,
          h: 2,
          fontFace: bodyFont,
          fontSize: 16,
          color: "CBD5E1",
          valign: "top",
        });

        // Right list
        const features = Array.isArray(params.features) ? params.features : [];
        features.forEach((feat: Record<string, unknown>, idx) => {
          const yPos = 1.2 + idx * 1.4;
          slidePage.addText(String(feat.title || ""), {
            x: 5,
            y: yPos,
            w: 4.5,
            h: 0.4,
            fontFace: headingFont,
            fontSize: 20,
            color: "F8FAFC",
            bold: true,
          });
          slidePage.addText(String(feat.description || ""), {
            x: 5,
            y: yPos + 0.4,
            w: 4.5,
            h: 0.8,
            fontFace: bodyFont,
            fontSize: 14,
            color: "94A3B8",
            valign: "top",
          });
        });
        break;
      }

      case "three_columns": {
        slidePage.addText(String(params.badge || "").toUpperCase(), {
          x: 0.5,
          y: 0.2,
          w: 9,
          h: 0.4,
          fontFace: bodyFont,
          fontSize: 12,
          color: secondaryColor.replace("#", ""),
          bold: true,
          align: "center",
        });
        slidePage.addText(String(params.title || ""), {
          x: 0.5,
          y: 0.5,
          w: 9,
          h: 0.6,
          fontFace: headingFont,
          fontSize: 32,
          color: primaryColor.replace("#", ""),
          bold: true,
          align: "center",
        });
        slidePage.addText(String(params.subtitle || ""), {
          x: 1,
          y: 1.1,
          w: 8,
          h: 0.5,
          fontFace: bodyFont,
          fontSize: 16,
          color: "CBD5E1",
          align: "center",
        });

        const columns = Array.isArray(params.columns) ? params.columns : [];
        const colWidth = 2.8;
        const startX = 0.5;
        const spacing = 0.3;

        columns.slice(0, 3).forEach((col: Record<string, unknown>, idx) => {
          const cx = startX + idx * (colWidth + spacing);
          slidePage.addShape(pptx.ShapeType.rect, {
            x: cx,
            y: 1.9,
            w: colWidth,
            h: 3.3,
            fill: { color: "1E293B" },
            line: { color: "334155", width: 1 },
          });
          slidePage.addText(String(col.title || ""), {
            x: cx + 0.2,
            y: 2.1,
            w: colWidth - 0.4,
            h: 0.5,
            fontFace: headingFont,
            fontSize: 20,
            color: "F8FAFC",
            bold: true,
            align: "center",
          });
          slidePage.addText(String(col.body || ""), {
            x: cx + 0.2,
            y: 2.6,
            w: colWidth - 0.4,
            h: 2.5,
            fontFace: bodyFont,
            fontSize: 14,
            color: "94A3B8",
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

        slidePage.addText(String(params.badge || "").toUpperCase(), {
          x: 1,
          y: 1.5,
          w: 8,
          h: 0.5,
          fontFace: bodyFont,
          fontSize: 14,
          color: backgroundColor.replace("#", ""),
          bold: true,
          align: "center",
        });

        slidePage.addText(`"${String(params.statement || "")}"`, {
          x: 1,
          y: 2,
          w: 8,
          h: 2.5,
          fontFace: headingFont,
          fontSize: 42,
          color: backgroundColor.replace("#", ""),
          bold: true,
          align: "center",
          valign: "middle",
        });
        break;
      }

      // Fallback for others
      default:
        slidePage.addText(String(params.title || "Untitled Slide"), {
          x: 0.5,
          y: 0.5,
          w: "90%",
          h: 0.8,
          fontFace: headingFont,
          fontSize: 32,
          color: primaryColor.replace("#", ""),
          bold: true,
        });
        slidePage.addText("Content not fully supported in export yet.", {
          x: 0.5,
          y: 2,
          w: "90%",
          h: 1,
          fontFace: bodyFont,
          fontSize: 14,
          color: "888888",
          align: "center",
        });
        break;
    }
  }

  await pptx.writeFile({ fileName: `${options.title.replace(/[^a-z0-9]/gi, "_")}.pptx` });
};
