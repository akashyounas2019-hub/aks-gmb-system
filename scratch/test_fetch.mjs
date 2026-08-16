import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const envPath = path.join(__dirname, "..", ".env");
let envVars = {};
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, "utf-8");
  envContent.split(/\r?\n/).forEach((line) => {
    const match = line.match(/^\s*([\w.-]+)\s*=\s*["']?(.*?)["']?\s*$/);
    if (match) envVars[match[1]] = match[2];
  });
}

const supabaseUrl = envVars.SUPABASE_URL;
const apiKey = envVars.SUPABASE_PUBLISHABLE_KEY;
const userToken = envVars.SUPABASE_ACCESS_TOKEN;

console.log("Testing Supabase endpoints...");

async function testEndpoint(url, headers) {
  try {
    const res = await fetch(url, { headers });
    const text = await res.text();
    console.log(`URL: ${url}`);
    console.log(`Status: ${res.status}`);
    console.log(`Response: ${text.slice(0, 300)}\n`);
  } catch (e) {
    console.error(`Fetch failed for ${url}:`, e.message);
  }
}

// 1. Direct Supabase Rest with apikey & Bearer userToken
await testEndpoint(`${supabaseUrl}/rest/v1/keywords?select=*`, {
  apikey: apiKey,
  Authorization: `Bearer ${userToken}`,
});

// 2. Direct Supabase Rest with userToken as apikey
await testEndpoint(`${supabaseUrl}/rest/v1/keywords?select=*`, {
  apikey: userToken,
  Authorization: `Bearer ${userToken}`,
});

// 3. Lovable App Proxy Rest
await testEndpoint(`https://preview--aks-gmb-system.lovable.app/rest/v1/keywords?select=*`, {
  apikey: apiKey,
  Authorization: `Bearer ${userToken}`,
});
