import bodyParser from "body-parser";
import express from "express";
import { BASE_USER_PORT } from "../config";

export type SendMessageBody = {
  message: string;
};

export async function user(userId: number) {
  const _user = express();
  _user.use(express.json());
  _user.use(bodyParser.json());

  let lastReceivedMessage: string | null = null;
  let lastSentMessage: string | null = null;

  // ✅ Status route
  _user.get("/status", (req, res) => {
    res.send("live");
  });

  // ✅ Fix: Ensure all paths return a response
  _user.post("/message", (req, res) => {
    try {
      const { message } = req.body as SendMessageBody;

      if (!message) {
        return res.status(400).json({ error: "Message is required" });
      }

      lastReceivedMessage = message;
      console.log(`📩 User ${userId} received message: ${message}`);

      return res.status(200).json({ success: true });
    } catch (error) {
      console.error(`❌ Error handling message for user ${userId}:`, error);
      return res.status(500).json({ error: "Internal Server Error" });
    }
  });

  // ✅ Retrieve last received message
  _user.get("/getLastReceivedMessage", (req, res) => {
    return res.json({ result: lastReceivedMessage });
  });

  // ✅ Retrieve last sent message
  _user.get("/getLastSentMessage", (req, res) => {
    return res.json({ result: lastSentMessage });
  });

  // ✅ Start server
  const server = _user.listen(BASE_USER_PORT + userId, () => {
    console.log(`👤 User ${userId} is running on port ${BASE_USER_PORT + userId}`);
  });

  return server;
}

import axios from "axios";
import crypto from "crypto";
import { REGISTRY_PORT } from "../config";

export async function sendMessage(userId: number, message: string, destinationUserId: number) {
  try {
    // Fetch registered nodes
    const { data } = await axios.get(`http://localhost:${REGISTRY_PORT}/getNodes`);
    const nodes = data.nodes;
    
    if (nodes.length < 3) {
      throw new Error("Not enough nodes in the network");
    }
    
    // Select 3 random distinct nodes
    const circuit = nodes.sort(() => 0.5 - Math.random()).slice(0, 3);

    let encryptedMessage = message;
    let nextDestination = destinationUserId.toString().padStart(10, "0");

    for (const node of circuit.reverse()) {
      const symmetricKey = crypto.randomBytes(32);
      const cipher = crypto.createCipheriv("aes-256-cbc", symmetricKey, Buffer.alloc(16, 0));
      let encryptedLayer = cipher.update(nextDestination + encryptedMessage, "utf8", "base64");
      encryptedLayer += cipher.final("base64");
      
      const encryptedKey = crypto.publicEncrypt({
        key: node.pubKey,
        padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
      }, symmetricKey);
      
      encryptedMessage = encryptedKey.toString("base64") + encryptedLayer;
      nextDestination = node.nodeId.toString().padStart(10, "0");
    }
    
    // Send to entry node
    await axios.post(`http://localhost:${4000 + circuit[0].nodeId}/message`, {
      message: encryptedMessage,
    });
  } catch (error) {
    console.error("Failed to send message:", error);
  }
}