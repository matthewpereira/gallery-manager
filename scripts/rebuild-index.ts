/**
 * Rebuild Album Index Utility
 *
 * This script rebuilds the master album index (albums/index.json) from existing album folders.
 *
 * Run this script:
 * 1. After migrating from Imgur to R2
 * 2. If the index becomes corrupted
 * 3. To create the initial index for existing albums
 *
 * Usage:
 *   npx tsx scripts/rebuild-index.ts
 */

import { R2Adapter } from '../src/services/storage/adapters/R2Adapter';

async function main() {
  console.log('🔧 Album Index Rebuild Utility\n');

  try {
    // Create R2 adapter instance
    console.log('📡 Connecting to R2...');
    const adapter = new R2Adapter();

    // Mark as authenticated (R2 uses API keys, no OAuth needed)
    adapter.setAuthenticated(true);

    // Rebuild the index
    console.log('🔄 Scanning albums and rebuilding index...\n');
    const result = await adapter.rebuildAlbumIndex();

    console.log('\n✅ Index rebuild complete!');
    console.log(`📊 Albums indexed: ${result.albumCount}`);

    if (result.errors.length > 0) {
      console.log(`\n⚠️  Errors encountered: ${result.errors.length}`);
      result.errors.forEach((error, i) => {
        console.log(`  ${i + 1}. ${error}`);
      });
    } else {
      console.log('✨ No errors - all albums indexed successfully');
    }

    console.log('\n💡 The album index will now be used for fast album loading.');
    console.log('   Expected performance: 1 request instead of 170+ requests');
  } catch (error) {
    console.error('\n❌ Failed to rebuild index:', error);
    process.exit(1);
  }
}

main();
