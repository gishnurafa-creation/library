import express from "express";
import { createServer as createViteServer } from "vite";
import Database from "better-sqlite3";
import path from "path";

const db = new Database("attendance.db");

// Initialize database
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    embedding TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    type TEXT CHECK(type IN ('IN', 'OUT')),
    FOREIGN KEY(user_id) REFERENCES users(id)
  );
`);

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '10mb' }));

  const PORT = 3000;

  // API Routes
  app.get("/api/users", (req, res) => {
    const users = db.prepare("SELECT id, name, created_at FROM users").all();
    res.json(users);
  });

  app.post("/api/users/register", (req, res) => {
    const { name, embedding } = req.body;
    if (!name || !embedding) return res.status(400).json({ error: "Missing name or embedding" });
    
    try {
      const info = db.prepare("INSERT INTO users (name, embedding) VALUES (?, ?)").run(name, JSON.stringify(embedding));
      res.json({ id: info.lastInsertRowid, name });
    } catch (error) {
      res.status(500).json({ error: "Failed to register user" });
    }
  });

  app.post("/api/attendance/log", (req, res) => {
    const { userId, type } = req.body;
    if (!userId || !type) return res.status(400).json({ error: "Missing data" });

    try {
      db.prepare("INSERT INTO logs (user_id, type) VALUES (?, ?)").run(userId, type);
      const user = db.prepare("SELECT name FROM users WHERE id = ?").get(userId);
      res.json({ success: true, name: user.name });
    } catch (error) {
      res.status(500).json({ error: "Failed to log attendance" });
    }
  });

  app.get("/api/attendance/logs", (req, res) => {
    const logs = db.prepare(`
      SELECT logs.*, users.name 
      FROM logs 
      JOIN users ON logs.user_id = users.id 
      ORDER BY logs.timestamp DESC 
      LIMIT 100
    `).all();
    res.json(logs);
  });

  app.get("/api/users/embeddings", (req, res) => {
    const users = db.prepare("SELECT id, name, embedding FROM users").all();
    const formatted = users.map(u => ({
      id: u.id,
      name: u.name,
      embedding: JSON.parse(u.embedding)
    }));
    res.json(formatted);
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(process.cwd(), "dist")));
    app.get("*", (req, res) => {
      res.sendFile(path.join(process.cwd(), "dist", "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
