from graphviz import Digraph
import math


# node works as both leaf and internal depending on the flag
class BPlusTreeNode:
    def __init__(self, order, is_leaf=True):
        self.order = order
        self.is_leaf = is_leaf
        self.keys = []
        self.values = []  # only used in leaves
        self.children = []  # only used in internal nodes
        self.next = None  # leaf linked list pointer

    def is_full(self):
        # full when keys hit the limit
        return len(self.keys) >= self.order - 1


class BPlusTree:
    def __init__(self, order=8):
        self.order = order
        self.root = BPlusTreeNode(order)  # start as empty leaf

    def search(self, key):
        return self._search(self.root, key)

    def _search(self, node, key):
        if node.is_leaf:
            for i, k in enumerate(node.keys):
                if k == key:
                    return node.values[i]
            return None
        else:
            # find the right child to go into
            i = 0
            while i < len(node.keys) and key >= node.keys[i]:
                i += 1
            return self._search(node.children[i], key)

    def insert(self, key, value):
        root = self.root
        if root.is_full():
            # root full, grow upward
            new_root = BPlusTreeNode(self.order, is_leaf=False)
            new_root.children.append(self.root)
            self.root = new_root
            self._split_child(new_root, 0)
            self._insert_non_full(new_root, key, value)
        else:
            self._insert_non_full(root, key, value)
        return True

    def _insert_non_full(self, node, key, value):
        if node.is_leaf:
            # slide keys right to insert in sorted position
            i = len(node.keys) - 1
            node.keys.append(None)
            node.values.append(None)
            while i >= 0 and node.keys[i] > key:
                node.keys[i + 1] = node.keys[i]
                node.values[i + 1] = node.values[i]
                i -= 1
            node.keys[i + 1] = key
            node.values[i + 1] = value
        else:
            i = len(node.keys) - 1
            while i >= 0 and node.keys[i] > key:
                i -= 1
            i += 1
            if node.children[i].is_full():
                self._split_child(node, i)
                # pick which side to descend into after split
                if key >= node.keys[i]:
                    i += 1
            self._insert_non_full(node.children[i], key, value)

    def _split_child(self, parent, index):
        order = self.order
        child = parent.children[index]
        new_node = BPlusTreeNode(order, is_leaf=child.is_leaf)
        mid = len(child.keys) // 2

        if child.is_leaf:
            # copy-up: middle key stays in leaf and goes to parent
            new_node.keys = child.keys[mid:]
            new_node.values = child.values[mid:]
            child.keys = child.keys[:mid]
            child.values = child.values[:mid]
            # fix linked list
            new_node.next = child.next
            child.next = new_node
            up_key = new_node.keys[0]
        else:
            # push-up: middle key leaves the child
            up_key = child.keys[mid]
            new_node.keys = child.keys[mid + 1 :]
            new_node.children = child.children[mid + 1 :]
            child.keys = child.keys[:mid]
            child.children = child.children[: mid + 1]

        parent.keys.insert(index, up_key)
        parent.children.insert(index + 1, new_node)

    def delete(self, key):
        if self.root is None or len(self.root.keys) == 0:
            return False
        # Check if key exists before attempting deletion
        if self.search(key) is None:
            return False
        self._delete(self.root, key)
        # shrink tree if root emptied out
        if not self.root.is_leaf and len(self.root.keys) == 0:
            self.root = self.root.children[0]
        return True

    def _delete(self, node, key):
        min_keys = math.ceil(self.order / 2) - 1

        if node.is_leaf:
            if key in node.keys:
                idx = node.keys.index(key)
                node.keys.pop(idx)
                node.values.pop(idx)
        else:
            i = 0
            while i < len(node.keys) and key >= node.keys[i]:
                i += 1
            child = node.children[i]
            # make sure child has room before going in
            if len(child.keys) <= min_keys:
                self._fill_child(node, i)
                # recompute i since tree may have shifted
                i = 0
                while i < len(node.keys) and key >= node.keys[i]:
                    i += 1
            self._delete(node.children[i], key)
            # fix separator keys in case we deleted one
            for j in range(len(node.keys)):
                if node.keys[j] == key:
                    successor_leaf = node.children[j + 1]
                    while not successor_leaf.is_leaf:
                        successor_leaf = successor_leaf.children[0]
                    if successor_leaf.keys:
                        node.keys[j] = successor_leaf.keys[0]
                    else:
                        # right subtree gone, clean up
                        node.keys.pop(j)
                        node.children.pop(j + 1)
                    break

    def _fill_child(self, node, index):
        min_keys = math.ceil(self.order / 2) - 1
        # try left, then right, then merge
        if index > 0 and len(node.children[index - 1].keys) > min_keys:
            self._borrow_from_prev(node, index)
        elif (
            index < len(node.children) - 1
            and len(node.children[index + 1].keys) > min_keys
        ):
            self._borrow_from_next(node, index)
        else:
            if index > 0:
                self._merge(node, index - 1)
            else:
                self._merge(node, index)

    def _borrow_from_prev(self, node, index):
        child = node.children[index]
        left_sibling = node.children[index - 1]
        if child.is_leaf:
            # move last of left to front of child
            child.keys.insert(0, left_sibling.keys.pop())
            child.values.insert(0, left_sibling.values.pop())
            node.keys[index - 1] = child.keys[0]
        else:
            # rotate through parent
            child.keys.insert(0, node.keys[index - 1])
            node.keys[index - 1] = left_sibling.keys.pop()
            child.children.insert(0, left_sibling.children.pop())

    def _borrow_from_next(self, node, index):
        child = node.children[index]
        right_sibling = node.children[index + 1]
        if child.is_leaf:
            # move first of right to end of child
            child.keys.append(right_sibling.keys.pop(0))
            child.values.append(right_sibling.values.pop(0))
            node.keys[index] = right_sibling.keys[0]
        else:
            child.keys.append(node.keys[index])
            node.keys[index] = right_sibling.keys.pop(0)
            child.children.append(right_sibling.children.pop(0))

    def _merge(self, node, index):
        left_child = node.children[index]
        right_child = node.children[index + 1]
        if left_child.is_leaf:
            left_child.keys.extend(right_child.keys)
            left_child.values.extend(right_child.values)
            left_child.next = right_child.next
        else:
            # pull separator down then merge
            separator = node.keys[index]
            left_child.keys.append(separator)
            left_child.keys.extend(right_child.keys)
            left_child.children.extend(right_child.children)
        node.keys.pop(index)
        node.children.pop(index + 1)

    def update(self, key, new_value):
        # walk down to the leaf
        node = self.root
        while not node.is_leaf:
            i = 0
            while i < len(node.keys) and key >= node.keys[i]:
                i += 1
            node = node.children[i]
        for i, k in enumerate(node.keys):
            if k == key:
                node.values[i] = new_value
                return True
        return False

    def range_query(self, start_key, end_key):
        result = []
        # descend to start leaf
        node = self.root
        while not node.is_leaf:
            i = 0
            while i < len(node.keys) and start_key >= node.keys[i]:
                i += 1
            node = node.children[i]
        # walk the linked list
        while node is not None:
            for i, k in enumerate(node.keys):
                if k > end_key:
                    return result
                if k >= start_key:
                    result.append((k, node.values[i]))
            node = node.next
        return result

    def get_all(self):
        result = []
        self._get_all(self.root, result)
        return result

    def _get_all(self, node, result):
        if node is None:
            return
        if node.is_leaf:
            for i, k in enumerate(node.keys):
                result.append((k, node.values[i]))
        else:
            for child in node.children:
                self._get_all(child, result)

    def visualize_tree(self, filename=None):
        dot = Digraph(comment="B+ Tree")
        dot.attr(rankdir="TB")
        if self.root:
            self._add_nodes(dot, self.root)
            self._add_edges(dot, self.root)
        if filename:
            dot.render(filename, view=False, format="png", cleanup=True)
        return dot

    def _add_nodes(self, dot, node):
        node_id = str(id(node))
        if node.is_leaf:
            # blue for leaves
            cells = "".join(f'<TD BORDER="1">{k}</TD>' for k in node.keys)
            label = f'<<TABLE BORDER="0" CELLBORDER="0" CELLSPACING="4" BGCOLOR="lightblue"><TR>{cells}</TR></TABLE>>'
            dot.node(node_id, label=label, shape="none")
        else:
            # yellow for internal
            cells = "".join(f'<TD BORDER="1">{k}</TD>' for k in node.keys)
            label = f'<<TABLE BORDER="0" CELLBORDER="0" CELLSPACING="4" BGCOLOR="lightyellow"><TR>{cells}</TR></TABLE>>'
            dot.node(node_id, label=label, shape="none")
        if not node.is_leaf:
            for child in node.children:
                self._add_nodes(dot, child)

    def _add_edges(self, dot, node):
        node_id = str(id(node))
        if not node.is_leaf:
            for child in node.children:
                child_id = str(id(child))
                dot.edge(node_id, child_id)
                self._add_edges(dot, child)
        else:
            # dashed edge for leaf linked list
            if node.next is not None:
                dot.edge(
                    node_id, str(id(node.next)), style="dashed", constraint="false"
                )
