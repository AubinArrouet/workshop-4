import bodyParser from "body-parser";
import express, { Request, Response } from "express";
import { REGISTRY_PORT } from "../config";

export type Node = { nodeId: number; pubKey: string };

export type RegisterNodeBody = {
  nodeId: number;
  pubKey: string;
};

export type GetNodeRegistryBody = {
  nodes: Node[];
};

const nodes: Node[] = []; // In-memory storage for registered nodes

export async function launchRegistry() {
  const _registry = express();
  _registry.use(express.json());
  _registry.use(bodyParser.json());

  // ✅ Status route
  _registry.get("/status", (req, res) => {
    res.send("live");
  });

  // ✅ Register a node
  // In registry.ts, update the validation in the /registerNode route
_registry.post("/registerNode", (req: Request, res: Response) => {
  try {
    const { nodeId, pubKey } = req.body as RegisterNodeBody;
    if (nodeId === undefined || !pubKey) {
      return res.status(400).json({ error: "Missing nodeId or pubKey" });
    }
    
    // Change this validation to check for base64 format
    // The test expects exactly 392 characters of base64
    if (!/^[A-Za-z0-9+/]{392}$/.test(pubKey)) {
      return res.status(400).json({ error: "Invalid public key format" });
    }
    
    if (nodes.some((node) => node.nodeId === nodeId)) {
      return res.status(400).json({ error: "Node already registered" });
    }
    
    nodes.push({ nodeId, pubKey });
    console.log(`✅ Node ${nodeId} registered successfully.`);
    return res.status(200).json({ message: "Node registered successfully" });
  } catch (error) {
    console.error(`❌ Error registering node:`, error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
});
  // ✅ Retrieve registered nodes
  _registry.get("/getNodeRegistry", (req, res) => {
    return res.json({ nodes });
  });

  const server = _registry.listen(REGISTRY_PORT, () => {
    console.log(`📌 Registry is listening on port ${REGISTRY_PORT}`);
  });

  return server;
}
