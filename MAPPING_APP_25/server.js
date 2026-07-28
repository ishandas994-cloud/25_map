// server.js — REST API (MongoDB-backed) + static file server for the app.
const express = require('express');
const path = require('path');
const { ObjectId } = require('mongodb');
const { connect, getDb } = require('./mongo');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const VALID_TYPES = ['room', 'toilet', 'lift', 'stairwell', 'entrance', 'other'];
const validFloor = (f) => Number.isInteger(f) && f >= 1 && f <= 4;

function points() {
  return getDb().collection('points');
}

function serialize(doc) {
  return {
    id: doc._id.toString(),
    floor: doc.floor,
    room: doc.room,
    type: doc.type,
    steps: doc.steps,
    position: doc.position,
    createdAt: doc.createdAt,
  };
}

// ---------- Routes ----------

// Point counts per floor (for the floor tab badges)
app.get('/api/floors', async (req, res) => {
  const results = await points().aggregate([
    { $group: { _id: '$floor', count: { $sum: 1 } } },
  ]).toArray();
  const summary = { 1: 0, 2: 0, 3: 0, 4: 0 };
  results.forEach((r) => { summary[r._id] = r.count; });
  res.json(summary);
});

// All points for one floor, in walking order
app.get('/api/floors/:floor/points', async (req, res) => {
  const floor = parseInt(req.params.floor, 10);
  if (!validFloor(floor)) return res.status(400).json({ error: 'Floor must be 1-4' });

  const docs = await points().find({ floor }).sort({ position: 1 }).toArray();
  res.json(docs.map(serialize));
});

// Add a new point to the end of a floor's path
app.post('/api/floors/:floor/points', async (req, res) => {
  const floor = parseInt(req.params.floor, 10);
  if (!validFloor(floor)) return res.status(400).json({ error: 'Floor must be 1-4' });

  const room = (req.body.room || '').toString().trim();
  if (!room) return res.status(400).json({ error: 'Room number is required' });

  let type = (req.body.type || 'room').toString().toLowerCase();
  if (!VALID_TYPES.includes(type)) type = 'other';

  const last = await points().find({ floor }).sort({ position: -1 }).limit(1).toArray();
  const nextPosition = last.length ? last[0].position + 1 : 0;
  const isFirstPoint = nextPosition === 0;
  const steps = isFirstPoint ? 0 : (parseInt(req.body.steps, 10) || 0);

  const doc = {
    floor,
    room,
    type,
    steps,
    position: nextPosition,
    createdAt: new Date(),
  };

  const result = await points().insertOne(doc);
  res.status(201).json(serialize({ _id: result.insertedId, ...doc }));
});

// Delete a single point
app.delete('/api/floors/:floor/points/:id', async (req, res) => {
  const floor = parseInt(req.params.floor, 10);
  if (!validFloor(floor)) return res.status(400).json({ error: 'Floor must be 1-4' });
  if (!ObjectId.isValid(req.params.id)) return res.status(400).json({ error: 'Invalid id' });

  await points().deleteOne({ _id: new ObjectId(req.params.id), floor });
  res.status(204).end();
});

// Clear every point on a floor
app.delete('/api/floors/:floor', async (req, res) => {
  const floor = parseInt(req.params.floor, 10);
  if (!validFloor(floor)) return res.status(400).json({ error: 'Floor must be 1-4' });

  await points().deleteMany({ floor });
  res.status(204).end();
});

// ---------- Startup ----------
connect()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Building Mapper running at http://localhost:${PORT}`);
    });
  })
  .catch((err) => {
    console.error('Failed to connect to MongoDB:', err.message);
    console.error('Check MONGODB_URI in your .env file — see .env.example.');
    process.exit(1);
  });