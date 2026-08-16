import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const BACKUP_DIR = path.join(__dirname, "..", "supabase_backup");
const DATA_DIR = path.join(BACKUP_DIR, "database_tables");
const MEDIA_DIR = path.join(BACKUP_DIR, "media_files", "frames");

fs.mkdirSync(DATA_DIR, { recursive: true });
fs.mkdirSync(MEDIA_DIR, { recursive: true });

async function importBackup() {
  const jsonPath = process.argv[2] || path.join(BACKUP_DIR, "library-backup.json");
  if (!fs.existsSync(jsonPath)) {
    console.error(`❌ Backup JSON file not found at: ${jsonPath}`);
    process.exit(1);
  }

  console.log("==========================================");
  console.log("🚀 SUPABASE BACKUP IMPORT RUNNER");
  console.log("==========================================");
  console.log(`Reading Backup File: ${jsonPath}`);

  const rawText = fs.readFileSync(jsonPath, "utf-8");
  let manifest;
  try {
    manifest = JSON.parse(rawText);
  } catch (e) {
    console.error("❌ Failed parsing backup JSON:", e.message);
    process.exit(1);
  }

  const images = manifest.images || [];
  const videos = manifest.videos || [];
  console.log(`Found ${images.length} images and ${videos.length} videos in manifest.`);

  // Save metadata tables
  fs.writeFileSync(path.join(DATA_DIR, "images.json"), JSON.stringify(images, null, 2));
  fs.writeFileSync(path.join(DATA_DIR, "videos.json"), JSON.stringify(videos, null, 2));
  console.log(`✅ Saved metadata tables to ${DATA_DIR}`);

  console.log("\n📥 Starting Media File Downloads...");
  let downloadedCount = 0;
  let errorCount = 0;

  for (let i = 0; i < images.length; i++) {
    const img = images[i];
    const url = img.backup_url;
    const relPath = img.storage_path || `${img.id}.jpg`;
    const destPath = path.join(MEDIA_DIR, ...relPath.split("/"));

    if (!url) {
      console.warn(`  [${i + 1}/${images.length}] Skipping ${img.name}: No backup_url`);
      errorCount++;
      continue;
    }

    try {
      fs.mkdirSync(path.dirname(destPath), { recursive: true });
      const res = await fetch(url);
      if (!res.ok) {
        throw new Error(`HTTP ${res.status} ${res.statusText}`);
      }
      const buffer = Buffer.from(await res.arrayBuffer());
      fs.writeFileSync(destPath, buffer);
      downloadedCount++;
      console.log(`  ✅ [${i + 1}/${images.length}] Saved: ${relPath} (${buffer.length} bytes)`);
    } catch (e) {
      console.warn(`  ⚠️ [${i + 1}/${images.length}] Failed downloading ${img.name}: ${e.message}`);
      errorCount++;
    }
  }

  console.log("\n==========================================");
  console.log("🎉 IMPORT & DOWNLOAD COMPLETE!");
  console.log(`Downloaded: ${downloadedCount} media files`);
  if (errorCount > 0) console.log(`Notes/Errors: ${errorCount} items`);
  console.log(`Media Files Path:    ${MEDIA_DIR}`);
  console.log(`Metadata Table Path: ${DATA_DIR}`);
  console.log("==========================================\n");
}

importBackup();
