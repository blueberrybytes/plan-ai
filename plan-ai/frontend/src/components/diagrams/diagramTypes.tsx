import React from "react";
import {
  AccountTree as AccountTreeIcon,
  TableChart as TableChartIcon,
  ViewTimeline as ViewTimelineIcon,
  Psychology as PsychologyIcon,
  DynamicFeed as DynamicFeedIcon,
  Storage as StorageIcon,
  AutoAwesome as AutoAwesomeIcon,
  Moving as MovingIcon,
  Map as MapIcon,
  DeviceHub as DeviceHubIcon,
  Timeline as TimelineIcon,
  PieChart as PieChartIcon,
  GridOn as GridOnIcon,
  ViewKanban as ViewKanbanIcon,
  AutoAwesomeMosaic as AutoAwesomeMosaicIcon,
} from "@mui/icons-material";

export interface DiagramTypeDefinition {
  id: string;
  label: string;
  icon: React.ReactNode;
  desc: string;
  sampleCode: string;
}

export const DIAGRAM_TYPES: DiagramTypeDefinition[] = [
  {
    id: "AUTO",
    label: "Auto-Detect",
    icon: <AutoAwesomeIcon fontSize="large" color="secondary" />,
    desc: "Let AI decide the best architectural format based on your prompt criteria.",
    sampleCode: `flowchart TD
  A[AI analyzes your prompt] --> B{What is the core structure?}
  B -- Logic or Process --> F[Flowchart]
  B -- Timeline or Steps --> S[Sequence Diagram]
  B -- Brainstorming --> M[Mindmap]
  B -- Project Schedule --> G[Gantt Chart]
  B -- Cloud Infrastructure --> C[Architecture Diagram]`,
  },
  {
    id: "FLOWCHART",
    label: "Flowchart",
    icon: <AccountTreeIcon fontSize="large" color="primary" />,
    desc: "Visualize a process flow or logic tree step-by-step.",
    sampleCode: `flowchart TD
  A[User Action] --> B{Is valid?}
  B -- Yes --> C[Process Data]
  B -- No --> D[Show Error]
  C --> E[Save to DB]`,
  },
  {
    id: "SEQUENCE",
    label: "Sequence",
    icon: <DynamicFeedIcon fontSize="large" color="secondary" />,
    desc: "Show interactions between systems or characters over time.",
    sampleCode: `sequenceDiagram
  Client->>Server: Request Config
  Server-->>Client: 200 OK (Config)
  Client->>DB: Query Data
  DB-->>Client: Return Results`,
  },
  {
    id: "GANTT",
    label: "Gantt Chart",
    icon: <ViewTimelineIcon fontSize="large" color="warning" />,
    desc: "Project schedules, timelines, and dependencies.",
    sampleCode: `gantt
  dateFormat  YYYY-MM-DD
  title Project Roadmap
  section Phase 1
  Planning :a1, 2026-01-01, 7d
  Design   :after a1, 5d`,
  },
  {
    id: "MINDMAP",
    label: "Mindmap",
    icon: <PsychologyIcon fontSize="large" color="success" />,
    desc: "Brainstorm ideas radiating from a central concept.",
    sampleCode: `mindmap
  root((Core Idea))
    Branch 1
      Detail A
      Detail B
    Branch 2
      Detail C`,
  },
  {
    id: "CLASS",
    label: "Class Diagram",
    icon: <TableChartIcon fontSize="large" color="info" />,
    desc: "Object-oriented programming structures and relationships.",
    sampleCode: `classDiagram
  class User {
    +String id
    +String name
    +login()
  }
  class Admin {
    +String role
  }
  User <|-- Admin`,
  },
  {
    id: "ER",
    label: "Entity-Relationship",
    icon: <StorageIcon fontSize="large" color="error" />,
    desc: "Database schemas, tables, and foreign keys.",
    sampleCode: `erDiagram
  USER ||--o{ POST : writes
  USER {
    string id
    string email
  }
  POST {
    string title
    text body
  }`,
  },
  {
    id: "ARCHITECTURE",
    label: "Architecture",
    icon: <AccountTreeIcon fontSize="large" color="primary" />,
    desc: "High-level cloud or system deployment architecture.",
    sampleCode: `architecture-beta
  service app(internet)[Client Application]
  service db(database)[PostgreSQL]
  service api(server)[Node Backend]
  app:R --> L:api
  api:R --> L:db`,
  },
  {
    id: "STATE",
    label: "State Diagram",
    icon: <MovingIcon fontSize="large" color="info" />,
    desc: "Finite state machines, system states, and component lifecycles.",
    sampleCode: `stateDiagram-v2
  [*] --> Still
  Still --> [*]
  Still --> Moving
  Moving --> Still
  Moving --> Crash
  Crash --> [*]`,
  },
  {
    id: "JOURNEY",
    label: "User Journey",
    icon: <MapIcon fontSize="large" color="success" />,
    desc: "Map user tasks, emotional states, and actors.",
    sampleCode: `journey
  title My working day
  section Go to work
    Make tea: 5: Me
    Go downstairs: 3: Me
    Do work: 1: Me, Cat`,
  },
  {
    id: "GIT",
    label: "Git Graph",
    icon: <DeviceHubIcon fontSize="large" color="primary" />,
    desc: "Version control branches, merges, and commits.",
    sampleCode: `gitGraph
  commit
  branch feature
  checkout feature
  commit
  checkout main
  merge feature`,
  },
  {
    id: "TIMELINE",
    label: "Timeline",
    icon: <TimelineIcon fontSize="large" color="warning" />,
    desc: "Chronological mapping of historical milestones.",
    sampleCode: `timeline
  title History of Social Media
  2002 : LinkedIn
  2004 : Facebook
  2006 : Twitter`,
  },
  {
    id: "PIE",
    label: "Pie Chart",
    icon: <PieChartIcon fontSize="large" color="secondary" />,
    desc: "Visualizing simple percentage or amount breakdowns.",
    sampleCode: `pie title Pets adopted by volunteers
  "Dogs" : 386
  "Cats" : 85
  "Rats" : 15`,
  },
  {
    id: "XYCHART",
    label: "XY Chart",
    icon: <TimelineIcon fontSize="large" color="action" />,
    desc: "Plot bar and line data series across x and y axes.",
    sampleCode: `xychart-beta
    title "Monthly Revenue (2026)"
    x-axis ["Jan", "Feb", "Mar", "Apr"]
    y-axis "Revenue (USD)" 0 --> 10000
    bar [4000, 5200, 8500, 6100]
    line [4000, 5200, 8500, 6100]`,
  },
  {
    id: "QUADRANT",
    label: "Quadrant Chart",
    icon: <GridOnIcon fontSize="large" color="success" />,
    desc: "Evaluate items across two axes (e.g. Effort vs. Impact, SWOT).",
    sampleCode: `quadrantChart
    title Reach and engagement of campaigns
    x-axis Low Reach --> High Reach
    y-axis Low Engagement --> High Engagement
    quadrant-1 We should expand
    quadrant-2 Need to promote
    quadrant-3 Re-evaluate
    quadrant-4 May be improved
    Campaign A: [0.3, 0.6]
    Campaign B: [0.45, 0.23]`,
  },
  {
    id: "KANBAN",
    label: "Kanban Board",
    icon: <ViewKanbanIcon fontSize="large" color="info" />,
    desc: "Visually manage tasks and workflows by state.",
    sampleCode: `kanban
    Todo
      [Create specs]
      [Design mockups]
    In Progress
      [Develop backend]
    Done
      [Setup repo]`,
  },
  {
    id: "SANKEY",
    label: "Sankey Flow",
    icon: <MovingIcon fontSize="large" color="warning" />,
    desc: "Flow diagrams indicating the quantity or volume of transfers.",
    sampleCode: `sankey-beta
    Budget, Salary, 5000
    Budget, Tools, 1000
    Budget, Marketing, 2000
    Salary, Engineering, 3500
    Salary, Sales, 1500`,
  },
  {
    id: "BLOCK",
    label: "Block Diagram",
    icon: <AutoAwesomeMosaicIcon fontSize="large" color="primary" />,
    desc: "High level abstract component topologies and layouts.",
    sampleCode: `block-beta
    columns 1
    db(("Database"))
    blockArrowId6<["fa:fa-spinner"]>(up)
    server["Server"]
    blockArrowId6<["fa:fa-spinner"]>(down)
    client["Client"]`,
  },
];
