import bodyParser from "body-parser";
import express from "express";
import axios from "axios";
import crypto from "crypto";
import { BASE_ONION_ROUTER_PORT, REGISTRY_PORT } from "../config";

export async function simpleOnionRouter(nodeId: number) {
  const onionRouter = express();
  onionRouter.use(express.json());
  onionRouter.use(bodyParser.json());

  let lastReceivedEncryptedMessage: string | null = null;
  let lastReceivedDecryptedMessage: string | null = null;
  let lastMessageDestination: number | null = null;

  // ✅ Generate an actual RSA key pair
  const { privateKey, publicKey } = crypto.generateKeyPairSync("rsa", {
    modulusLength: 2048,
    publicKeyEncoding: { type: "spki", format: "pem" },
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
  });

  // Store the private key securely in memory
  const privateKeyBase64 = Buffer.from(privateKey).toString("base64");

  // ✅ Register node with the registry AFTER server starts
  async function registerNode() {
    try {
      await axios.post(`http://localhost:${REGISTRY_PORT}/registerNode`, {
        nodeId,
        pubKey: publicKey, // ✅ Use the actual public key
      });
      console.log(`✅ Node ${nodeId} registered successfully.`);
    } catch (error) {
      console.error(`❌ Failed to register node ${nodeId}:`, error);
    }
  }

  // ✅ Implement the required /getPrivateKey route
  onionRouter.get("/getPrivateKey", (req, res) => {
    res.json({ result: privateKeyBase64 });
  });

  // ✅ Implement the status route
  onionRouter.get("/status", (req, res) => {
    res.send("live");
  });

  // ✅ Implement GET routes for node message tracking
  onionRouter.get("/getLastReceivedEncryptedMessage", (req, res) => {
    res.json({ result: lastReceivedEncryptedMessage });
  });

  onionRouter.get("/getLastReceivedDecryptedMessage", (req, res) => {
    res.json({ result: lastReceivedDecryptedMessage });
  });

  onionRouter.get("/getLastMessageDestination", (req, res) => {
    res.json({ result: lastMessageDestination });
  });

  // Start the server and register the node after it's running
  const server = onionRouter.listen(BASE_ONION_ROUTER_PORT + nodeId, () => {
    console.log(`🚀 Onion router ${nodeId} is running on port ${BASE_ONION_ROUTER_PORT + nodeId}`);
    registerNode(); // ✅ Register after the server is running
  });

  onionRouter.post("/message", async (req, res) => {
    try {
      const { message } = req.body;
      const privateKey = crypto.createPrivateKey(privateKeyBase64);
      
      const encryptedKey = Buffer.from(message.slice(0, 344), "base64");
      const encryptedLayer = message.slice(344);
      
      const symmetricKey = crypto.privateDecrypt({
        key: privateKey,
        padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
      }, encryptedKey);
      
      const decipher = crypto.createDecipheriv("aes-256-cbc", symmetricKey, Buffer.alloc(16, 0));
      let decrypted = decipher.update(encryptedLayer, "base64", "utf8");
      decrypted += decipher.final("utf8");
      
      const nextDestination = parseInt(decrypted.slice(0, 10), 10);
      const decryptedMessage = decrypted.slice(10);
      
      if (nextDestination >= 5000) {
        await axios.post(`http://localhost:${nextDestination}/message`, { message: decryptedMessage });
      } else {
        lastReceivedDecryptedMessage = decryptedMessage;
      }
      res.sendStatus(200);
    } catch (error) {
      console.error("Failed to process message:", error);
      res.status(500).json({ error: "Message processing failed" });
    }
  });
  
  return server;
}
