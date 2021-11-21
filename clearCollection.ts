import { connect } from './mongodb';

const collectionsNames = process.argv.slice(2);

connect(async (db) => {
  for(const name of collectionsNames) {
    try {
      await db.collection(name).drop();
      console.log('\x1b[32m', `Collection ${name} successfully dropped`)
    } catch (error) {
      console.error('\x1b[31m', name, error);
    }
  }
})