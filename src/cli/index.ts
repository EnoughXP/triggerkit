#!/usr/bin/env node
import init from './init'

const command = process.argv[2];

async function run() {
  switch (command) {
    case 'init':
      await init();
      break;
    default:
      console.log('Usage: triggerkit init');
      process.exit(1);
  }
}

run().catch(error => {
  console.error('Error:', error.message);
  process.exit(1);
})