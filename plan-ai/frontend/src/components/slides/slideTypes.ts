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
      iconName: "AutoAwesome",
    },
  },
  {
    key: "text_block",
    name: "Text Block",
    description: "Full-width text content with a title and body paragraph.",
    sampleData: {
      title: "Our Mission",
      subtitle: "The driving force behind our innovation",
      iconName: "Lightbulb",
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
      subtitle: "Everything you need to scale your workflows",
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
      badge: "Performance",
      title: "Q1 Results",
      stats: [
        { label: "Revenue Growth", value: "+42%" },
        { label: "Active Users", value: "12.4K" },
        { label: "NPS Score", value: "78" },
        { label: "Uptime", value: "99.9%" },
      ],
    },
  },
  {
    key: "split_kpi",
    name: "Split KPI",
    description: "High impact split layout with large metrics on one side.",
    sampleData: {
      badge: "The Impact",
      title: "Radical Delivery Efficiency",
      imageQuery: "modern clean startup office",
      kpis: [
        { value: ">50%", label: "Time Saved", description: "On manual resizing & exporting tasks" },
        { value: "0", label: "Brand Errors", description: "Zero typographic or color mismatches" },
        { value: "100%", label: "Strategic Focus", description: "More time for big ideas" },
      ],
    },
  },
  {
    key: "split_cards",
    name: "Split Cards",
    description: "Split layout with a stacking grid of descriptive feature cards.",
    sampleData: {
      badge: "Technical Core",
      title: "Smart Backgrounds & Adaptive Typography",
      imageQuery: "abstract 3d architecture blue",
      cards: [
        {
          title: "Generative AI",
          body: "Outpainting backgrounds to fit any ratio without losing quality.",
          iconName: "AutoAwesome",
        },
        {
          title: "Dynamic Rendering",
          body: "Design rules that guarantee legible text across all formats.",
          iconName: "TextFields",
        },
        {
          title: "Multiformat Export",
          body: "Generate all campaign pieces with a single click.",
          iconName: "Download",
        },
      ],
    },
  },
  {
    key: "image_with_list",
    name: "Image with List",
    description: "Medium layout presenting sequential features or workflows effectively.",
    sampleData: {
      badge: "The Problem",
      title: "The Hell of Manual Adaptations",
      body: "Each campaign requires dozens of formats. Every adaptation is an opportunity for error.",
      imageQuery: "broken graphic design layers",
      features: [
        {
          title: "Distortion & Cropping",
          description: "Going from 1080x1080 to 9:16 without losing essence is a daily nightmare.",
        },
        {
          title: "Text Overflow",
          description: "The copy that worked in a square spills over in a landscape or story.",
        },
        {
          title: "Brand Inconsistency",
          description: "Replicating fonts and colors 50 times multiplies human error.",
        },
      ],
    },
  },
  {
    key: "three_columns",
    name: "Three Columns",
    description: "Three equal columns mapping out value props or processes.",
    sampleData: {
      badge: "Our Vision",
      title: "Not an Editor, your Intelligent Assistant",
      subtitle: "A system that thinks with you, not just executes. Built to empower your team.",
      columns: [
        {
          title: "Ideation over Edition",
          body: "AI suggests backgrounds and variations predicting creative needs.",
          iconName: "Lightbulb",
        },
        {
          title: "Total Context",
          body: "A system that 'knows' the brand manual: colors, typography, tone of voice.",
          iconName: "Psychology",
        },
        {
          title: "Zero Friction",
          body: "Direct integration with the tools you already use: Figma, Photoshop, etc.",
          iconName: "Settings",
        },
      ],
    },
  },
  {
    key: "quote_showcase",
    name: "Quote Showcase",
    description: "Massive impactful quote with a full bleed background.",
    sampleData: {
      badge: "Before Agency",
      statement: "Automating 90% of the manual work to free up 100% of the strategic talent.",
      imageQuery: "futuristic sleek server room blue",
    },
  },
  {
    key: "diagram_slide",
    name: "System Diagram",
    description:
      "A large Mermaid diagram visualizing processes, systems, architectures, or sequences.",
    sampleData: {
      badge: "Architecture",
      title: "High-Level System Flow",
      mermaidCode: "graph TD\n  A[Client] --> B(Gateway)\n  B --> C{Database}",
    },
  },
];
