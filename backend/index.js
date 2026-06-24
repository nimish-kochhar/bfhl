require('dotenv').config();
const express = require('express');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

// Enable CORS for all origins as required by evaluation notes
app.use(cors());

// Parse JSON request bodies
app.use(express.json());

// Root endpoint for basic health check
app.get('/', (req, res) => {
  res.json({ status: 'API is running', endpoint: 'POST /bfhl' });
});

// GET /bfhl endpoint just in case
app.get('/bfhl', (req, res) => {
  res.json({ operation_code: 1 });
});

// POST /bfhl endpoint for processing node hierarchies
app.post('/bfhl', (req, res) => {
  try {
    const userId = process.env.USER_ID || "johndoe_17091999";
    const emailId = process.env.EMAIL_ID || "john.doe@college.edu";
    const collegeRollNumber = process.env.COLLEGE_ROLL_NUMBER || "21CS1001";

    if (!req.body || !Array.isArray(req.body.data)) {
      return res.status(400).json({
        user_id: userId,
        email_id: emailId,
        college_roll_number: collegeRollNumber,
        hierarchies: [],
        invalid_entries: [],
        duplicate_edges: [],
        summary: { total_trees: 0, total_cycles: 0, largest_tree_root: null },
        error: "Invalid request body. 'data' must be an array of node strings."
      });
    }

    const data = req.body.data;
    const invalid_entries = [];
    const seenEdges = new Set();
    const duplicate_edges_set = new Set();
    const validEdges = [];

    // 1. Validate node format and detect duplicates
    for (const item of data) {
      if (typeof item !== 'string') {
        invalid_entries.push(item);
        continue;
      }
      // Rule: Trim whitespace first, then validate
      const trimmed = item.trim();
      if (!trimmed.match(/^[A-Z]->[A-Z]$/)) {
        invalid_entries.push(item);
        continue;
      }
      const [parent, child] = trimmed.split('->');
      if (parent === child) {
        // Self-loop — treated as invalid
        invalid_entries.push(item);
        continue;
      }

      // Valid edge format
      if (seenEdges.has(trimmed)) {
        duplicate_edges_set.add(trimmed);
      } else {
        seenEdges.add(trimmed);
        validEdges.push({ parent, child, edgeStr: trimmed });
      }
    }

    const duplicate_edges = Array.from(duplicate_edges_set);

    // 2. Diamond / multi-parent filtering
    // "Diamond / multi-parent case: if a node has more than one parent (e.g. A->D and B->D), 
    // the first encountered parent edge wins; subsequent parent edges for that child are silently discarded."
    const filteredEdges = [];
    const childToParent = new Map();

    for (const edge of validEdges) {
      if (childToParent.has(edge.child)) {
        // Silently discard subsequent parent edges for that child
        continue;
      } else {
        childToParent.set(edge.child, edge.parent);
        filteredEdges.push(edge);
      }
    }

    // 3. Build graph representations to find connected components (groups)
    const adj = new Map();
    const childrenMap = new Map();
    const inDegree = new Map();
    const allNodes = new Set();

    for (const edge of filteredEdges) {
      allNodes.add(edge.parent);
      allNodes.add(edge.child);

      if (!adj.has(edge.parent)) adj.set(edge.parent, []);
      if (!adj.has(edge.child)) adj.set(edge.child, []);
      adj.get(edge.parent).push(edge.child);
      adj.get(edge.child).push(edge.parent);

      if (!childrenMap.has(edge.parent)) childrenMap.set(edge.parent, []);
      if (!childrenMap.has(edge.child)) childrenMap.set(edge.child, []);
      childrenMap.get(edge.parent).push(edge.child);

      if (!inDegree.has(edge.parent)) inDegree.set(edge.parent, 0);
      if (!inDegree.has(edge.child)) inDegree.set(edge.child, 0);
      inDegree.set(edge.child, inDegree.get(edge.child) + 1);
    }

    // Find connected components (groups) using BFS on undirected graph
    const visited = new Set();
    const groups = [];

    // Iterating in the order nodes appeared in filteredEdges preserves input order
    for (const node of allNodes) {
      if (!visited.has(node)) {
        const compNodes = [];
        const queue = [node];
        visited.add(node);
        while (queue.length > 0) {
          const curr = queue.shift();
          compNodes.push(curr);
          const neighbors = adj.get(curr) || [];
          for (const neighbor of neighbors) {
            if (!visited.has(neighbor)) {
              visited.add(neighbor);
              queue.push(neighbor);
            }
          }
        }
        groups.push({ compNodes });
      }
    }

    // Helper to check for cycles in a directed graph component
    function checkCycle(compNodes) {
      const state = new Map(); // 0 = unvisited, 1 = visiting, 2 = visited
      for (const n of compNodes) state.set(n, 0);

      function dfs(u) {
        state.set(u, 1);
        const children = childrenMap.get(u) || [];
        for (const v of children) {
          if (state.get(v) === 1) return true;
          if (state.get(v) === 0) {
            if (dfs(v)) return true;
          }
        }
        state.set(u, 2);
        return false;
      }

      for (const n of compNodes) {
        if (state.get(n) === 0) {
          if (dfs(n)) return true;
        }
      }
      return false;
    }

    // Helper to build tree object recursively
    function buildTreeObj(curr) {
      const obj = {};
      const children = childrenMap.get(curr) || [];
      children.sort(); // Lexicographical order for predictable, neat output
      for (const child of children) {
        obj[child] = buildTreeObj(child);
      }
      return obj;
    }

    // Helper to calculate depth
    function getDepth(curr) {
      const children = childrenMap.get(curr) || [];
      if (children.length === 0) return 1;
      let maxChildDepth = 0;
      for (const child of children) {
        maxChildDepth = Math.max(maxChildDepth, getDepth(child));
      }
      return 1 + maxChildDepth;
    }

    const hierarchies = [];
    let total_trees = 0;
    let total_cycles = 0;
    let largest_tree_root = null;
    let max_depth = -1;

    for (const group of groups) {
      const compNodes = group.compNodes;
      const has_cycle = checkCycle(compNodes);

      let root = null;
      const candidateRoots = compNodes.filter(n => (inDegree.get(n) || 0) === 0);

      if (candidateRoots.length === 0) {
        // "If a group has no valid root (pure cycle - all nodes appear as children), use the lexicographically smallest node as the root."
        compNodes.sort();
        root = compNodes[0];
      } else {
        candidateRoots.sort();
        root = candidateRoots[0];
      }

      if (has_cycle) {
        hierarchies.push({
          root: root,
          tree: {},
          has_cycle: true
        });
        total_cycles++;
      } else {
        const depth = getDepth(root);
        hierarchies.push({
          root: root,
          tree: { [root]: buildTreeObj(root) },
          depth: depth
        });
        total_trees++;

        if (depth > max_depth) {
          max_depth = depth;
          largest_tree_root = root;
        } else if (depth === max_depth) {
          // "largest_tree_root tiebreaker: if two trees have equal depth, return the lexicographically smaller root."
          if (largest_tree_root === null || root < largest_tree_root) {
            largest_tree_root = root;
          }
        }
      }
    }

    const responsePayload = {
      user_id: userId,
      email_id: emailId,
      college_roll_number: collegeRollNumber,
      hierarchies: hierarchies,
      invalid_entries: invalid_entries,
      duplicate_edges: duplicate_edges,
      summary: {
        total_trees: total_trees,
        total_cycles: total_cycles,
        largest_tree_root: largest_tree_root
      }
    };

    res.json(responsePayload);
  } catch (error) {
    console.error("Error processing request:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
