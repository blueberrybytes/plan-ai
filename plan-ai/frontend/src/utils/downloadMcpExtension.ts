import JSZip from 'jszip';
import { saveAs } from 'file-saver';

export const downloadMcpExtension = async (token: string, endpoint: string) => {
  const zip = new JSZip();

  // 1. Create manifest.json
  const manifest = {
    manifest_version: "0.3",
    name: "plan-ai-mcp",
    display_name: "Plan AI",
    version: "1.0.0",
    description: "Connects Claude Desktop to your Plan AI workspace.",
    author: {
      name: "Plan AI"
    },
    server: {
      type: "node",
      entry_point: "server/index.js",
      mcp_config: {
        command: "node",
        args: ["server/index.js"]
      }
    }
  };

  zip.file("manifest.json", JSON.stringify(manifest, null, 2));

  // 2. Create server/index.js
  const scriptContent = `#!/usr/bin/env node
const { spawnSync } = require('child_process');
const os = require('os');

console.error("Starting Plan AI MCP connection...");

const args = [
  '-y',
  'mcp-remote@latest',
  '${endpoint}',
  '--token',
  '${token}'
];

const cmd = os.platform() === 'win32' ? 'npx.cmd' : 'npx';
const result = spawnSync(cmd, args, { stdio: 'inherit' });

if (result.error) {
  console.error("Failed to start mcp-remote:", result.error);
  process.exit(1);
}

process.exit(result.status || 0);
`;

  zip.folder("server")?.file("index.js", scriptContent);

  // 3. Generate and download zip as .mcpb
  const blob = await zip.generateAsync({ type: "blob" });
  saveAs(blob, "plan-ai.mcpb");
};
