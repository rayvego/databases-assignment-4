"""
Transaction Manager for Assignment 3 - Module A
================================================
Provides BEGIN, COMMIT, and ROLLBACK support across multiple B+ Tree tables.

Design: snapshot-based transactions
- BEGIN: deep-copy all involved B+ Trees as rollback backups
- Operations: applied immediately to live trees, logged for audit
- COMMIT: discard backups (changes become permanent)
- ROLLBACK: restore B+ Trees from backups (undo all changes)
- Isolation: single-transaction lock (spec-approved: "serialized execution is sufficient")
"""

import copy
import threading
import time
import uuid

from write_ahead_log import WriteAheadLog
from bplus_persistence import save_tree_to_disk, load_tree_from_disk

# Import B+ Tree classes for serialization
import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "database"))
from bplustree import BPlusTree, BPlusTreeNode


class TransactionError(Exception):
    """Raised when a transaction operation is invalid."""

    pass


class TransactionManager:
    """
    Manages ACID transactions across multiple B+ Tree-backed tables.

    Each transaction has a unique ID, tracks its state (active/committed/aborted),
    maintains deep-copy snapshots for rollback, and logs every operation.
    """

    def __init__(self, db_manager, wal_dir="wal", data_dir="data"):
        """
        Initialize the TransactionManager.

        Args:
            db_manager: DatabaseManager instance whose tables will participate
                        in transactions.
            wal_dir: Directory for write-ahead log files. Defaults to 'wal/'.
            data_dir: Directory for persisted B+ Tree snapshots. Defaults to 'data/'.
        """
        self.db_manager = db_manager
        self.active_transactions = {}  # {tx_id: TransactionState}
        self.operation_log = []  # list of all committed operations
        self._lock = threading.Lock()  # thread-safe isolation lock
        self.wal = WriteAheadLog(log_dir=wal_dir)
        self.data_dir = data_dir
        os.makedirs(data_dir, exist_ok=True)

    # ------------------------------------------------------------------
    # Transaction lifecycle
    # ------------------------------------------------------------------

    def begin(self, db_name, table_names):
        """
        Start a new transaction by snapshotting all involved B+ Trees.

        Args:
            db_name: Name of the database containing the tables.
            table_names: List of table names to include in this transaction.

        Returns:
            str: Unique transaction ID.

        Raises:
            TransactionError: If another transaction is active (isolation lock),
                              or if any table is not found.
        """
        # STEP 1: Acquire isolation lock FIRST (prevents orphan BEGIN entries)
        acquired = self._lock.acquire(blocking=False)
        if not acquired:
            raise TransactionError(
                "BeginTransaction: another transaction is already active. "
                "Wait for the current transaction to COMMIT or ROLLBACK before starting a new one."
            )

        # STEP 2: Validate all tables exist
        for table_name in table_names:
            result = self.db_manager.get_table(db_name, table_name)
            if not result or result[0] is False:
                self._lock.release()
                raise TransactionError(
                    f"BeginTransaction: table '{table_name}' not found in database '{db_name}'. "
                    "Ensure all tables exist before starting a transaction."
                )

        # STEP 3: Deep-copy each involved B+ Tree as a rollback snapshot
        snapshots = {}
        for table_name in table_names:
            table, _ = self.db_manager.get_table(db_name, table_name)
            snapshots[table_name] = copy.deepcopy(table.data)

        # STEP 4: Create and register the transaction
        tx_id = str(uuid.uuid4())[:8]
        self.active_transactions[tx_id] = TransactionState(
            tx_id=tx_id,
            db_name=db_name,
            table_names=table_names,
            snapshots=snapshots,
            operation_log=[],
            started_at=time.time(),
        )

        # STEP 5: Log BEGIN to WAL (now that lock is held and snapshots exist)
        self.wal.log_operation(tx_id, "BEGIN", db_name=db_name)

        return tx_id

    def commit(self, tx_id):
        """
        Commit a transaction: log COMMIT, persist to disk, release lock.

        Order matters for WAL-based recovery:
        1. Log COMMIT to WAL (with fsync) - marks transaction as committed
        2. Persist B+ Trees to disk (with fsync) - makes data durable
        3. Release isolation lock

        If crash between steps 1 and 2: recovery redoes from WAL.
        If crash after step 2: data is on disk, no recovery needed.

        Args:
            tx_id: Transaction ID returned by begin().

        Raises:
            TransactionError: If the transaction does not exist or is not active.
        """
        tx = self._get_active_transaction(tx_id)

        try:
            # STEP 1: Log COMMIT to WAL FIRST (with fsync)
            # This marks the transaction as committed - recovery will redo if needed
            self.wal.log_operation(tx_id, "COMMIT", db_name=tx.db_name)

            # STEP 2: Persist all B+ Trees to disk (with fsync)
            self._persist_all_tables()

            # STEP 3: Append all operations to the global committed log
            for op in tx.operation_log:
                self.operation_log.append(op)

            # STEP 4: Discard snapshots (changes in live B+ Trees become permanent)
            tx.state = "committed"
            tx.committed_at = time.time()
        finally:
            # STEP 5: Always release isolation lock, even on error
            self._lock.release()

        return (True, f"Transaction {tx_id} committed successfully")

    def rollback(self, tx_id):
        """
        Rollback a transaction: restore all B+ Trees from snapshots.

        Args:
            tx_id: Transaction ID returned by begin().

        Raises:
            TransactionError: If the transaction does not exist or is not active.
        """
        tx = self._get_active_transaction(tx_id)

        try:
            # STEP 1: Log ABORT to WAL BEFORE restoring
            self.wal.log_operation(tx_id, "ABORT", db_name=tx.db_name)

            # STEP 2: Restore each B+ Tree from its snapshot
            for table_name in tx.table_names:
                table, _ = self.db_manager.get_table(tx.db_name, table_name)
                table.data = copy.deepcopy(tx.snapshots[table_name])

            # STEP 3: Mark as aborted
            tx.state = "aborted"
            tx.aborted_at = time.time()
        finally:
            # STEP 4: Always release isolation lock, even on error
            self._lock.release()

        return (True, f"Transaction {tx_id} rolled back successfully")

    # ------------------------------------------------------------------
    # Transaction operations (used within a transaction)
    # ------------------------------------------------------------------

    def tx_insert(self, tx_id, db_name, table_name, record):
        """
        Insert a record within a transaction.

        Args:
            tx_id: Active transaction ID.
            db_name: Database name.
            table_name: Table name.
            record: Dict representing the record to insert.

        Returns:
            (bool, str): Success status and message or key.
        """
        tx = self._get_active_transaction(tx_id)
        self._validate_table_in_transaction(tx, table_name)

        table, _ = self.db_manager.get_table(db_name, table_name)

        # STEP 1: Apply to live B+ Tree
        ok, result = table.insert(record)

        # STEP 2: Only log to WAL if the operation succeeded
        # This prevents phantom entries from being replayed during recovery
        if ok:
            self.wal.log_operation(
                tx_id,
                "INSERT",
                table=table_name,
                key=record[table.search_key],
                new_value=copy.deepcopy(record),
                db_name=db_name,
            )
            tx.operation_log.append(
                {
                    "type": "INSERT",
                    "table": table_name,
                    "key": record[table.search_key],
                    "record": copy.deepcopy(record),
                    "timestamp": time.time(),
                }
            )
        return (ok, result)

    def tx_update(self, tx_id, db_name, table_name, key, new_record):
        """
        Update a record within a transaction.

        Args:
            tx_id: Active transaction ID.
            db_name: Database name.
            table_name: Table name.
            key: Primary key of the record to update.
            new_record: Dict with updated field values.

        Returns:
            (bool, str): Success status and message.
        """
        tx = self._get_active_transaction(tx_id)
        self._validate_table_in_transaction(tx, table_name)

        table, _ = self.db_manager.get_table(db_name, table_name)

        # Save old value for potential rollback logging
        old_record = table.get(key)

        # STEP 1: Apply to live B+ Tree
        ok, result = table.update(key, new_record)

        # STEP 2: Only log to WAL if the operation succeeded
        if ok:
            self.wal.log_operation(
                tx_id,
                "UPDATE",
                table=table_name,
                key=key,
                old_value=copy.deepcopy(old_record),
                new_value=copy.deepcopy(new_record),
                db_name=db_name,
            )
            tx.operation_log.append(
                {
                    "type": "UPDATE",
                    "table": table_name,
                    "key": key,
                    "old_value": copy.deepcopy(old_record),
                    "new_value": copy.deepcopy(new_record),
                    "timestamp": time.time(),
                }
            )
        return (ok, result)

    def tx_delete(self, tx_id, db_name, table_name, key):
        """
        Delete a record within a transaction.

        Args:
            tx_id: Active transaction ID.
            db_name: Database name.
            table_name: Table name.
            key: Primary key of the record to delete.

        Returns:
            (bool, str): Success status and message.
        """
        tx = self._get_active_transaction(tx_id)
        self._validate_table_in_transaction(tx, table_name)

        table, _ = self.db_manager.get_table(db_name, table_name)

        # Save old value for potential rollback logging
        old_record = table.get(key)

        # STEP 1: Apply to live B+ Tree
        ok, result = table.delete(key)

        # STEP 2: Only log to WAL if the operation succeeded
        if ok:
            self.wal.log_operation(
                tx_id,
                "DELETE",
                table=table_name,
                key=key,
                old_value=copy.deepcopy(old_record),
                db_name=db_name,
            )
            tx.operation_log.append(
                {
                    "type": "DELETE",
                    "table": table_name,
                    "key": key,
                    "old_value": copy.deepcopy(old_record),
                    "timestamp": time.time(),
                }
            )
        return (ok, result)

    # ------------------------------------------------------------------
    # Queries and helpers
    # ------------------------------------------------------------------

    def get_transaction_state(self, tx_id):
        """Return the TransactionState for a given ID, or None if not found."""
        return self.active_transactions.get(tx_id)

    def is_locked(self):
        """Return True if the isolation lock is currently held."""
        return self._lock.locked()

    def get_operation_log(self):
        """Return the global log of all committed operations."""
        return list(self.operation_log)

    def _persist_all_tables(self):
        """
        Persist all B+ Trees to disk for durability.
        Called automatically during commit.
        """
        for db_name in self.db_manager.databases:
            tables = self.db_manager.databases[db_name]
            for table_name, table in tables.items():
                filepath = os.path.join(self.data_dir, f"{db_name}_{table_name}.json")
                save_tree_to_disk(table.data, filepath, BPlusTreeNode, BPlusTree)

    def _load_all_tables(self):
        """
        Load all B+ Trees from disk. Called during recovery.

        Returns:
            bool: True if any tables were loaded from disk.
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

    def _get_active_transaction(self, tx_id):
        """
        Retrieve an active transaction by ID.

        Raises:
            TransactionError: If the transaction is not found or not active.
        """
        tx = self.active_transactions.get(tx_id)
        if tx is None:
            raise TransactionError(
                f"GetTransaction: transaction '{tx_id}' not found. "
                "Start a transaction with BEGIN before performing operations."
            )
        if tx.state != "active":
            raise TransactionError(
                f"GetTransaction: transaction '{tx_id}' is {tx.state}, not active. "
                "Only active transactions can be modified."
            )
        return tx

    def _validate_table_in_transaction(self, tx, table_name):
        """
        Verify that a table is part of the current transaction.

        Raises:
            TransactionError: If the table is not in the transaction's table list.
        """
        if table_name not in tx.table_names:
            raise TransactionError(
                f"ValidateTable: table '{table_name}' is not part of transaction '{tx.tx_id}'. "
                f"Transaction tables: {tx.table_names}. "
                "Include all tables you plan to modify when calling BEGIN."
            )


class TransactionState:
    """
    Tracks the state of a single transaction.

    Holds snapshots of all involved B+ Trees for rollback, a log of operations
    performed, and timing information.
    """

    def __init__(
        self, tx_id, db_name, table_names, snapshots, operation_log, started_at
    ):
        self.tx_id = tx_id
        self.db_name = db_name
        self.table_names = table_names
        self.snapshots = snapshots  # {table_name: deepcopy of BPlusTree}
        self.operation_log = operation_log  # list of operation dicts
        self.state = "active"  # active | committed | aborted
        self.started_at = started_at
        self.committed_at = None
        self.aborted_at = None

    def summary(self):
        """Return a human-readable summary of this transaction."""
        lines = [
            f"Transaction {self.tx_id}",
            f"  State:      {self.state}",
            f"  Database:   {self.db_name}",
            f"  Tables:     {', '.join(self.table_names)}",
            f"  Operations: {len(self.operation_log)}",
            f"  Started:    {self.started_at:.4f}",
        ]
        if self.committed_at:
            lines.append(f"  Committed:  {self.committed_at:.4f}")
        if self.aborted_at:
            lines.append(f"  Aborted:    {self.aborted_at:.4f}")
        return "\n".join(lines)
