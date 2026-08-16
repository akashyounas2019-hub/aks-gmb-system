import { createClient } from "@supabase/supabase-js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Read credentials from .env
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

if (!supabaseUrl || !supabaseKey) {
  console.error("❌ Error: Missing SUPABASE_URL or SUPABASE_PUBLISHABLE_KEY in .env");
  process.exit(1);
}

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

async function restoreDatabaseImages() {
  const backupJsonPath = path.join(__dirname, "..", "supabase_backup", "library-backup.json");
  if (!fs.existsSync(backupJsonPath)) {
    console.error(`❌ Backup JSON file not found at: ${backupJsonPath}`);
    process.exit(1);
  }

  console.log("==========================================");
  console.log("🚀 RESTORING BACKUP DATA TO WEBSITE UI");
  console.log("==========================================");

  const manifest = JSON.parse(fs.readFileSync(backupJsonPath, "utf-8"));
  const images = manifest.images || [];
  const userId = manifest.user_id || "261b23bd-33ae-486e-94d7-c9af60834381";

  console.log(`Restoring ${images.length} images for user ID: ${userId}...`);

  const rowsToInsert = images.map((img) => {
    const { backup_url, ...cleanRow } = img;
    return {
      ...cleanRow,
      owner_id: userId,
    };
  });

  // Batch insert in chunks of 50
  const BATCH_SIZE = 50;
  let inserted = 0;
  let errors = 0;

  for (let i = 0; i < rowsToInsert.length; i += BATCH_SIZE) {
    const chunk = rowsToInsert.slice(i, i + BATCH_SIZE);
    const { data, error } = await supabase.from("images").upsert(chunk, { onConflict: "id" });
    if (error) {
      console.warn(`  ⚠️ Batch ${i / BATCH_SIZE + 1} note: ${error.message}`);
      errors++;
    } else {
      inserted += chunk.length;
      console.log(
        `  ✅ Restored batch ${i / BATCH_SIZE + 1}: ${chunk.length} items (Total: ${inserted}/${rowsToInsert.length})`,
      );
    }
  }

  console.log("\n==========================================");
  console.log("🎉 DATABASE RESTORE COMPLETE!");
  console.log(`Restored ${inserted} images into your Image Library UI.`);
  console.log("Open http://localhost:8085/library to view them!");
  console.log("==========================================\n");
}

restoreDatabaseImages();
