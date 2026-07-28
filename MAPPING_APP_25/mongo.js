// mongo.js — MongoDB connection singleton.
// Works with either a local MongoDB server or a free MongoDB Atlas cluster —
// just set MONGODB_URI in your .env file (see .env.example).
require('dotenv').config();
const { MongoClient } = require('mongodb');

const uri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017';
const dbName = process.env.MONGODB_DB || 'building_mapper';

const client = new MongoClient(uri);
let db = null;

async function connect() {
  if (db) return db;
  await client.connect();
  db = client.db(dbName);

  // Helpful indexes: fast lookup by floor, ordered by walking position.
  await db.collection('points').createIndex({ floor: 1, position: 1 });

  console.log(`Connected to MongoDB (db: ${dbName})`);
  return db;
}

function getDb() {
  if (!db) throw new Error('MongoDB not connected yet — call connect() first');
  return db;
}

module.exports = { connect, getDb, client };