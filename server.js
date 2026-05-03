require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { MongoClient, ObjectId } = require('mongodb');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const MONGODB_URI = process.env.MONGODB_URI;

let db = null;
let decksCollection = null;
let cardsCollection = null;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname)));

async function connectDB() {
  if (db) return;
  try {
    const client = new MongoClient(MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    await client.connect();
    db = client.db('flashcards');
    decksCollection = db.collection('decks');
    cardsCollection = db.collection('cards');
    console.log('Connected to MongoDB');
  } catch (error) {
    console.error('MongoDB connection error:', error);
    process.exit(1);
  }
}

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', db: db ? 'connected' : 'disconnected' });
});

app.post('/api/decks', async (req, res) => {
  if (!db) return res.status(503).json({ error: 'Database not connected' });
  try {
    const { name } = req.body;
    const deck = { name: name.trim() || 'New deck', cards: [], createdAt: new Date() };
    const result = await decksCollection.insertOne(deck);
    res.json({ id: result.insertedId.toString(), ...deck });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/decks', async (req, res) => {
  if (!db) return res.status(503).json({ error: 'Database not connected' });
  try {
    const decks = await decksCollection.find({}).toArray();
    res.json(decks.map((deck) => ({ id: deck._id.toString(), name: deck.name, cards: deck.cards || [] })));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/decks/:id', async (req, res) => {
  if (!db) return res.status(503).json({ error: 'Database not connected' });
  try {
    const deck = await decksCollection.findOne({ _id: new ObjectId(req.params.id) });
    if (!deck) return res.status(404).json({ error: 'Deck not found' });
    res.json({ id: deck._id.toString(), name: deck.name, cards: deck.cards || [] });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.put('/api/decks/:id', async (req, res) => {
  if (!db) return res.status(503).json({ error: 'Database not connected' });
  try {
    const { name, cards } = req.body;
    const result = await decksCollection.updateOne(
      { _id: new ObjectId(req.params.id) },
      { $set: { name: name || undefined, cards: cards || undefined }.filter((v) => v !== undefined) }
    );
    if (result.matchedCount === 0) return res.status(404).json({ error: 'Deck not found' });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/decks/:id', async (req, res) => {
  if (!db) return res.status(503).json({ error: 'Database not connected' });
  try {
    const result = await decksCollection.deleteOne({ _id: new ObjectId(req.params.id) });
    if (result.deletedCount === 0) return res.status(404).json({ error: 'Deck not found' });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/decks/:id/cards', async (req, res) => {
  if (!db) return res.status(503).json({ error: 'Database not connected' });
  try {
    const { term, definition } = req.body;
    if (!term || !definition) return res.status(400).json({ error: 'Term and definition required' });
    const card = { term: term.trim(), definition: definition.trim() };
    const result = await decksCollection.updateOne(
      { _id: new ObjectId(req.params.id) },
      { $push: { cards: card } }
    );
    if (result.matchedCount === 0) return res.status(404).json({ error: 'Deck not found' });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/decks/:deckId/cards/:cardIndex', async (req, res) => {
  if (!db) return res.status(503).json({ error: 'Database not connected' });
  try {
    const index = parseInt(req.params.cardIndex, 10);
    if (isNaN(index)) return res.status(400).json({ error: 'Invalid card index' });
    const deck = await decksCollection.findOne({ _id: new ObjectId(req.params.deckId) });
    if (!deck) return res.status(404).json({ error: 'Deck not found' });
    deck.cards.splice(index, 1);
    await decksCollection.updateOne({ _id: new ObjectId(req.params.deckId) }, { $set: { cards: deck.cards } });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.listen(PORT, async () => {
  await connectDB();
  console.log(`Server running on http://localhost:${PORT}`);
});
