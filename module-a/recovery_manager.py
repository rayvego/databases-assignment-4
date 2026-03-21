"""
Crash Recovery for Assignment 3 - Module A
============================================
On system restart, this module:
1. Loads persisted B+ Trees from disk (durability baseline)
2. Reads the WAL to find transactions after the last checkpoint
3. Redoes committed transactions that aren't yet on disk
4. Undoes incomplete/aborted transactions to restore consistency

Run:  python3 test_recovery.py
"""

import json
import os
import copy
import time

from db_manager import DatabaseManager
from transaction_manager import TransactionManager
from write_ahead_log import WriteAheadLog
from bplus_persistence import save_tree_to_disk, load_tree_from_disk

# Import B+ Tree classes for serialization
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "database"))
from bplustree import BPlusTree, BPlusTreeNode


# ---------------------------------------------------------------------------
# Recovery Manager
# ---------------------------------------------------------------------------


class RecoveryManager:
    """
    Handles crash recovery by replaying the WAL and restoring B+ Trees
    to a consistent state.
    """

    def __init__(self, db_manager, wal_dir="wal", data_dir="data"):
        """
        Initialize the RecoveryManager.

        Args:
            db_manager: DatabaseManager with tables to recover.
            wal_dir: Directory containing WAL files.
            data_dir: Directory containing persisted B+ Tree snapshots.
        """
        self.db_manager = db_manager
        self.wal_dir = wal_dir
        self.data_dir = data_dir
        os.makedirs(data_dir, exist_ok=True)

    def persist_all_tables(self):
        """
        Save all B+ Trees to disk. Called after COMMIT or periodically
        as a checkpoint.
        """
        for db_name in self.db_manager.databases:
            tables = self.db_manager.databases[db_name]
            for table_name, table in tables.items():
                filepath = os.path.join(self.data_dir, f"{db_name}_{table_name}.json")
                save_tree_to_disk(table.data, filepath, BPlusTreeNode, BPlusTree)

    def load_all_tables(self):
        """
        Load all B+ Trees from disk. Called on system restart.

        Returns:
            bool: True if any tables were loaded, False if no persisted data exists.
        """
        loaded_any = False
        for db_name in self.db_manager.databases:
            tables = self.db_manager.databases[db_name]
            for table_name, table in tables.items():
                filepath = os.path.join(self.data_dir, f"{db_name}_{table_name}.json")
                loaded_tree = load_tree_from_disk(filepath, BPlusTreeNode, BPlusTree)
                if loaded_tree is not None:
                    table.data = loaded_tree
                    loaded_any = True
        return loaded_any

    def recover(self):
        """
        Perform crash recovery:
        1. Load persisted B+ Trees from disk
        2. Read WAL entries after the last checkpoint
        3. Identify committed vs incomplete transactions
        4. Undo incomplete transactions (restore from pre-crash state)

        Returns:
            dict: Recovery report with details of what was done.
        """
        report = {
            "tables_loaded": False,
            "wal_entries_processed": 0,
            "transactions_redone": [],
            "transactions_undone": [],
            "recovered_at": time.time(),
        }

        # STEP 1: Load persisted B+ Trees from disk
        report["tables_loaded"] = self.load_all_tables()

        # STEP 2: Read WAL entries
        wal = WriteAheadLog(log_dir=self.wal_dir)
        entries = wal.read_log()
        report["wal_entries_processed"] = len(entries)

        if not entries:
            return report

        # STEP 3: Classify transactions as committed or incomplete
        committed_tx_ids = set()
        incomplete_tx_ids = set()
        tx_operations = {}  # {tx_id: [operations]}

        for entry in entries:
            tx_id = entry["tx_id"]
            operation = entry["operation"]

            if tx_id not in tx_operations:
                tx_operations[tx_id] = []

            if operation == "COMMIT":
                committed_tx_ids.add(tx_id)
                incomplete_tx_ids.discard(tx_id)
            elif operation == "ABORT":
                incomplete_tx_ids.discard(tx_id)
            elif operation == "BEGIN":
                incomplete_tx_ids.add(tx_id)
            else:
                tx_operations[tx_id].append(entry)

        # STEP 4: Redo committed transactions that may not be on disk
        for tx_id in committed_tx_ids:
            report["transactions_redone"].append(tx_id)
            self._redo_transaction(tx_id, tx_operations.get(tx_id, []))

        # STEP 5: Undo incomplete transactions
        for tx_id in incomplete_tx_ids:
            report["transactions_undone"].append(tx_id)
            self._undo_transaction(tx_id, tx_operations.get(tx_id, []))

        return report

    def _redo_transaction(self, tx_id, operations):
        """
        Redo a committed transaction by replaying each operation in order.

        Idempotent: checks for existing records before INSERT to handle the
        case where data was already persisted before the crash.

        Args:
            tx_id: Transaction ID to redo.
            operations: List of WAL operation entries for this transaction.
        """
        for op in operations:
            operation_type = op["operation"]
            table_name = op["table"]
            key = op["key"]

            if table_name is None:
                continue

            # Use the db_name from the WAL entry, not hardcoded
            db_name = op.get("db_name", "hostel_db")
            result = self.db_manager.get_table(db_name, table_name)
            if not result or result[0] is False:
                continue
            table = result[0]

            if operation_type == "INSERT":
                # Idempotent: only insert if the record doesn't already exist
                new_value = op["new_value"]
                if new_value is not None and table.get(key) is None:
                    table.insert(new_value)
            elif operation_type == "UPDATE":
                new_value = op["new_value"]
                if new_value is not None:
                    table.update(key, new_value)
            elif operation_type == "DELETE":
                table.delete(key)

    def _undo_transaction(self, tx_id, operations):
        """
        Undo an incomplete transaction by reversing each operation in reverse order.

        Since our system uses a no-steal policy (changes only reach disk on commit),
        the persisted B+ Trees loaded from disk should already be clean. However,
        if the WAL contains operations from an incomplete transaction that somehow
        made it into the loaded trees (edge case), we undo them safely by checking
        that the record actually exists before attempting to delete/modify it.

        Args:
            tx_id: Transaction ID to undo.
            operations: List of WAL operation entries for this transaction.
        """
        # Reverse operations in reverse order
        for op in reversed(operations):
            operation_type = op["operation"]
            table_name = op["table"]
            key = op["key"]

            if table_name is None:
                continue

            # Use the db_name from the WAL entry, not hardcoded
            db_name = op.get("db_name", "hostel_db")
            result = self.db_manager.get_table(db_name, table_name)
            if not result or result[0] is False:
                continue
            table = result[0]

            if operation_type == "INSERT":
                # Undo insert: only delete if the record was actually inserted
                existing = table.get(key)
                if existing is not None:
                    table.delete(key)
            elif operation_type == "UPDATE":
                # Undo update: only restore old value if the record exists
                old_value = op["old_value"]
                existing = table.get(key)
                if old_value is not None and existing is not None:
                    table.update(key, old_value)
            elif operation_type == "DELETE":
                # Undo delete: only re-insert if the record was actually deleted
                old_value = op["old_value"]
                existing = table.get(key)
                if old_value is not None and existing is None:
                    table.insert(old_value)
