import os, tempfile

# Telemetry/limit tests write rows: keep them out of the dev database. Must run before app.db is imported.
os.environ["ODYSSEY_DB"] = os.path.join(tempfile.mkdtemp(), "test.sqlite")
os.environ.pop("DATABASE_URL", None)
