"""
Seed the resource_type_map table from the master Excel sheet.
Run once: python seed_master.py
"""
import os, sqlite3, openpyxl

DB_PATH = os.path.join(os.path.dirname(__file__), 'data', 'insightx.db')
MASTER  = os.path.join(os.path.dirname(__file__), 'data', 'master.xlsx')

def seed(xlsx_path=MASTER):
    wb = openpyxl.load_workbook(xlsx_path, data_only=True)
    ws = wb.active
    headers = [str(ws.cell(1, c).value or '').strip() for c in range(1, ws.max_column+1)]
    col = {h.lower(): i+1 for i, h in enumerate(headers)}

    db = sqlite3.connect(DB_PATH)
    count = 0
    for r in range(2, ws.max_row+1):
        resource = str(ws.cell(r, col.get('resource', 1)).value or '').strip()
        t        = str(ws.cell(r, col.get('type', ws.max_column)).value or '').strip()
        if resource and t:
            db.execute(
                'INSERT OR REPLACE INTO resource_type_map (resource_key, type, source) VALUES (?,?,?)',
                (resource.lower(), t, 'master')
            )
            count += 1
    db.commit()
    db.close()
    print(f'Seeded {count} resource→type mappings from master.')

if __name__ == '__main__':
    seed()
