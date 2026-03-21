"""
Module B: Concurrent Workload & Stress Testing
===============================================
Python scripts that hit the existing Next.js APIs to test:
- Concurrent user simulation
- Race conditions on critical operations (room allocation)
- Failure simulation under load
- Stress testing (hundreds/thousands of requests)

Usage:
  python3 stress/concurrent_test.py          # Concurrent user simulation
  python3 stress/race_condition_test.py      # Race condition testing
  python3 stress/failure_simulation.py       # Failure simulation
  python3 stress/stress_test.py              # Stress testing (1000+ requests)

All scripts expect the Next.js dev server running on http://localhost:3000.
"""
