import sqlite3

def add_cols(db_path):
    try:
        conn = sqlite3.connect(db_path)
        conn.execute("ALTER TABLE memory_log ADD COLUMN content TEXT")
        conn.execute("ALTER TABLE memory_log ADD COLUMN image_filename TEXT")
        conn.commit()
        conn.close()
        print(f"Success on {db_path}!")
    except Exception as e:
        print(f"Failed on {db_path}: {e}")

add_cols("instance/db.sqlite")
add_cols("db.sqlite")
