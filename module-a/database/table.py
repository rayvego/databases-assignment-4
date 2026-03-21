from bplustree import BPlusTree

class Table:
    def __init__(self, name, schema, order=8, search_key=None):
        self.name = name
        self.schema = schema      # {column: type}
        self.order = order
        self.data = BPlusTree(order=order)
        self.search_key = search_key  # column used as tree key

    def validate_record(self, record):
        # check all fields exist and have right types
        for col, expected_type in self.schema.items():
            if col not in record:
                return (False, f"Missing field: '{col}'")
            if not isinstance(record[col], expected_type):
                return (False, f"Type mismatch for field '{col}': expected {expected_type.__name__}, got {type(record[col]).__name__}")
        return (True, "Valid")

    def insert(self, record):
        valid, msg = self.validate_record(record)
        if not valid:
            return (False, msg)
        self.data.insert(record[self.search_key], record)
        return (True, record[self.search_key])

    def get(self, record_id):
        return self.data.search(record_id)

    def get_all(self):
        return self.data.get_all()

    def update(self, record_id, new_record):
        valid, msg = self.validate_record(new_record)
        if not valid:
            return (False, msg)
        updated = self.data.update(record_id, new_record)
        if updated:
            return (True, "Record updated")
        return (False, "Record not found")

    def delete(self, record_id):
        if self.data.search(record_id) is None:
            return (False, "Record not found")
        self.data.delete(record_id)
        return (True, "Record deleted")

    def range_query(self, start_value, end_value):
        return self.data.range_query(start_value, end_value)
