const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const crypto = require("crypto");

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  maxHttpBufferSize: 2e6,
  cors: { origin: "*" }
});

const PORT = process.env.PORT || 3000;
const appRoot = __dirname;

app.use(express.static(require("path").join(appRoot, "public")));

app.get("/health", (_req, res) => res.json({ ok: true }));

const rooms = new Map();
const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const DRAW_SECONDS = 90;
const PROMPT_SECONDS = 90;
