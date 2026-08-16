import { createClient } from "@supabase/supabase-js";
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

const supabaseUrl = envVars.SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseKey = envVars.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_PUBLISHABLE_KEY;
const accessToken = envVars.SUPABASE_ACCESS_TOKEN || process.env.SUPABASE_ACCESS_TOKEN;

function isNewSupabaseApiKey(value) {
  return value.startsWith("sb_publishable_") || value.startsWith("sb_secret_");
}

function createSupabaseFetch(key, userToken) {
  return (input, init) => {
    const headers = new Headers(init?.headers ? init.headers : undefined);

    if (isNewSupabaseApiKey(key) && headers.get("Authorization") === `Bearer ${key}`) {
      headers.delete("Authorization");
    }

    headers.set("apikey", key);
    if (userToken) {
      headers.set("Authorization", `Bearer ${userToken}`);
    }

    return fetch(input, { ...init, headers });
  };
}

const supabase = createClient(supabaseUrl, supabaseKey, {
  global: {
    fetch: createSupabaseFetch(supabaseKey, accessToken),
  },
});

async function checkImages() {
  const { data: userData } = await supabase.auth.getUser();
  console.log("Current User JWT Email:", userData?.user?.email, "| User ID:", userData?.user?.id);

  const { data: images, count, error } = await supabase
    .from("images")
    .select("id, name, owner_id", { count: "exact" })
    .is("deleted_at", null);

  if (error) {
    console.error("Error querying images:", error.message);
    return;
  }

  console.log(`\nTotal Images Visible to Query: ${images.length} (Total count: ${count})`);

  const ownerCounts = {};
  images.forEach((img) => {
    const owner = img.owner_id || "NULL";
    ownerCounts[owner] = (ownerCounts[owner] || 0) + 1;
  });

  console.log("Breakdown by owner_id:");
  console.table(ownerCounts);
}

checkImages();
