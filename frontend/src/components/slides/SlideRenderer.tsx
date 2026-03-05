import React from "react";
import { Box, Typography } from "@mui/material";
import TextImageSlide from "./components/TextImageSlide";
import TitleOnlySlide from "./components/TitleOnlySlide";
import TextBlockSlide from "./components/TextBlockSlide";
import BulletListSlide from "./components/BulletListSlide";
import TwoColumnsSlide from "./components/TwoColumnsSlide";
import TeamGridSlide from "./components/TeamGridSlide";
import ShowcaseSlide from "./components/ShowcaseSlide";
import StatsSlide from "./components/StatsSlide";
import SplitKpiSlide from "./components/SplitKpiSlide";
import SplitCardsSlide from "./components/SplitCardsSlide";
import ImageWithListSlide from "./components/ImageWithListSlide";
import ThreeColumnsSlide from "./components/ThreeColumnsSlide";
import QuoteShowcaseSlide from "./components/QuoteShowcaseSlide";
import DiagramSlide from "./components/DiagramSlide";

export interface SlideProps {
  data: Record<string, unknown>;
  brandColors?: {
    primary?: string;
    secondary?: string;
    background?: string;
    backgroundStyle?: "solid" | "gradient" | "mesh" | "minimal";
    cardStyle?: "flat" | "glass" | "outline";
  };
  fonts?: {
    heading?: string;
    body?: string;
  };
  scale?: number;
  animate?: boolean;
}

// ─── Slide Renderer dispatcher ───────────────────────────────────────

const slideRenderers: Record<string, React.FC<SlideProps>> = {
  title_only: TitleOnlySlide,
  text_block: TextBlockSlide,
  text_image: TextImageSlide,
  bullet_list: BulletListSlide,
  two_columns: TwoColumnsSlide,
  team_grid: TeamGridSlide,
  showcase: ShowcaseSlide,
  stats: StatsSlide,
  split_kpi: SplitKpiSlide,
  split_cards: SplitCardsSlide,
  image_with_list: ImageWithListSlide,
  three_columns: ThreeColumnsSlide,
  quote_showcase: QuoteShowcaseSlide,
  diagram_slide: DiagramSlide,
};

interface SlideRendererProps extends SlideProps {
  typeKey: string;
}

const SlideRenderer: React.FC<SlideRendererProps> = ({ typeKey, ...rest }) => {
  const Renderer = slideRenderers[typeKey];
  if (!Renderer) {
    return (
      <Box sx={{ p: 4, color: "error.main" }}>
        <Typography>Unknown slide type: {typeKey}</Typography>
      </Box>
    );
  }
  return <Renderer {...rest} />;
};

export default SlideRenderer;
