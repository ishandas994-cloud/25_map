# Building Mapper

Walk a building floor by floor, log each point — room, toilet, lift,
stairwell, entrance — and how many steps it took to get there, and get an
auto-generated blueprint-style path map. Data is stored in **MongoDB** so
it's easy to plug into another project later.

## Folder structure

```
building-mapper/
├── package.json         # dependencies + start script
├── server.js            # Express server: REST API + serves the frontend
├── mongo.js             # MongoDB connection singleton
├── .env.example         # copy to .env and set your MongoDB connection string
├── public/               # everything the browser loads
│   ├── index.html
│   ├── styles.css
│   └── app.js            # talks to the API, renders Record + Map views
├── .gitignore
└── README.md
```

## 1. Get a MongoDB database

Pick whichever is easier for you:

**Option A — MongoDB Atlas (free, no install, recommended)**
1. Sign up at https://www.mongodb.com/cloud/atlas and create a free (M0)
   cluster.
2. Under "Connect" → "Drivers", copy the connection string. It looks like
   `mongodb+srv://<user>:<password>@<cluster-url>/`.
3. Paste it into `.env` as `MONGODB_URI` (see step 2 below).

**Option B — Local MongoDB**
1. Install MongoDB Community Server for your OS:
   https://www.mongodb.com/docs/manual/administration/install-community/
2. Start it (`mongod`, or as a service depending on your OS).
3. Use `MONGODB_URI=mongodb://127.0.0.1:27017` in `.env`.

## 2. Configure and run

```bash
cd building-mapper
cp .env.example .env
# edit .env and paste in your MONGODB_URI
npm install
npm start
```

Open **http://localhost:3000**. From your friend's phone, use
**http://YOUR-COMPUTER-IP:3000** if you're both on the same Wi-Fi (find your
IP with `ipconfig` on Windows or `ifconfig` / `ip a` on Mac/Linux) — or, if
you used Atlas, deploy this folder to a small host (Render, Railway,
Fly.io, etc.) so it's reachable from anywhere.

The app creates the `building_mapper` database and `points` collection
automatically the first time you save a point — nothing to set up by hand.

## How the data is modeled

Every logged point (a classroom, toilet, faculty room, library, lab, lift,
stairwell, or entrance) is one document in the `points` collection:

```json
{
  "_id": "ObjectId(...)",
  "floor": 1,
  "block": "A",
  "room": "104",
  "type": "classroom",
  "direction": "right",
  "steps": 8,
  "position": 3,
  "createdAt": "2026-07-28T10:15:00.000Z"
}
```

| field       | meaning                                                              |
|-------------|-----------------------------------------------------------------------|
| floor       | 1–4                                                                    |
| block       | `A`, `B`, or `C` — each floor has 3 independent blocks/wings           |
| room        | room number / label your friend typed in                              |
| type        | `classroom`, `toilet_girls`, `toilet_boys`, `faculty`, `library`, `lab`, `lift`, `stairwell`, `entrance`, or `other` |
| direction   | `front`, `back`, `left`, or `right` — which way from the *previous* point on this block, relative to the floor plan (not the direction your friend was facing) |
| steps       | steps counted from the previous point, in that direction               |
| position    | walking order within that floor+block (0, 1, 2, ...)                   |
| createdAt   | timestamp                                                              |

The first point logged in each block has `direction: null` and `steps: 0`
— it's the reference/start point everything else is measured from.

**Why direction matters:** with just step counts, every floor draws as one
straight line. Since real floors have rows and columns of rooms, each
point is now placed at real (x, y) coordinates built by walking the
direction + step vectors from the block's start point — Front/Back move
it up/down, Left/Right move it side to side. That's what lets the map
show an actual grid layout instead of a flattened hallway.

Because `type` and `block` are plain fields, any other project reading
this same MongoDB collection can filter precisely — e.g. every girls'
toilet on floor 2, block B: `db.points.find({ floor: 2, block: "B", type: "toilet_girls" })`.

On the map, each type gets its own color and short badge (CR, GIRLS,
BOYS, FAC, LIB, LAB, LIFT, STAIR, ENT) with a legend under the floor/block
title, and each connecting line shows both the direction arrow and exact
step count (e.g. `→ 8`).

## REST API (useful for a separate native app later)

| Method | Endpoint                                    | Purpose                              |
|--------|-----------------------------------------------|----------------------------------------|
| GET    | `/api/floors`                                | point counts for all 4 floors           |
| GET    | `/api/floors/:floor/blocks`                  | point counts for blocks A/B/C on a floor |
| GET    | `/api/floors/:floor/blocks/:block/points`    | ordered list of points in a block        |
| POST   | `/api/floors/:floor/blocks/:block/points`    | add a point `{ room, type, direction, steps }` |
| DELETE | `/api/floors/:floor/blocks/:block/points/:id`| delete one point                        |
| DELETE | `/api/floors/:floor/blocks/:block`           | clear every point in a block             |

`floor` is `1`–`4`, `block` is `A`/`B`/`C`. `direction` is required for
every point except the first one logged in a block (which has no
previous point to be relative to).

Since it's a plain REST API over MongoDB, a future mobile app (React
Native, Flutter, etc.) — or a completely different project — can read the
same collection directly with any MongoDB driver, no need to go through
this server at all if you don't want to.

## Extending it later

- **Reordering**: no drag-to-reorder yet — fix a misplaced point by
  deleting and re-adding it.
- **Diagonal/angled corridors**: direction is currently 4-way
  (Front/Back/Left/Right). If a corridor angles diagonally, the closest
  approximation is splitting it into two points (e.g. Front then Right).
- **Multiple entrances per block**: right now each block is one connected
  path from its first logged point. If a block has two separate entry
  points that don't connect through steps, log them as a different block
  letter, or extend the schema with a `segment` field.
