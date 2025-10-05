import express from "express";

const router = express.Router();

// Temporary in-memory data store
let nodes = [
  { id: 1, name: "Library", building: "A", floor: "1", coordinates: "10,20" },
  { id: 2, name: "Cafeteria", building: "B", floor: "2", coordinates: "30,40" }
];

// GET /api/nodes
router.get("/", (req, res) => {
  const { name, floor } = req.query;

  let results = nodes;

  if (name) {
    const regex = new RegExp(name, "i"); // case-insensitive
    results = results.filter(n => regex.test(n.name));
  }

  if (floor) {
    results = results.filter(n => n.floor === floor);
  }

  res.json(results);
});

// POST /api/nodes
router.post("/", (req, res) => {
  const { name, building, floor, coordinates } = req.body;

  if (!name || !building || !floor || !coordinates) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  const newNode = {
    id: nodes.length ? nodes[nodes.length - 1].id + 1 : 1,
    name,
    building,
    floor,
    coordinates
  };

  nodes.push(newNode);

  res.status(201).json(newNode);
});

export default router;
