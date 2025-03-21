import bodyParser from "body-parser";
import express from "express";
import axios from "axios";
import crypto from "crypto";
import { BASE_USER_PORT, REGISTRY_PORT } from "../config";
import { Server } from "http";

export type SendMessageBody = {
  message: string;
};

// Store messages per user
const userMessages: Record<number, { lastReceivedMessage: string | null; lastSentMessage: string | null }> = {};

export function user(userId: number): Promise<Server> {
  return new Promise((resolve) => {
    const _user = express();
    _user.use(express.json());
    _user.use(bodyParser.json());

    // Initialize user's message storage
    userMessages[userId] = { lastReceivedMessage: null, lastSentMessage: null };

    // ✅ Status route
    _user.get("/status", (req, res) => {
      res.send("live");
    });

    // ✅ Handle received messages
    _user.post("/message", (req, res) => {
  try {
    const { message } = req.body as SendMessageBody;

    if (!message) {
      return res.status(400).json({ error: "Message is required" });
    }

    userMessages[userId].lastReceivedMessage = message;
    console.log(`📩 User ${userId} received message: ${message}`);

    return res.status(200).send("success"); // ✅ Send plain text "success"
  } catch (error) {
    console.error(`❌ Error handling message for user ${userId}:`, error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
});


    // ✅ Retrieve last received message
    _user.get("/getLastReceivedMessage", (req, res) => {
      return res.json({ result: userMessages[userId].lastReceivedMessage });
    });

    // ✅ Retrieve last sent message
    _user.get("/getLastSentMessage", (req, res) => {
      return res.json({ result: userMessages[userId].lastSentMessage });
    });

    // ✅ Start server and return it as a promise
    const server = _user.listen(BASE_USER_PORT + userId, () => {
      console.log(`👤 User ${userId} is running on port ${BASE_USER_PORT + userId}`);
      resolve(server); // Return the server instance
    });
  });
}
