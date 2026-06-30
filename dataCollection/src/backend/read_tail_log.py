import sys
import os

log_path = 'logs/app.log'
if not os.path.exists(log_path):
    print(f"Log file not found at {log_path}")
    sys.exit(0)

print(f"Reading last 200 lines of {log_path}:")
try:
    with open(log_path, 'rb') as f:
        # Seek to the end of the file
        f.seek(0, 2)
        size = f.tell()
        # Read the last 150KB to find lines
        offset = min(size, 150 * 1024)
        f.seek(size - offset)
        data = f.read(offset)
        lines = data.decode('utf-8', errors='ignore').splitlines()
        for line in lines[-200:]:
            print(line)
except Exception as e:
    print(f"Error: {e}")
