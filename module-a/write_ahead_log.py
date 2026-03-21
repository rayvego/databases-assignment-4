"""
Write-Ahead Log (WAL) for Assignment 3 - Module A
==================================================
Logs every transaction operation to disk BEFORE it is applied to the B+ Trees.
This enables crash recovery: on restart, the WAL is replayed to redo committed
transactions and undo incomplete ones.

Log format (one JSON object per line):
  {
    "lsn": <int>,              -- log sequence number (monotonically increasing)
    "tx_id": <str>,            -- transaction ID
    "operation": <str>,        -- BEGIN, INSERT, UPDATE, DELETE, COMMIT, ABORT
    "table": <str>,            -- table name (null for BEGIN/COMMIT/ABORT)
    "key": <any>,              -- primary key (null for BEGIN/COMMIT/ABORT)
    "old_value": <dict|null>,  -- record before the operation
    "new_value": <dict|null>,  -- record after the operation
    "timestamp": <float>       -- Unix timestamp
  }
"""

import json
import os
import time


class WriteAheadLog:
    """
    File-based write-ahead log for crash recovery.

    Every log entry is flushed to disk before the corresponding operation
    is applied to the B+ Trees, ensuring durability.
    """

    def __init__(self, log_dir="wal"):
        """
        Initialize the WAL.

        Args:
            log_dir: Directory to store WAL files. Defaults to 'wal/'.
        """
        self.log_dir = log_dir
        self.log_file = os.path.join(log_dir, "wal.log")
        self.checkpoint_file = os.path.join(log_dir, "checkpoint.json")
        self._next_lsn = 1

        os.makedirs(log_dir, exist_ok=True)

        # Determine the next LSN from existing log
        if os.path.exists(self.log_file):
            with open(self.log_file, "r") as f:
                for line in f:
                    line = line.strip()
                    if line:
                        entry = json.loads(line)
                        self._next_lsn = max(self._next_lsn, entry["lsn"] + 1)

    def log_operation(
        self,
        tx_id,
        operation,
        table=None,
        key=None,
        old_value=None,
        new_value=None,
        db_name=None,
    ):
        """
        Write a log entry to disk.

        Args:
            tx_id: Transaction ID.
            operation: One of BEGIN, INSERT, UPDATE, DELETE, COMMIT, ABORT.
            table: Table name (null for BEGIN/COMMIT/ABORT).
            key: Primary key affected (null for BEGIN/COMMIT/ABORT).
            old_value: Record state before the operation.
            new_value: Record state after the operation.
            db_name: Database name (needed for recovery to locate the right table).

        Returns:
            int: The log sequence number (LSN) of this entry.
        """
        entry = {
            "lsn": self._next_lsn,
            "tx_id": tx_id,
            "operation": operation,
            "table": table,
            "key": key,
            "old_value": old_value,
            "new_value": new_value,
            "db_name": db_name,
            "timestamp": time.time(),
        }

        # Append to file and flush to disk
        with open(self.log_file, "a") as f:
            f.write(json.dumps(entry) + "\n")
            f.flush()
            os.fsync(f.fileno())

        lsn = self._next_lsn
        self._next_lsn += 1
        return lsn

    def read_log(self):
        """
        Read all log entries from the WAL file.

        Returns:
            list[dict]: All log entries in order of LSN.
        """
        entries = []
        if not os.path.exists(self.log_file):
            return entries

        with open(self.log_file, "r") as f:
            for line in f:
                line = line.strip()
                if line:
                    entries.append(json.loads(line))

        return entries

    def save_checkpoint(self, active_transactions, committed_transactions):
        """
        Save a checkpoint recording which transactions are active vs committed.

        Args:
            active_transactions: Set of transaction IDs that are still active.
            committed_transactions: Set of transaction IDs that have committed.
        """
        checkpoint = {
            "lsn": self._next_lsn - 1,
            "active_transactions": list(active_transactions),
            "committed_transactions": list(committed_transactions),
            "timestamp": time.time(),
        }

        with open(self.checkpoint_file, "w") as f:
            json.dump(checkpoint, f, indent=2)
            f.flush()
            os.fsync(f.fileno())

    def load_checkpoint(self):
        """
        Load the most recent checkpoint.

        Returns:
            dict or None: Checkpoint data, or None if no checkpoint exists.
        """
        if not os.path.exists(self.checkpoint_file):
            return None

        with open(self.checkpoint_file, "r") as f:
            return json.load(f)

    def clear(self):
        """Delete the WAL file and checkpoint. Used for testing."""
        if os.path.exists(self.log_file):
            os.remove(self.log_file)
        if os.path.exists(self.checkpoint_file):
            os.remove(self.checkpoint_file)
