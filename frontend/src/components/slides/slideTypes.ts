/**
 * Frontend-side slide type definitions with sample data for previews.
 */

export interface SlideTypeDefinition {
  key: string;
  name: string;
  description: string;
  sampleData: Record<string, unknown>;
}

export const SLIDE_TYPES: SlideTypeDefinition[] = [
  {
    key: "title_only",
    name: "Title Slide",
    description: "Opening or closing slide with a large title and optional subtitle.",
    sampleData: {
      title: "Q1 Strategy Review",
      subtitle: "Building the future, one sprint at a time",
    },
  },
  {
    key: "text_block",
    name: "Text Block",
    description: "Full-width text content with a title and body paragraph.",
    sampleData: {
      title: "Our Mission",
      body: "We are building the next generation of AI-powered project management tools that help teams ship faster, communicate better, and make smarter decisions with real-time insights from every meeting and conversation.",
    },
  },
  {
    key: "text_image",
    name: "Text + Image",
    description: "Split layout with text on the left and an image placeholder on the right.",
    sampleData: {
      title: "Product Demo",
      body: "Our platform integrates directly with your workflow, providing AI-generated tasks from meeting transcripts and real-time project tracking.",
      imageQuery: "productivity dashboard",
    },
  },
  {
    key: "bullet_list",
    name: "Bullet List",
    description: "Title with a list of bullet points for features, steps, or key points.",
    sampleData: {
      title: "Key Features",
      bullets: [
        "AI-powered transcript analysis",
        "Automatic task generation",
        "Real-time collaboration",
        "Integration with Jira & Linear",
        "Custom branded presentations",
      ],
    },
  },
  {
    key: "two_columns",
    name: "Two Columns",
    description: "Two-column layout for comparisons, pros/cons, or side-by-side content.",
    sampleData: {
      title: "Before vs After",
      leftTitle: "Manual Process",
      leftBody:
        "Hours spent writing meeting notes, manually creating tickets, and tracking follow-ups across spreadsheets.",
      rightTitle: "With Plan AI",
      rightBody:
        "Automatic transcription, AI-generated tasks, and seamless integration with your project management tools.",
    },
  },
  {
    key: "team_grid",
    name: "Team Members",
    description: "Grid of team member cards with name, role, and short bio.",
    sampleData: {
      title: "Our Team",
      members: [
        { name: "Alex Chen", role: "CEO & Founder", bio: "10+ years in product management" },
        { name: "Maria Lopez", role: "CTO", bio: "Former lead engineer at Scale AI" },
        { name: "James Park", role: "Head of Design", bio: "Award-winning UX designer" },
        { name: "Sara Ahmed", role: "VP Engineering", bio: "Building teams that ship" },
      ],
    },
  },
  {
    key: "showcase",
    name: "Showcase",
    description: "Large image area with a title and caption for demos or product screenshots.",
    sampleData: {
      title: "Live Dashboard",
      imageQuery: "analytics dashboard",
      caption:
        "Real-time project insights at your fingertips — track velocity, blockers, and team health all in one view.",
    },
  },
  {
    key: "stats",
    name: "Key Stats",
    description: "Display key metrics or statistics prominently.",
    sampleData: {
      title: "Q1 Results",
      stats: [
        { label: "Revenue Growth", value: "+42%" },
        { label: "Active Users", value: "12.4K" },
        { label: "NPS Score", value: "78" },
        { label: "Uptime", value: "99.9%" },
      ],
    },
  },
];
