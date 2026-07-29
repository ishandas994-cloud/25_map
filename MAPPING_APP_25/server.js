// server.js — REST API (MongoDB-backed) + static file server for the app.
const express = require('express');
const path = require('path');
const { ObjectId } = require('mongodb');
const { connect, getDb } = require('./mongo');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const VALID_TYPES = [
  'classroom', 'toilet_girls', 'toilet_boys', 'faculty',
  'library', 'lab', 'lift', 'stairwell', 'entrance', 'other',
];
const VALID_DIRECTIONS = ['front', 'back', 'left', 'right'];
const VALID_BLOCKS = ['A', 'B', 'C'];

const validFloor = (f) => Number.isInteger(f) && f >= 1 && f <= 4;
const validBlock = (b) => VALID_BLOCKS.includes((b || '').toUpperCase());

function points() {
  return getDb().collection('points');
}

function serialize(doc) {
  return {
    id: doc._id.toString(),
    floor: doc.floor,
    block: doc.block,
    room: doc.room,
    type: doc.type,
    steps: doc.steps,
    direction: doc.direction,
    position: doc.position,
    createdAt: doc.createdAt,
  };
}

// ---------- Routes ----------

// Total point counts per floor, across all blocks (for the floor tab badges)
app.get('/api/floors', async (req, res) => {
  const results = await points().aggregate([
    { $group: { _id: '$floor', count: { $sum: 1 } } },
  ]).toArray();
  const summary = { 1: 0, 2: 0, 3: 0, 4: 0 };
  results.forEach((r) => { summary[r._id] = r.count; });
  res.json(summary);
});

// Point counts per block (A/B/C) for one floor (for the block tab badges)
app.get('/api/floors/:floor/blocks', async (req, res) => {
  const floor = parseInt(req.params.floor, 10);
  if (!validFloor(floor)) return res.status(400).json({ error: 'Floor must be 1-4' });

  const results = await points().aggregate([
    { $match: { floor } },
    { $group: { _id: '$block', count: { $sum: 1 } } },
  ]).toArray();
  const summary = { A: 0, B: 0, C: 0 };
  results.forEach((r) => { summary[r._id] = r.count; });
  res.json(summary);
});

// All points for one floor + block, in walking order
app.get('/api/floors/:floor/blocks/:block/points', async (req, res) => {
  const floor = parseInt(req.params.floor, 10);
  const block = (req.params.block || '').toUpperCase();
  if (!validFloor(floor)) return res.status(400).json({ error: 'Floor must be 1-4' });
  if (!validBlock(block)) return res.status(400).json({ error: 'Block must be A, B, or C' });

  const docs = await points().find({ floor, block }).sort({ position: 1 }).toArray();
  res.json(docs.map(serialize));
});

// Add a new point to the end of a floor+block's path
app.post('/api/floors/:floor/blocks/:block/points', async (req, res) => {
  const floor = parseInt(req.params.floor, 10);
  const block = (req.params.block || '').toUpperCase();
  if (!validFloor(floor)) return res.status(400).json({ error: 'Floor must be 1-4' });
  if (!validBlock(block)) return res.status(400).json({ error: 'Block must be A, B, or C' });

  const room = (req.body.room || '').toString().trim();
  if (!room) return res.status(400).json({ error: 'Room number is required' });

  let type = (req.body.type || 'classroom').toString().toLowerCase();
  if (!VALID_TYPES.includes(type)) type = 'other';

  const last = await points().find({ floor, block }).sort({ position: -1 }).limit(1).toArray();
  const nextPosition = last.length ? last[0].position + 1 : 0;
  const isFirstPoint = nextPosition === 0;

  const steps = isFirstPoint ? 0 : (parseInt(req.body.steps, 10) || 0);

  let direction = (req.body.direction || '').toString().toLowerCase();
  if (isFirstPoint) {
    direction = null; // start point has no "coming from" direction
  } else if (!VALID_DIRECTIONS.includes(direction)) {
    return res.status(400).json({ error: 'Direction must be front, back, left, or right' });
  }

  const doc = {
    floor,
    block,
    room,
    type,
    steps,
    direction,
    position: nextPosition,
    createdAt: new Date(),
  };

  const result = await points().insertOne(doc);
  res.status(201).json(serialize({ _id: result.insertedId, ...doc }));
});

// Delete a single point
app.delete('/api/floors/:floor/blocks/:block/points/:id', async (req, res) => {
  const floor = parseInt(req.params.floor, 10);
  const block = (req.params.block || '').toUpperCase();
  if (!validFloor(floor)) return res.status(400).json({ error: 'Floor must be 1-4' });
  if (!validBlock(block)) return res.status(400).json({ error: 'Block must be A, B, or C' });
  if (!ObjectId.isValid(req.params.id)) return res.status(400).json({ error: 'Invalid id' });

  await points().deleteOne({ _id: new ObjectId(req.params.id), floor, block });
  res.status(204).end();
});

// Clear every point on a floor+block
app.delete('/api/floors/:floor/blocks/:block', async (req, res) => {
  const floor = parseInt(req.params.floor, 10);
  const block = (req.params.block || '').toUpperCase();
  if (!validFloor(floor)) return res.status(400).json({ error: 'Floor must be 1-4' });
  if (!validBlock(block)) return res.status(400).json({ error: 'Block must be A, B, or C' });

  await points().deleteMany({ floor, block });
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
