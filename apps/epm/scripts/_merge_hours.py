"""
Helper: merges one MCP response file into ts-hours.json.
Usage: python _merge_hours.py <response_file>
Prints: cursor (or "null") on last line
"""
import json, sys

response_file = sys.argv[1]
hours_file = r'c:\easybim-platform\apps\epm\lib\ts-hours.json'

with open(response_file) as f:
    data = json.load(f)

page = data['boards'][0]['items_page']
cursor = page.get('cursor')
items = page['items']

try:
    with open(hours_file) as f:
        acc = json.load(f)
except FileNotFoundError:
    acc = {}

matched = 0
for item in items:
    cols = {c['id']: c for c in item['column_values']}
    ids = cols.get('board_relation_mkqd3xgf', {}).get('linked_item_ids') or []
    if not ids:
        continue
    ma003_id = ids[0]
    try:
        hours = float(cols.get('numeric', {}).get('text') or '0')
    except:
        hours = 0.0
    if hours > 0:
        acc[ma003_id] = acc.get(ma003_id, 0) + hours
        matched += 1

with open(hours_file, 'w') as f:
    json.dump(acc, f)

print(f'{len(items)} items | {matched} with hours | total IDs: {len(acc)} | total hrs: {sum(acc.values()):.1f}')
print(cursor or 'null')
