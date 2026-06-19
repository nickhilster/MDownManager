import { FileRecord } from "./tauri";

export interface DirNode {
  type: "dir";
  name: string;
  fullPath: string;
  children: TreeNode[];
  fileCount: number;
}

export interface FileNode {
  type: "file";
  name: string;
  file: FileRecord;
}

export type TreeNode = DirNode | FileNode;

export function buildTree(files: FileRecord[], vaultPath: string): DirNode {
  const root: DirNode = { type: "dir", name: "", fullPath: vaultPath, children: [], fileCount: 0 };

  for (const file of files) {
    const normalized = file.path.replace(/\\/g, "/");
    const base = vaultPath.replace(/\\/g, "/").replace(/\/$/, "");
    const rel = normalized.startsWith(base)
      ? normalized.slice(base.length).replace(/^\//, "")
      : normalized;

    const parts = rel.split("/").filter(Boolean);
    let cur = root;

    for (let i = 0; i < parts.length - 1; i++) {
      const part = parts[i];
      let dir = cur.children.find(
        (c): c is DirNode => c.type === "dir" && c.name === part
      );
      if (!dir) {
        dir = { type: "dir", name: part, fullPath: [base, ...parts.slice(0, i + 1)].join("/"), children: [], fileCount: 0 };
        cur.children.push(dir);
      }
      cur = dir;
    }

    const fileName = parts[parts.length - 1] ?? file.path;
    cur.children.push({ type: "file", name: file.title ?? fileName, file });
  }

  function sort(node: DirNode) {
    node.children.sort((a, b) => {
      if (a.type !== b.type) return a.type === "dir" ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
    let count = 0;
    for (const child of node.children) {
      if (child.type === "dir") { sort(child); count += child.fileCount; }
      else count += 1;
    }
    node.fileCount = count;
  }
  sort(root);
  return root;
}
