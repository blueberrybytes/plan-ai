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
// Standalone StdIO to SSE Proxy for Plan AI MCP
// Connects to the SSE endpoint and forwards JSON-RPC messages

const token = "${token}";
const endpoint = "${endpoint}".replace("localhost", "127.0.0.1");

// Ensure errors flush to stderr before exiting
function fatalError(err) {
  console.error("FATAL ERROR:", err?.stack || err);
  setTimeout(() => process.exit(1), 200);
}

process.on('uncaughtException', fatalError);
process.on('unhandledRejection', fatalError);

let postUrl = null;
const messageQueue = [];

async function start() {
  try {
    const response = await fetch(endpoint, {
      headers: {
        "Authorization": "Bearer " + token
      }
    });

    if (!response.ok) {
      fatalError(\`Failed to connect to SSE: HTTP \${response.status} \${response.statusText}\`);
      return;
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    // Read lines from stdin
    const readline = require('readline');
    const rl = readline.createInterface({
      input: process.stdin,
      terminal: false
    });

    rl.on('line', async (line) => {
      if (!line.trim()) return;
      if (!postUrl) {
        messageQueue.push(line);
      } else {
        await sendMessage(line);
      }
    });

    async function sendMessage(msg) {
      try {
        await fetch(postUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: msg
        });
      } catch (err) {
        fatalError(err);
      }
    }

    let eventType = "message";
    let eventData = [];
    
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\\n');
      buffer = lines.pop() || "";
      
      for (const line of lines) {
        if (line === '') {
          if (eventData.length > 0) {
            const dataStr = eventData.join('\\n');
            if (eventType === 'endpoint') {
              postUrl = new URL(dataStr, endpoint).toString().replace("localhost", "127.0.0.1");
              // Flush queue
              while (messageQueue.length > 0) {
                await sendMessage(messageQueue.shift());
              }
            } else {
              // Write JSON-RPC response to stdout
              process.stdout.write(dataStr + "\\n");
            }
          }
          eventType = "message";
          eventData = [];
        } else if (line.startsWith('event:')) {
          eventType = line.slice(6).trim();
        } else if (line.startsWith('data:')) {
          // SSE data lines have a space after the colon, optionally
          eventData.push(line.slice(5).replace(/^ /, ''));
        }
      }
    }
  } catch (error) {
    fatalError(error);
  }
}

start();
`;

  zip.folder("server")?.file("index.js", scriptContent);

  // 3. Generate and download zip as .mcpb
  const blob = await zip.generateAsync({ type: "blob" });
  saveAs(blob, "plan-ai.mcpb");
};
