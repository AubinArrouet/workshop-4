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

  // ✅ Generate a unique RSA key pair for this node
  const { privateKey, publicKey } = crypto.generateKeyPairSync("rsa", {
    modulusLength: 2048,
    publicKeyEncoding: { type: "spki", format: "pem" },
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
  });

  // ✅ Register node with the registry AFTER server starts
  // In simpleOnionRouter.ts

// Modify the registerNode function to strip PEM headers
async function registerNode() {
  try {
    // Extract the base64 part of the public key (remove headers and footers)
    const pubKeyBase64 = publicKey
      .replace('-----BEGIN PUBLIC KEY-----\n', '')
      .replace('-----END PUBLIC KEY-----\n', '')
      .replace(/\n/g, '');
    
    await axios.post(`http://localhost:${REGISTRY_PORT}/registerNode`, {
      nodeId,
      pubKey: pubKeyBase64, // Send only the base64 part
    });
    console.log(`✅ Node ${nodeId} registered successfully.`);
  } catch (error: any) {
    console.error(`❌ Failed to register node ${nodeId}:`, error.response?.data || error.message);
  }
}

// Ensure proper handling of the private key route
onionRouter.get("/getPrivateKey", (req, res) => {
  try {
    // Extract just the base64 portion of the private key, removing headers and footers
    const privateKeyBase64 = privateKey
      .replace(/-----BEGIN PRIVATE KEY-----|\n|-----END PRIVATE KEY-----/g, '')
      .trim();
    
    // Make sure to set the content type to JSON
    res.setHeader('Content-Type', 'application/json');
    
    // Return the result in the expected format
    res.json({ result: privateKeyBase64 });
  } catch (error) {
    console.error(`❌ Error retrieving private key:`, error);
    res.status(500).json({ error: "Failed to get private key" });
  }
});
  // ✅ Implement the status route
  onionRouter.get("/status", (req, res) => {
    res.send("live");
  });

  // ✅ Implement GET routes for message tracking
  onionRouter.get("/getLastReceivedEncryptedMessage", (req, res) => {
    res.json({ result: lastReceivedEncryptedMessage });
  });

  onionRouter.get("/getLastReceivedDecryptedMessage", (req, res) => {
    res.json({ result: lastReceivedDecryptedMessage });
  });

  onionRouter.get("/getLastMessageDestination", (req, res) => {
    res.json({ result: lastMessageDestination });
  });

  // ✅ Implement message processing route
  onionRouter.post("/message", async (req, res) => {
    try {
      const { message } = req.body;
      lastReceivedEncryptedMessage = message;

      // Extract encrypted symmetric key & encrypted message
      const encryptedKey = Buffer.from(message.slice(0, 344), "base64");
      const encryptedLayer = message.slice(344);

      // ✅ Correctly decrypt symmetric key using private key
      const symmetricKey = crypto.privateDecrypt(
        {
          key: privateKey, // ✅ Use PEM private key directly
          padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
        },
        encryptedKey
      );

      // ✅ Decrypt the message layer
      const decipher = crypto.createDecipheriv("aes-256-cbc", symmetricKey, Buffer.alloc(16, 0));
      let decrypted = decipher.update(encryptedLayer, "base64", "utf8");
      decrypted += decipher.final("utf8");

      // Extract next destination & remaining message
      const nextDestination = parseInt(decrypted.slice(0, 10), 10);
      lastMessageDestination = nextDestination;
      lastReceivedDecryptedMessage = decrypted.slice(10);

      // Forward message if not final destination
      if (nextDestination >= BASE_ONION_ROUTER_PORT) {
        await axios.post(`http://localhost:${nextDestination}/message`, { message: lastReceivedDecryptedMessage });
      }

      res.sendStatus(200);
    } catch (error: any) {
      console.error("❌ Failed to process message:", error.message);
      res.status(500).json({ error: "Message processing failed" });
    }
  });

  // ✅ Start the server and register node
  const server = onionRouter.listen(BASE_ONION_ROUTER_PORT + nodeId, async () => {
    console.log(`🚀 Onion Router ${nodeId} running on port ${BASE_ONION_ROUTER_PORT + nodeId}`);
    await registerNode(); // Register node AFTER startup
  });

  return server;
}
