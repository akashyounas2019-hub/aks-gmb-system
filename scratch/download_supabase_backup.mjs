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

// Custom fetch to pass user JWT token as apikey & Authorization bearer header
function createAuthFetch(apiKey, userToken) {
  return (input, init) => {
    const headers = new Headers(init?.headers ? init.headers : undefined);
    const effectiveKey = userToken || apiKey;

    headers.set("apikey", effectiveKey);
    if (userToken) {
      headers.set("Authorization", `Bearer ${userToken}`);
    }

    return fetch(input, { ...init, headers });
  };
}

const supabase = createClient(supabaseUrl, accessToken || supabaseKey, {
  global: {
    fetch: createAuthFetch(supabaseKey, accessToken),
  },
});

const BACKUP_DIR = path.join(__dirname, "..", "supabase_backup");
const DATA_DIR = path.join(BACKUP_DIR, "database_tables");
const MEDIA_DIR = path.join(BACKUP_DIR, "media_files");

fs.mkdirSync(DATA_DIR, { recursive: true });
fs.mkdirSync(MEDIA_DIR, { recursive: true });

// All database tables
const TABLES = [
  "automations",
  "automation_runs",
  "competitors",
  "competitor_rank_history",
  "gmb_credentials",
  "gmb_tokens",
  "images",
  "image_collections",
  "image_folders",
  "image_keywords",
  "image_tags",
  "keywords",
  "keyword_folders",
  "location_history",
  "notifications",
  "post_drafts",
  "rank_snapshots",
  "scheduled_posts",
  "user_integrations",
  "user_preferences",
  "user_roles",
  "venues",
  "videos",
];

async function backupDatabase() {
  console.log("\n📦 Starting Database Tables Backup...");
  for (const table of TABLES) {
    try {
      const { data, error } = await supabase.from(table).select("*");
      if (error) {
        console.warn(`  ⚠️ Table '${table}' fetch note: ${error.message}`);
        continue;
      }
      const filePath = path.join(DATA_DIR, `${table}.json`);
      fs.writeFileSync(filePath, JSON.stringify(data ?? [], null, 2));
      console.log(`  ✅ Backed up '${table}': ${(data ?? []).length} rows -> ${table}.json`);
    } catch (e) {
      console.error(`  ❌ Failed backing up '${table}':`, e.message);
    }
  }
}

// Recursively list storage items preserving subfolder hierarchy
async function listStorageFolder(bucketName, folderPath = "") {
  let files = [];
  const { data, error } = await supabase.storage.from(bucketName).list(folderPath, {
    limit: 500,
    offset: 0,
    sortBy: { column: "name", order: "asc" },
  });

  if (error) {
    console.warn(
      `  ⚠️ Error listing storage folder '${bucketName}/${folderPath}': ${error.message}`,
    );
    return files;
  }

  for (const item of data ?? []) {
    const itemPath = folderPath ? `${folderPath}/${item.name}` : item.name;
    if (item.id === null || !item.metadata) {
      // Subfolder directory -> recurse
      const subFiles = await listStorageFolder(bucketName, itemPath);
      files = files.concat(subFiles);
    } else {
      // File
      files.push({ name: item.name, path: itemPath, size: item.metadata?.size ?? 0 });
    }
  }
  return files;
}

async function backupStorage() {
  console.log("\n🖼️ Starting Storage & Media Files Backup...");
  let buckets = [];
  const { data: bucketList, error } = await supabase.storage.listBuckets();
  if (error || !bucketList || bucketList.length === 0) {
    buckets = [{ name: "frames" }];
  } else {
    buckets = bucketList;
  }

  for (const b of buckets) {
    const bucketName = b.name;
    console.log(`\n📂 Scanning bucket '${bucketName}'...`);
    const files = await listStorageFolder(bucketName, "");
    console.log(`  Found ${files.length} media file(s) in bucket '${bucketName}'.`);

    for (const f of files) {
      try {
        const { data, error } = await supabase.storage.from(bucketName).download(f.path);
        if (error) {
          console.warn(`  ⚠️ Failed downloading '${f.path}': ${error.message}`);
          continue;
        }
        const arrayBuffer = await data.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);

        const localPath = path.join(MEDIA_DIR, bucketName, ...f.path.split("/"));
        fs.mkdirSync(path.dirname(localPath), { recursive: true });
        fs.writeFileSync(localPath, buffer);
        console.log(`  💾 Downloaded: ${bucketName}/${f.path} (${buffer.length} bytes)`);
      } catch (e) {
        console.error(`  ❌ Error processing file '${f.path}':`, e.message);
      }
    }
  }
}

async function runBackup() {
  console.log("==========================================");
  console.log("🚀 SUPABASE FULL DATA & MEDIA BACKUP RUNNER");
  console.log("==========================================");
  console.log(`Connecting to: ${supabaseUrl}`);
  if (accessToken) {
    console.log("🔑 User JWT Session Token Active (akashyounas2019@gmail.com)");
  }
  console.log(`Output Directory: ${BACKUP_DIR}`);

  await backupDatabase();
  await backupStorage();

  console.log("\n==========================================");
  console.log("🎉 BACKUP COMPLETE!");
  console.log(`Database tables saved to: ${DATA_DIR}`);
  console.log(`Media files saved to:    ${MEDIA_DIR}`);
  console.log("==========================================\n");
}

runBackup();
