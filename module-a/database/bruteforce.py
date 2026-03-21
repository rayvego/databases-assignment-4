class BruteForceDB:
    # plain list, no indexing, all ops are O(n) - used for comparison

    def __init__(self):
        self.data = []  # list of (key, value) tuples

    def insert(self, key, value):
        self.data.append((key, value))

    def search(self, key):
        # scan the whole thing
        for k, v in self.data:
            if k == key:
                return v
        return None

    def update(self, key, new_value):
        for i, (k, v) in enumerate(self.data):
            if k == key:
                self.data[i] = (key, new_value)
                return True
        return False

    def delete(self, key):
        for i, (k, v) in enumerate(self.data):
            if k == key:
                del self.data[i]
                return True
        return False

    def range_query(self, start_key, end_key):
        return [(k, v) for k, v in self.data if start_key <= k <= end_key]

    def get_all(self):
        return list(self.data)
