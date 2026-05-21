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

const endpoint = "${endpoint}";
const token = "${token}";

const fs = require('fs');
function logDebug(msg) {
  try { fs.appendFileSync('/tmp/plan-ai-mcp.log', new Date().toISOString() + ' [MCP Proxy] ' + msg + '\\n'); } catch (e) {}
}

let postUrl = null;
const messageQueue = [];

async function start() {
  try {
    logDebug("Starting proxy script, connecting to: " + endpoint);
    const response = await fetch(endpoint, {
      headers: {
        "Authorization": "Bearer " + token
      }
    });

    if (!response.ok) {
      logDebug(\`Failed to connect to SSE: HTTP \${response.status} \${response.statusText}\`);
      console.error(\`Failed to connect to SSE: HTTP \${response.status} \${response.statusText}\`);
      process.exit(1);
    }
    logDebug("Connected to SSE stream successfully.");

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
      logDebug("Received line from stdin: " + line);
      if (!postUrl) {
        logDebug("postUrl not ready, queuing message.");
        messageQueue.push(line);
      } else {
        await sendMessage(line);
      }
    });

    async function sendMessage(msg) {
      try {
        logDebug("Sending POST message to: " + postUrl);
        const res = await fetch(postUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: msg
        });
        logDebug("POST result status: " + res.status);
      } catch (err) {
        logDebug("Failed to send message: " + err.message);
        console.error("Failed to send message:", err);
      }
    }

    let eventType = "message";
    let eventData = [];
    
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        logDebug("SSE stream reader returned done: true");
        break;
      }
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\\n');
      buffer = lines.pop() || "";
      
      for (const line of lines) {
        if (line === '') {
          if (eventData.length > 0) {
            const dataStr = eventData.join('\\n');
            if (eventType === 'endpoint') {
              postUrl = new URL(dataStr, endpoint).toString();
              logDebug("Received endpoint event, postUrl set to: " + postUrl);
              // Flush queue
              while (messageQueue.length > 0) {
                const queuedMsg = messageQueue.shift();
                logDebug("Flushing queued message");
                await sendMessage(queuedMsg);
              }
            } else {
              logDebug("Writing JSON-RPC response to stdout: " + dataStr);
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
    logDebug("SSE connection error: " + error.stack);
    console.error("SSE connection error:", error);
    process.exit(1);
  } finally {
    logDebug("Proxy script start() function finished. Exiting naturally.");
  }
}

start();
`;

  zip.folder("server")?.file("index.js", scriptContent);

  // 3. Generate and download zip as .mcpb
  const blob = await zip.generateAsync({ type: "blob" });
  saveAs(blob, "plan-ai.mcpb");
};
