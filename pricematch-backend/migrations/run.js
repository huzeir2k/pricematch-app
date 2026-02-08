/**
 * Migration Runner Utility
 * 
 * Automatically discovers and runs all migrations in sequence
 * Run with: node migrations/run.js
 */

import path from 'path';
import { fileURLToPath } from 'url';
import { promises as fs } from 'fs';
import mongoose from 'mongoose';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const runMigrations = async () => {
  const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/pricematch';
  
  try {
    console.log('🔄 Database Migration Runner');
    console.log('=============================\n');
    
    // Connect to MongoDB
    await mongoose.connect(mongoUri);
    console.log(`✓ Connected to MongoDB: ${mongoUri}\n`);

    // Get all migration files (numbered files like 001-*.js)
    const files = await fs.readdir(__dirname);
    const migrations = files
      .filter(f => /^\d{3}-.*\.js$/.test(f) && f !== 'run.js')
      .sort();

    if (migrations.length === 0) {
      console.log('ℹ️  No migrations found');
      process.exit(0);
    }

    console.log(`Found ${migrations.length} migration(s):\n`);

    for (const migration of migrations) {
      try {
        console.log(`\n▶️  Running: ${migration}`);
        console.log('─'.repeat(50));
        
        const migrationModule = await import(`./${migration}`);
        
        // Migrations should call process.exit() when done
        await new Promise(resolve => {
          // Wait for the migration to complete
          setTimeout(() => {
            // This shouldn't be reached if migration properly exits
            console.warn(`⚠️  Migration ${migration} didn't exit properly`);
            resolve();
          }, 30000); // 30 second timeout
        });
      } catch (error) {
        if (error.code !== 0 && !error.message.includes('process.exit')) {
          console.error(`\n❌ Migration failed: ${migration}`);
          console.error(error);
          process.exit(1);
        }
      }
    }

    console.log('\n\n✅ All migrations completed successfully!');
    process.exit(0);
  } catch (error) {
    console.error('\n❌ Migration runner failed:', error);
    process.exit(1);
  }
};

runMigrations().catch(error => {
  console.error('Unexpected error:', error);
  process.exit(1);
});
