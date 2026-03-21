"""
B+ Tree Persistence - save and load B+ Trees to/from disk.
============================================================
Uses JSON serialization so the entire tree structure (nodes, keys, values,
children, leaf linked-list pointers) survives process restarts.
"""

import json
import os


def serialize_bplustree(tree):
    """
    Serialize a BPlusTree to a JSON-compatible dict.

    Args:
        tree: BPlusTree instance.

    Returns:
        dict: Serializable representation of the entire tree.
    """
    return {
        "order": tree.order,
        "root": _serialize_node(tree.root),
    }


def _serialize_node(node):
    """Recursively serialize a BPlusTreeNode and all its descendants."""
    if node is None:
        return None

    result = {
        "order": node.order,
        "is_leaf": node.is_leaf,
        "keys": node.keys,
        "values": node.values if node.is_leaf else None,
        "children": [_serialize_node(c) for c in node.children]
        if not node.is_leaf
        else None,
        "next_key": None,  # will be resolved during deserialization
    }

    return result


def deserialize_bplustree(data, node_class, tree_class):
    """
    Reconstruct a BPlusTree from a serialized dict.

    Args:
        data: Dict produced by serialize_bplustree.
        node_class: BPlusTreeNode class constructor.
        tree_class: BPlusTree class constructor.

    Returns:
        BPlusTree: Fully reconstructed tree with leaf linked-list restored.
    """
    tree = tree_class(order=data["order"])
    tree.root = _deserialize_node(data["root"], node_class)

    # Rebuild leaf linked-list pointers
    _rebuild_leaf_links(tree.root)

    return tree


def _deserialize_node(data, node_class):
    """Recursively deserialize a node dict back into a BPlusTreeNode."""
    if data is None:
        return None

    node = node_class(order=data["order"], is_leaf=data["is_leaf"])
    node.keys = data["keys"]

    if data["is_leaf"]:
        node.values = data["values"]
    else:
        node.children = [_deserialize_node(c, node_class) for c in data["children"]]

    return node


def _rebuild_leaf_links(root):
    """
    Walk the tree to find all leaf nodes in left-to-right order,
    then link them via their .next pointers.
    """
    leaves = []
    _collect_leaves(root, leaves)

    for i in range(len(leaves) - 1):
        leaves[i].next = leaves[i + 1]
    if leaves:
        leaves[-1].next = None


def _collect_leaves(node, leaves):
    """Depth-first traversal collecting all leaf nodes in order."""
    if node is None:
        return
    if node.is_leaf:
        leaves.append(node)
    else:
        for child in node.children:
            _collect_leaves(child, leaves)


def save_tree_to_disk(tree, filepath, node_class, tree_class):
    """
    Serialize and save a BPlusTree to a JSON file atomically.

    Uses a temporary file + os.replace to prevent corruption if a crash
    occurs during the write. The target file is never partially written.

    Args:
        tree: BPlusTree instance.
        filepath: Path to the output JSON file.
        node_class: BPlusTreeNode class.
        tree_class: BPlusTree class.
    """
    data = serialize_bplustree(tree)
    os.makedirs(
        os.path.dirname(filepath) if os.path.dirname(filepath) else ".", exist_ok=True
    )
    # Write to temporary file first, then atomically replace
    tmp_path = filepath + ".tmp"
    with open(tmp_path, "w") as f:
        json.dump(data, f)
        f.flush()
        os.fsync(f.fileno())
    os.replace(tmp_path, filepath)


def load_tree_from_disk(filepath, node_class, tree_class):
    """
    Load and reconstruct a BPlusTree from a JSON file.

    Args:
        filepath: Path to the JSON file.
        node_class: BPlusTreeNode class.
        tree_class: BPlusTree class.

    Returns:
        BPlusTree: Reconstructed tree, or None if file doesn't exist.
    """
    if not os.path.exists(filepath):
        return None

    with open(filepath, "r") as f:
        data = json.load(f)

    return deserialize_bplustree(data, node_class, tree_class)
