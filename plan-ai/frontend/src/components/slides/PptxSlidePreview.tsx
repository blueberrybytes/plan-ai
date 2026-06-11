/**
 * PptxSlidePreview
 *
 * Renders a faithful CSS preview of a PPTX slide using the same
 * absolute positioning coordinate system used in pptxExportService.ts.
 *
 * PPTX canvas: 10 inches wide × 5.625 inches tall (16:9)
 * Conversion:
 *   x% = (x_inches / 10) * 100
 *   y% = (y_inches / 5.625) * 100
 *   w% = (w_inches / 10) * 100
 *   h% = (h_inches / 5.625) * 100
 *
 * Usage: Add <PptxSlidePreview slideTypeKey="two_columns" params={sampleData} theme={theme} />
 */

import React from "react";
import { calculateDynamicFontConfig, tintShadeHex } from "../../services/pptxExportService";

// --------------------------------------------------------------------------
// PPTX canvas dimensions (inches)
// --------------------------------------------------------------------------
const PPTX_W = 10;
const PPTX_H = 5.625;

// Convert PPTX inches → CSS percentage relative to the parent container
const px = (inches: number) => `${(inches / PPTX_W) * 100}%`;
const py = (inches: number) => `${(inches / PPTX_H) * 100}%`;
const pw = (inches: number) => `${(inches / PPTX_W) * 100}%`;
const ph = (inches: number) => `${(inches / PPTX_H) * 100}%`;

// --------------------------------------------------------------------------
// Theme helpers
// --------------------------------------------------------------------------
interface PptxTheme {
  primaryColor: string;
  secondaryColor: string;
  backgroundColor: string;
  logoUrl?: string;
  bodyTextColor?: string;
  mutedTextColor?: string;
  cardTitleColor?: string;
  rootCardBgColor?: string;
}

const DEFAULT_THEME: PptxTheme = {
  primaryColor: "#6366f1",
  secondaryColor: "#06b6d4",
  backgroundColor: "#0f172a",
};

// --------------------------------------------------------------------------
// Low-level primitive components (mirror pptxgenjs primitives)
// --------------------------------------------------------------------------

interface BoxProps {
  x: number;
  y: number;
  w: number;
  h: number;
  fill?: string;
  border?: string;
  children?: React.ReactNode;
  style?: React.CSSProperties;
}

const PptxBox: React.FC<BoxProps> = ({ x, y, w, h, fill, border, children, style }) => (
  <div
    style={{
      position: "absolute",
      left: px(x),
      top: py(y),
      width: pw(w),
      height: ph(h),
      background: fill || "transparent",
      border: border || "none",
      overflow: "hidden",
      boxSizing: "border-box",
      ...style,
    }}
  >
    {children}
  </div>
);

interface TextBoxProps {
  x: number;
  y: number;
  w: number;
  h: number;
  text: string;
  color?: string;
  fontSize?: number; // in pt — we scale to em relative to slide width
  bold?: boolean;
  italic?: boolean;
  align?: "left" | "center" | "right";
  valign?: "top" | "middle" | "bottom";
}

// Base font-size reference: 10pt at 10-inch wide slide rendered at container width.
// We use vw-like scaling so text scales with the preview box.
const scaleFontSize = (pt: number) => `${pt * 0.09}cqi`;

const PptxText: React.FC<TextBoxProps> = ({
  x,
  y,
  w,
  h,
  text,
  color = "#FFFFFF",
  fontSize = 14,
  bold = false,
  italic = false,
  align = "left",
  valign = "top",
}) => (
  <div
    style={{
      position: "absolute",
      left: px(x),
      top: py(y),
      width: pw(w),
      height: ph(h),
      color: color.startsWith("#") ? color : `#${color}`,
      fontSize: scaleFontSize(fontSize),
      fontWeight: bold ? 700 : 400,
      fontStyle: italic ? "italic" : "normal",
      fontFamily: "Arial, sans-serif",
      textAlign: align,
      display: "flex",
      alignItems: valign === "middle" ? "center" : valign === "bottom" ? "flex-end" : "flex-start",
      justifyContent: align === "center" ? "center" : align === "right" ? "flex-end" : "flex-start",
      padding: "0 2px",
      overflow: "hidden",
      boxSizing: "border-box",
      lineHeight: 1.25,
      whiteSpace: "pre-wrap",
      wordBreak: "break-word",
    }}
  >
    <span style={{ width: "100%", textAlign: align }}>{text}</span>
  </div>
);

interface OvalProps {
  x: number;
  y: number;
  w: number;
  h: number;
  fill?: string;
}

const PptxOval: React.FC<OvalProps> = ({ x, y, w, h, fill = "#334155" }) => (
  <div
    style={{
      position: "absolute",
      left: px(x),
      top: py(y),
      width: pw(w),
      height: ph(h),
      borderRadius: "50%",
      background: fill.startsWith("#") ? fill : `#${fill}`,
    }}
  />
);

// --------------------------------------------------------------------------
// Per-slide-type renderers
// --------------------------------------------------------------------------

type Params = Record<string, unknown>;

const str = (v: unknown, fallback = "") => String(v ?? fallback);
const arr = <T,>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);

// --- title_only ---
const TitleOnlyPreview: React.FC<{ params: Params; theme: PptxTheme & { logoUrl?: string } }> = ({
  params,
  theme,
}) => (
  <>
    {theme.logoUrl ? (
      <PptxBox
        x={4.5}
        y={0.8}
        w={1}
        h={1}
        style={{
          backgroundImage: `url(${theme.logoUrl})`,
          backgroundSize: "contain",
          backgroundRepeat: "no-repeat",
          backgroundPosition: "center",
        }}
      />
    ) : params.iconName ? (
      <React.Fragment>
        <PptxOval x={4.5} y={0.8} w={1} h={1} fill={theme.rootCardBgColor} />
        <PptxText
          x={4.5}
          y={0.8}
          w={1}
          h={1}
          text="★"
          color={theme.secondaryColor}
          fontSize={24}
          align="center"
          valign="middle"
        />
      </React.Fragment>
    ) : null}
    <PptxText
      x={1}
      y={2}
      w={8}
      h={1.5}
      text={str(params.title, "Title Slide")}
      color={theme.primaryColor}
      fontSize={48}
      bold
      align="center"
    />
    {params.subtitle && (
      <PptxText
        x={1.5}
        y={3.1}
        w={7}
        h={1}
        text={str(params.subtitle)}
        color={theme.secondaryColor}
        fontSize={22}
        align="center"
      />
    )}
  </>
);

// --- text_block ---
const TextBlockPreview: React.FC<{ params: Params; theme: PptxTheme }> = ({ params, theme }) => {
  let bodyStartY = 1.9;
  return (
    <>
      {params.badge && (
        <PptxText
          x={0.8}
          y={0.6}
          w={8.4}
          h={0.3}
          text={str(params.badge).toUpperCase()}
          color={theme.secondaryColor}
          fontSize={12}
          bold
        />
      )}
      <PptxText
        x={0.8}
        y={0.9}
        w={8.4}
        h={0.8}
        text={str(params.title)}
        color={theme.primaryColor}
        fontSize={36}
        bold
      />
      {params.subtitle && (
        <>
          <PptxText
            x={0.8}
            y={1.6}
            w={8.4}
            h={0.6}
            text={str(params.subtitle)}
            color={theme.mutedTextColor}
            fontSize={22}
          />
          <div style={{ display: "none" }}>{(bodyStartY = 2.4)}</div>
        </>
      )}
      <PptxText
        x={0.8}
        y={bodyStartY}
        w={8.4}
        h={5.625 - bodyStartY - 0.5}
        text={str(params.body)}
        color={theme.bodyTextColor}
        fontSize={18}
      />
    </>
  );
};

// --- text_image ---
const TextImagePreview: React.FC<{ params: Params; theme: PptxTheme }> = ({ params, theme }) => (
  <>
    {params.badge && (
      <PptxText
        x={0.8}
        y={0.5}
        w={4.2}
        h={0.3}
        text={str(params.badge).toUpperCase()}
        color={theme.secondaryColor}
        fontSize={12}
        bold
      />
    )}
    <PptxText
      x={0.8}
      y={0.8}
      w={4.2}
      h={1.2}
      text={str(params.title)}
      color={theme.primaryColor}
      fontSize={32}
      bold
    />
    <PptxText
      x={0.8}
      y={2.1}
      w={4.2}
      h={3.0}
      text={str(params.body)}
      color={theme.bodyTextColor}
      fontSize={16}
    />
    {/* Image placeholder */}
    <PptxBox
      x={5.5}
      y={0.8}
      w={3.7}
      h={4.0}
      fill={theme.rootCardBgColor}
      style={{ display: "flex", alignItems: "center", justifyContent: "center" }}
    >
      <span style={{ color: "#475569", fontSize: "0.7em", fontFamily: "Arial" }}>
        {params.imageUrl ? "📷" : "Image"}
      </span>
    </PptxBox>
  </>
);

// --- bullet_list ---
const BulletListPreview: React.FC<{ params: Params; theme: PptxTheme }> = ({ params, theme }) => {
  const bullets = Array.isArray(params.bullets)
    ? params.bullets.map(String)
    : typeof params.bullets === "string"
      ? params.bullets
          .replace(/\n-/g, "\n")
          .split("\n")
          .map((b) => b.trim().replace(/^- /, ""))
          .filter(Boolean)
      : [];

  const totalChars = bullets.reduce((sum, b) => sum + b.length, 0);
  const bulletCount = bullets.length;
  const effectiveLength = totalChars + bulletCount * 50;
  const fontConf = calculateDynamicFontConfig(
    effectiveLength,
    { size: 18, lineSpacing: 24, paraSpace: 12 },
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

  let listStartY = 1.8;
  return (
    <>
      {params.badge && (
        <PptxText
          x={0.8}
          y={0.6}
          w={8.4}
          h={0.3}
          text={str(params.badge).toUpperCase()}
          color={theme.secondaryColor}
          fontSize={12}
          bold
        />
      )}
      <PptxText
        x={0.8}
        y={0.9}
        w={8.4}
        h={0.8}
        text={str(params.title)}
        color={theme.primaryColor}
        fontSize={32}
        bold
      />
      {params.subtitle && (
        <>
          <PptxText
            x={0.8}
            y={1.5}
            w={8.4}
            h={0.6}
            text={str(params.subtitle)}
            color={theme.mutedTextColor}
            fontSize={20}
          />
          <div style={{ display: "none" }}>{(listStartY = 2.2)}</div>
        </>
      )}
      <div
        style={{
          position: "absolute",
          left: px(0.8),
          top: py(listStartY),
          width: pw(8.4),
          height: ph(5.625 - listStartY - 0.5),
          overflow: "hidden",
        }}
      >
        {bullets.map((b, i) => (
          <div
            key={i}
            style={{
              display: "flex",
              alignItems: "flex-start",
              marginBottom: px(fontConf.paraSpace ? fontConf.paraSpace * 0.01 : 0.2),
            }}
          >
            <span
              style={{
                color: theme.primaryColor,
                marginRight: px(0.15),
                fontSize: scaleFontSize(fontConf.size),
              }}
            >
              •
            </span>
            <span
              style={{
                color: theme.bodyTextColor,
                fontSize: scaleFontSize(fontConf.size),
                lineHeight: 1.2,
              }}
            >
              {b}
            </span>
          </div>
        ))}
      </div>
    </>
  );
};

// --- two_columns ---
const TwoColumnsPreview: React.FC<{ params: Params; theme: PptxTheme }> = ({ params, theme }) => (
  <>
    {params.badge && (
      <PptxText
        x={1}
        y={0.3}
        w={8}
        h={0.3}
        text={str(params.badge).toUpperCase()}
        color={theme.secondaryColor}
        fontSize={12}
        bold
        align="center"
      />
    )}
    <PptxText
      x={1}
      y={0.6}
      w={8}
      h={0.6}
      text={str(params.title)}
      color={theme.primaryColor}
      fontSize={32}
      bold
      align="center"
    />
    {/* Left column */}
    <PptxBox x={0.6} y={1.5} w={4.2} h={3.8} fill={theme.rootCardBgColor} />
    {params.leftTitle && (
      <PptxText
        x={0.8}
        y={1.7}
        w={3.8}
        h={0.4}
        text={str(params.leftTitle)}
        color={theme.primaryColor}
        fontSize={20}
        bold
      />
    )}
    <PptxText
      x={0.8}
      y={2.2}
      w={3.8}
      h={2.9}
      text={str(params.leftBody)}
      color={theme.mutedTextColor}
      fontSize={15}
    />
    {/* Right column */}
    <PptxBox x={5.2} y={1.5} w={4.2} h={3.8} fill={theme.rootCardBgColor} />
    {params.rightTitle && (
      <PptxText
        x={5.4}
        y={1.7}
        w={3.8}
        h={0.4}
        text={str(params.rightTitle)}
        color={theme.primaryColor}
        fontSize={20}
        bold
      />
    )}
    <PptxText
      x={5.4}
      y={2.2}
      w={3.8}
      h={2.9}
      text={str(params.rightBody)}
      color={theme.mutedTextColor}
      fontSize={15}
    />
  </>
);

// --- showcase ---
const ShowcasePreview: React.FC<{ params: Params; theme: PptxTheme }> = ({ params, theme }) => (
  <>
    <PptxText
      x={1}
      y={0.4}
      w={8}
      h={0.6}
      text={str(params.title)}
      color={theme.primaryColor}
      fontSize={28}
      bold
      align="center"
    />
    <PptxBox
      x={1.5}
      y={1.2}
      w={7}
      h={3.5}
      fill={theme.rootCardBgColor}
      style={{ display: "flex", alignItems: "center", justifyContent: "center" }}
    >
      <span style={{ color: "#475569", fontSize: "0.8em", fontFamily: "Arial" }}>📷 Image</span>
    </PptxBox>
    {params.caption && (
      <PptxText
        x={1}
        y={4.8}
        w={8}
        h={0.5}
        text={str(params.caption)}
        color={theme.mutedTextColor}
        fontSize={14}
        align="center"
      />
    )}
  </>
);

// --- split_kpi ---
const SplitKpiPreview: React.FC<{ params: Params; theme: PptxTheme }> = ({ params, theme }) => {
  const kpis = arr<Record<string, unknown>>(params.kpis);
  return (
    <>
      <PptxBox x={0} y={0} w={4.5} h={5.625} fill={theme.primaryColor} />
      {params.badge && (
        <PptxText
          x={0.6}
          y={1.5}
          w={3.3}
          h={0.5}
          text={str(params.badge).toUpperCase()}
          color={theme.backgroundColor}
          fontSize={14}
          bold
        />
      )}
      <PptxText
        x={0.6}
        y={2}
        w={3.3}
        h={2.5}
        text={str(params.title)}
        color={theme.backgroundColor}
        fontSize={40}
        bold
      />
      {kpis.map((kpi, idx) => {
        const yPos = 1 + idx * 1.5;
        return (
          <React.Fragment key={idx}>
            <PptxText
              x={5.2}
              y={yPos}
              w={4.2}
              h={0.8}
              text={str(kpi.value)}
              color={theme.primaryColor}
              fontSize={54}
              bold
            />
            <PptxText
              x={5.2}
              y={yPos + 0.8}
              w={4.2}
              h={0.4}
              text={str(kpi.label)}
              color={theme.cardTitleColor}
              fontSize={18}
              bold
            />
            {Boolean(kpi.description) && (
              <PptxText
                x={5.2}
                y={yPos + 1.2}
                w={4.2}
                h={0.3}
                text={str(kpi.description)}
                color={theme.mutedTextColor}
                fontSize={13}
              />
            )}
          </React.Fragment>
        );
      })}
    </>
  );
};

// --- split_cards ---
const SplitCardsPreview: React.FC<{ params: Params; theme: PptxTheme }> = ({ params, theme }) => {
  const cards = arr<Record<string, unknown>>(params.cards);
  return (
    <>
      {params.badge && (
        <PptxText
          x={0.5}
          y={1.2}
          w={3.8}
          h={0.5}
          text={str(params.badge).toUpperCase()}
          color={theme.secondaryColor}
          fontSize={13}
          bold
        />
      )}
      <PptxText
        x={0.5}
        y={1.7}
        w={3.8}
        h={3}
        text={str(params.title)}
        color={theme.primaryColor}
        fontSize={38}
        bold
      />
      {cards.map((card, idx) => {
        const yPos = 0.8 + idx * 1.6;
        return (
          <React.Fragment key={idx}>
            <PptxBox x={4.5} y={yPos} w={5} h={1.4} fill={theme.rootCardBgColor} />
            <PptxText
              x={4.8}
              y={yPos + 0.2}
              w={4.4}
              h={0.4}
              text={str(card.title)}
              color={theme.cardTitleColor}
              fontSize={20}
              bold
            />
            <PptxText
              x={4.8}
              y={yPos + 0.7}
              w={4.4}
              h={0.6}
              text={str(card.body)}
              color={theme.mutedTextColor}
              fontSize={14}
            />
          </React.Fragment>
        );
      })}
    </>
  );
};

// --- image_with_list ---
const ImageWithListPreview: React.FC<{ params: Params; theme: PptxTheme }> = ({
  params,
  theme,
}) => {
  const features = arr<Record<string, unknown>>(params.features);
  return (
    <>
      {params.badge && (
        <PptxText
          x={0.6}
          y={0.4}
          w={8.8}
          h={0.3}
          text={str(params.badge).toUpperCase()}
          color={theme.secondaryColor}
          fontSize={12}
          bold
        />
      )}
      <PptxText
        x={0.6}
        y={0.7}
        w={8.8}
        h={0.6}
        text={str(params.title)}
        color={theme.primaryColor}
        fontSize={32}
        bold
      />
      <PptxBox
        x={0.6}
        y={1.5}
        w={4}
        h={3.5}
        fill={theme.rootCardBgColor}
        style={{ display: "flex", alignItems: "center", justifyContent: "center" }}
      >
        <span style={{ color: "#475569", fontSize: "0.7em", fontFamily: "Arial" }}>📷</span>
      </PptxBox>
      {features.map((feat, idx) => {
        const yPos = 1.6 + idx * 1.1;
        return (
          <React.Fragment key={idx}>
            <PptxText
              x={4.9}
              y={yPos}
              w={4.7}
              h={0.4}
              text={str(feat.title)}
              color={theme.cardTitleColor}
              fontSize={18}
              bold
            />
            <PptxText
              x={4.9}
              y={yPos + 0.4}
              w={4.7}
              h={0.6}
              text={str(feat.description)}
              color={theme.mutedTextColor}
              fontSize={13}
            />
          </React.Fragment>
        );
      })}
    </>
  );
};

// --- three_columns ---
const ThreeColumnsPreview: React.FC<{ params: Params; theme: PptxTheme }> = ({ params, theme }) => {
  const columns = arr<Record<string, unknown>>(params.columns);
  const colWidth = 2.8;
  const startX = 0.5;
  const spacing = 0.3;
  return (
    <>
      {params.badge && (
        <PptxText
          x={0.5}
          y={0.3}
          w={9}
          h={0.3}
          text={str(params.badge).toUpperCase()}
          color={theme.secondaryColor}
          fontSize={12}
          bold
          align="center"
        />
      )}
      <PptxText
        x={0.5}
        y={0.6}
        w={9}
        h={0.6}
        text={str(params.title)}
        color={theme.primaryColor}
        fontSize={32}
        bold
        align="center"
      />
      {params.subtitle && (
        <PptxText
          x={1}
          y={1.2}
          w={8}
          h={0.5}
          text={str(params.subtitle)}
          color={theme.bodyTextColor}
          fontSize={16}
          align="center"
        />
      )}
      {columns.slice(0, 3).map((col, idx) => {
        const cx = startX + idx * (colWidth + spacing);
        return (
          <React.Fragment key={idx}>
            <PptxBox x={cx} y={1.8} w={colWidth} h={3.5} fill={theme.rootCardBgColor} />
            <PptxText
              x={cx + 0.2}
              y={2.1}
              w={colWidth - 0.4}
              h={0.5}
              text={str(col.title)}
              color={theme.primaryColor}
              fontSize={20}
              bold
              align="center"
            />
            <PptxText
              x={cx + 0.2}
              y={2.6}
              w={colWidth - 0.4}
              h={2.5}
              text={str(col.body)}
              color={theme.mutedTextColor}
              fontSize={14}
              align="center"
            />
          </React.Fragment>
        );
      })}
    </>
  );
};

// --- quote_showcase ---
const QuoteShowcasePreview: React.FC<{ params: Params; theme: PptxTheme }> = ({
  params,
  theme,
}) => {
  const quoteText = str(params.statement);
  const fontConf = calculateDynamicFontConfig(quoteText.length, { size: 36 }, [
    { chars: 150, config: { size: 28 } },
    { chars: 300, config: { size: 24 } },
    { chars: 500, config: { size: 20 } },
    { chars: 800, config: { size: 16 } },
    { chars: 1200, config: { size: 14 } },
  ]);

  return (
    <>
      <PptxBox x={0} y={0} w={10} h={5.625} fill={theme.primaryColor} />
      {params.badge && (
        <PptxText
          x={1}
          y={0.6}
          w={8}
          h={0.4}
          text={str(params.badge).toUpperCase()}
          color={theme.backgroundColor}
          fontSize={13}
          bold
          align="center"
        />
      )}
      <PptxText
        x={1}
        y={1.2}
        w={8}
        h={3.6}
        text={`"${quoteText}"`}
        color={theme.backgroundColor}
        fontSize={fontConf.size}
        bold
        align="center"
        valign="middle"
      />
    </>
  );
};

// --- stats ---
const StatsPreview: React.FC<{ params: Params; theme: PptxTheme }> = ({ params, theme }) => {
  const stats = arr<Record<string, unknown>>(params.stats);
  const maxCols = 2;
  const statW = 3.5;
  const statH = 1.5;
  const startX = 1.5;
  const startY = 1.8;
  return (
    <>
      {params.badge && (
        <PptxText
          x={0.5}
          y={0.4}
          w={9}
          h={0.3}
          text={str(params.badge).toUpperCase()}
          color={theme.secondaryColor}
          fontSize={12}
          bold
          align="center"
        />
      )}
      <PptxText
        x={0.5}
        y={0.7}
        w={9}
        h={0.6}
        text={str(params.title)}
        color={theme.primaryColor}
        fontSize={36}
        bold
        align="center"
      />
      {stats.slice(0, 4).map((stat, idx) => {
        const row = Math.floor(idx / maxCols);
        const col = idx % maxCols;
        const cx = startX + col * (statW + 0.5);
        const cy = startY + row * (statH + 0.3);
        return (
          <React.Fragment key={idx}>
            <PptxBox
              x={cx}
              y={cy}
              w={statW}
              h={statH}
              fill={`color-mix(in srgb, ${theme.primaryColor} 5%, transparent)`}
            />
            <PptxBox x={cx} y={cy} w={statW} h={0.08} fill={theme.primaryColor} />
            <PptxText
              x={cx}
              y={cy + 0.3}
              w={statW}
              h={0.6}
              text={str(stat.value)}
              color={theme.cardTitleColor}
              fontSize={42}
              bold
              align="center"
            />
            <PptxText
              x={cx}
              y={cy + 0.9}
              w={statW}
              h={0.4}
              text={str(stat.label)}
              color={theme.primaryColor}
              fontSize={16}
              align="center"
              bold
            />
          </React.Fragment>
        );
      })}
    </>
  );
};

// --- team_grid ---
const TeamGridPreview: React.FC<{ params: Params; theme: PptxTheme }> = ({ params, theme }) => {
  const members = arr<Record<string, unknown>>(params.members);
  const memW = 2.0;
  const startX = 0.5;
  const spacing = (9 - 4 * memW) / 3;
  return (
    <>
      <PptxText
        x={0.5}
        y={0.5}
        w={9}
        h={0.6}
        text={str(params.title)}
        color={theme.primaryColor}
        fontSize={32}
        bold
        align="center"
      />
      {members.slice(0, 4).map((mem, idx) => {
        const cx = startX + idx * (memW + spacing);
        return (
          <React.Fragment key={idx}>
            <PptxBox x={cx} y={1.5} w={memW} h={3.5} fill={theme.rootCardBgColor} />
            <PptxOval x={cx + memW / 2 - 0.6} y={1.8} w={1.2} h={1.2} fill="#334155" />
            <PptxText
              x={cx + 0.1}
              y={3.2}
              w={memW - 0.2}
              h={0.4}
              text={str(mem.name)}
              color={theme.cardTitleColor}
              fontSize={16}
              bold
              align="center"
            />
            <PptxText
              x={cx + 0.1}
              y={3.6}
              w={memW - 0.2}
              h={0.3}
              text={str(mem.role)}
              color={theme.primaryColor}
              fontSize={12}
              align="center"
            />
            <PptxText
              x={cx + 0.1}
              y={4.0}
              w={memW - 0.2}
              h={0.8}
              text={str(mem.bio)}
              color={theme.mutedTextColor}
              fontSize={11}
              align="center"
            />
          </React.Fragment>
        );
      })}
    </>
  );
};

// --- diagram_slide ---
const DiagramSlidePreview: React.FC<{ params: Params; theme: PptxTheme }> = ({ params, theme }) => (
  <>
    {params.badge && (
      <PptxText
        x={0.5}
        y={0.4}
        w={9}
        h={0.3}
        text={str(params.badge).toUpperCase()}
        color={theme.secondaryColor}
        fontSize={12}
        bold
      />
    )}
    <PptxText
      x={0.5}
      y={0.7}
      w={9}
      h={0.6}
      text={str(params.title, "System Diagram")}
      color={theme.primaryColor}
      fontSize={32}
      bold
    />
    <PptxBox x={0.5} y={1.5} w={9} h={3.5} fill="#0F172A" />
    <PptxText
      x={0.7}
      y={1.7}
      w={8.6}
      h={3.1}
      text={"Mermaid Diagram Source Code:\n\n" + str(params.mermaidCode)}
      color="#38BDF8"
      fontSize={12}
    />
  </>
);

// --------------------------------------------------------------------------
// Slide type router
// --------------------------------------------------------------------------
const SLIDE_RENDERERS: Record<string, React.FC<{ params: Params; theme: PptxTheme }>> = {
  title_only: TitleOnlyPreview,
  text_block: TextBlockPreview,
  text_image: TextImagePreview,
  bullet_list: BulletListPreview,
  two_columns: TwoColumnsPreview,
  showcase: ShowcasePreview,
  split_kpi: SplitKpiPreview,
  split_cards: SplitCardsPreview,
  image_with_list: ImageWithListPreview,
  three_columns: ThreeColumnsPreview,
  quote_showcase: QuoteShowcasePreview,
  stats: StatsPreview,
  team_grid: TeamGridPreview,
  diagram_slide: DiagramSlidePreview,
};

// --------------------------------------------------------------------------
// Main exported component
// --------------------------------------------------------------------------

interface PptxSlidePreviewProps {
  slideTypeKey: string;
  params: Params;
  theme?: Partial<PptxTheme>;
  /** Width of container in px. Height is auto-calculated via 16:9. Default: 800 */
  width?: number;
  /** Optional label shown below the slide */
  label?: string;
}

const PptxSlidePreview: React.FC<PptxSlidePreviewProps> = ({
  slideTypeKey,
  params,
  theme = {},
  width = 800,
  label,
}) => {
  const mergedTheme: PptxTheme = { ...DEFAULT_THEME, ...theme };

  const bgHex = mergedTheme.backgroundColor.replace("#", "");
  const r = parseInt(bgHex.substring(0, 2), 16) || 0;
  const g = parseInt(bgHex.substring(2, 4), 16) || 0;
  const b = parseInt(bgHex.substring(4, 6), 16) || 0;
  const isDarkMode = (r * 299 + g * 587 + b * 114) / 1000 < 128;

  mergedTheme.bodyTextColor = "#" + tintShadeHex(bgHex, isDarkMode ? 0.75 : -0.75);
  mergedTheme.mutedTextColor = "#" + tintShadeHex(bgHex, isDarkMode ? 0.5 : -0.6);
  mergedTheme.cardTitleColor = "#" + tintShadeHex(bgHex, isDarkMode ? 0.95 : -0.95);
  mergedTheme.rootCardBgColor = "#" + tintShadeHex(bgHex, isDarkMode ? 0.08 : -0.05);

  const height = width * (PPTX_H / PPTX_W);
  const SlideContent = SLIDE_RENDERERS[slideTypeKey];

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
      <div
        style={{
          position: "relative",
          width,
          height,
          background: mergedTheme.backgroundColor.startsWith("#")
            ? mergedTheme.backgroundColor
            : `#${mergedTheme.backgroundColor}`,
          overflow: "hidden",
          containerType: "inline-size",
          boxShadow: "0 4px 24px rgba(0,0,0,0.5)",
          borderRadius: 4,
          flexShrink: 0,
        }}
      >
        {SlideContent ? (
          <SlideContent params={params} theme={mergedTheme} />
        ) : (
          <div
            style={{
              position: "absolute",
              inset: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#64748b",
              fontFamily: "Arial",
              fontSize: 14,
            }}
          >
            Unknown slide type: {slideTypeKey}
          </div>
        )}
      </div>
      {label && (
        <span style={{ color: "#94a3b8", fontSize: 12, fontFamily: "Arial" }}>{label}</span>
      )}
    </div>
  );
};

export default PptxSlidePreview;
