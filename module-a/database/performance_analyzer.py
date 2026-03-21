import time
import random
import tracemalloc

import matplotlib.pyplot as plt
import matplotlib.gridspec as gridspec

from bplustree import BPlusTree
from bruteforce import BruteForceDB


# benchmarks bplustree against bruteforcedb across multiple dataset sizes
class PerformanceAnalyzer:
    DEFAULT_SIZES = [100, 1000, 5000, 10000, 25000, 50000, 100000]

    def __init__(self):
        pass

    def _make_pairs(self, n, key_range=None):
        if key_range is None:
            key_range = n * 10
        keys = random.sample(range(key_range), min(n, key_range))
        return [(k, {"id": k, "data": "sample"}) for k in keys]

    def _fresh_trees(self):
        return BPlusTree(), BruteForceDB()

    def benchmark_insert(self, sizes):
        bptree_times = []
        bf_times = []

        for size in sizes:
            pairs = self._make_pairs(size)

            bpt = BPlusTree()
            t0 = time.perf_counter()
            for k, v in pairs:
                bpt.insert(k, v)
            bptree_times.append(time.perf_counter() - t0)

            bfd = BruteForceDB()
            t0 = time.perf_counter()
            for k, v in pairs:
                bfd.insert(k, v)
            bf_times.append(time.perf_counter() - t0)

        return {"sizes": list(sizes), "bptree": bptree_times, "bruteforce": bf_times}

    def benchmark_search(self, sizes):
        max_size = max(sizes)
        pairs = self._make_pairs(max_size)
        all_keys = [k for k, _ in pairs]

        # pre-populate both structures
        bpt = BPlusTree()
        bfd = BruteForceDB()
        for k, v in pairs:
            bpt.insert(k, v)
            bfd.insert(k, v)

        bptree_times = []
        bf_times = []

        for size in sizes:
            search_keys = random.choices(all_keys, k=size)

            t0 = time.perf_counter()
            for k in search_keys:
                bpt.search(k)
            bptree_times.append(time.perf_counter() - t0)

            t0 = time.perf_counter()
            for k in search_keys:
                bfd.search(k)
            bf_times.append(time.perf_counter() - t0)

        return {"sizes": list(sizes), "bptree": bptree_times, "bruteforce": bf_times}

    def benchmark_delete(self, sizes):
        max_size = max(sizes)
        pairs = self._make_pairs(max_size)
        all_keys = [k for k, _ in pairs]

        bptree_times = []
        bf_times = []

        for size in sizes:
            # fresh structures each time so deletions don't stack up
            bpt = BPlusTree()
            bfd = BruteForceDB()
            for k, v in pairs:
                bpt.insert(k, v)
                bfd.insert(k, v)

            delete_keys = random.sample(all_keys, size)

            t0 = time.perf_counter()
            for k in delete_keys:
                bpt.delete(k)
            bptree_times.append(time.perf_counter() - t0)

            t0 = time.perf_counter()
            for k in delete_keys:
                bfd.delete(k)
            bf_times.append(time.perf_counter() - t0)

        return {"sizes": list(sizes), "bptree": bptree_times, "bruteforce": bf_times}

    def benchmark_range_query(self, sizes):
        max_size = max(sizes)
        pairs = self._make_pairs(max_size)
        all_keys = [k for k, _ in pairs]
        min_key = min(all_keys)
        max_key = max(all_keys)

        # pre-populate both structures
        bpt = BPlusTree()
        bfd = BruteForceDB()
        for k, v in pairs:
            bpt.insert(k, v)
            bfd.insert(k, v)

        bptree_times = []
        bf_times = []

        for size in sizes:
            width = max(1, size // 10)
            upper_bound = max(min_key, max_key - width)
            start_keys = [random.randint(min_key, upper_bound) for _ in range(size)]

            t0 = time.perf_counter()
            for sk in start_keys:
                bpt.range_query(sk, sk + width)
            bptree_times.append(time.perf_counter() - t0)

            t0 = time.perf_counter()
            for sk in start_keys:
                bfd.range_query(sk, sk + width)
            bf_times.append(time.perf_counter() - t0)

        return {"sizes": list(sizes), "bptree": bptree_times, "bruteforce": bf_times}

    def benchmark_memory(self, sizes):
        bptree_mem = []
        bf_mem = []

        for size in sizes:
            pairs = self._make_pairs(size)

            tracemalloc.start()
            bpt = BPlusTree()
            for k, v in pairs:
                bpt.insert(k, v)
            _, peak = tracemalloc.get_traced_memory()
            tracemalloc.stop()
            bptree_mem.append(peak / 1024)  # bytes → KB

            tracemalloc.start()
            bfd = BruteForceDB()
            for k, v in pairs:
                bfd.insert(k, v)
            _, peak = tracemalloc.get_traced_memory()
            tracemalloc.stop()
            bf_mem.append(peak / 1024)  # bytes → KB

        return {"sizes": list(sizes), "bptree": bptree_mem, "bruteforce": bf_mem}

    def run_all(self, sizes=None):
        if sizes is None:
            sizes = self.DEFAULT_SIZES

        print("Running insert benchmark...")
        insert_results = self.benchmark_insert(sizes)

        print("Running search benchmark...")
        search_results = self.benchmark_search(sizes)

        print("Running delete benchmark...")
        delete_results = self.benchmark_delete(sizes)

        print("Running range query benchmark...")
        range_results = self.benchmark_range_query(sizes)

        print("Running memory benchmark...")
        memory_results = self.benchmark_memory(sizes)

        print("All benchmarks complete.")
        return {
            "insert": insert_results,
            "search": search_results,
            "delete": delete_results,
            "range_query": range_results,
            "memory": memory_results,
        }

    def plot_results(self, results):
        benchmark_configs = [
            ("insert",      "Insert Performance",      "Time (s)"),
            ("search",      "Search Performance",      "Time (s)"),
            ("delete",      "Delete Performance",      "Time (s)"),
            ("range_query", "Range Query Performance", "Time (s)"),
            ("memory",      "Memory Usage (Insertion)", "Memory (KB)"),
        ]

        fig = plt.figure(figsize=(18, 10))
        fig.suptitle("BPlusTree vs BruteForceDB - Performance Benchmarks",
                     fontsize=16, fontweight="bold", y=1.01)

        gs = gridspec.GridSpec(2, 3, figure=fig, hspace=0.45, wspace=0.35)

        axes_positions = [
            gs[0, 0], gs[0, 1], gs[0, 2],
            gs[1, 0], gs[1, 1],
        ]

        for ax_spec, (key, title, ylabel) in zip(axes_positions, benchmark_configs):
            ax = fig.add_subplot(ax_spec)
            data = results[key]
            sizes = data["sizes"]

            ax.plot(sizes, data["bptree"],
                    marker="o", linewidth=2, label="BPlusTree", color="#4C72B0")
            ax.plot(sizes, data["bruteforce"],
                    marker="s", linewidth=2, label="BruteForce", color="#DD8452",
                    linestyle="--")

            ax.set_title(title, fontsize=12, fontweight="bold")
            ax.set_xlabel("Dataset Size", fontsize=10)
            ax.set_ylabel(ylabel, fontsize=10)
            ax.legend(fontsize=9)
            ax.grid(True, linestyle="--", alpha=0.5)
            ax.set_xticks(sizes)
            ax.tick_params(axis="x", rotation=30)

        # summary table in the last cell
        ax_table = fig.add_subplot(gs[1, 2])
        ax_table.axis("off")

        # ratio of bruteforce / bplustree times at largest size
        col_labels = ["Benchmark", "BPT (last)", "BF (last)", "BF/BPT"]
        table_data = []
        for key, label, _ in benchmark_configs:
            d = results[key]
            bpt_val = d["bptree"][-1]
            bf_val  = d["bruteforce"][-1]
            ratio   = bf_val / bpt_val if bpt_val > 0 else float("inf")
            unit    = "KB" if key == "memory" else "s"
            table_data.append([
                label.replace(" Performance", ""),
                f"{bpt_val:.4f} {unit}",
                f"{bf_val:.4f} {unit}",
                f"{ratio:.2f}×",
            ])

        tbl = ax_table.table(
            cellText=table_data,
            colLabels=col_labels,
            cellLoc="center",
            loc="center",
        )
        tbl.auto_set_font_size(False)
        tbl.set_fontsize(9)
        tbl.scale(1.2, 1.6)
        ax_table.set_title("Summary (largest dataset size)", fontsize=11,
                           fontweight="bold", pad=10)

        plt.tight_layout()
        plt.show()


if __name__ == "__main__":
    analyzer = PerformanceAnalyzer()
    results = analyzer.run_all()
    analyzer.plot_results(results)
