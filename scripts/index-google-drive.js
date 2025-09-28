#!/usr/bin/env node

// Simple runner for the Google Drive indexing job
// This can be run from the command line or scheduled as a cron job

const path = require('path')

// Add the project root to the module path
const projectRoot = path.resolve(__dirname, '..')
require('module')._cache = {}

// Import and run the indexing job
async function runIndexJob() {
  try {
    // Dynamic import the TypeScript job (assuming it's compiled or using ts-node)
    const { runIndexingJobCLI } = await import('../src/jobs/indexGoogleDrive')
    await runIndexingJobCLI()
  } catch (error) {
    console.error('Failed to run indexing job:', error)
    process.exit(1)
  }
}

runIndexJob()