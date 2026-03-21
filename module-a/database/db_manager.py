from table import Table

class DatabaseManager:
    def __init__(self):
        self.databases = {}  # {db_name: {table_name: Table}}

    def create_database(self, db_name):
        if db_name in self.databases:
            return (False, "Database already exists")
        self.databases[db_name] = {}
        return (True, f"Database '{db_name}' created successfully")

    def delete_database(self, db_name):
        if db_name not in self.databases:
            return (False, "Database not found")
        del self.databases[db_name]
        return (True, f"Database '{db_name}' deleted successfully")

    def list_databases(self):
        return list(self.databases.keys())

    def create_table(self, db_name, table_name, schema, order=8, search_key=None):
        if db_name not in self.databases:
            return (False, "Database not found")
        if table_name in self.databases[db_name]:
            return (False, f"Table '{table_name}' already exists in database '{db_name}'")
        table = Table(name=table_name, schema=schema, order=order, search_key=search_key)
        self.databases[db_name][table_name] = table
        return (True, f"Table '{table_name}' created successfully in database '{db_name}'")

    def delete_table(self, db_name, table_name):
        if db_name not in self.databases:
            return (False, "Database not found")
        if table_name not in self.databases[db_name]:
            return (False, f"Table '{table_name}' not found in database '{db_name}'")
        del self.databases[db_name][table_name]
        return (True, f"Table '{table_name}' deleted successfully from database '{db_name}'")

    def list_tables(self, db_name):
        if db_name not in self.databases:
            return (False, "Database not found")
        return (list(self.databases[db_name].keys()), db_name)

    def get_table(self, db_name, table_name):
        if db_name not in self.databases:
            return (False, "Database not found")
        if table_name not in self.databases[db_name]:
            return (False, f"Table '{table_name}' not found in database '{db_name}'")
        return (self.databases[db_name][table_name], table_name)
