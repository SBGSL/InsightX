# InsightX — Azure Cost Segregation

A Flask web application for uploading daily Azure cost Excel exports, auto-classifying resources, and reporting apportioned customer costs.

## Setup

```bash
pip install flask openpyxl
python seed_master.py   # one-time: seed master resource→type mappings
python app.py           # starts on http://localhost:5000
```

## Usage

1. **Upload** — drag & drop your daily `.xlsx` Azure cost export and set the cost date
2. **Auto-classify** — resources matching the master sheet or learned rules are classified automatically
3. **Manual review** — unknown resources appear with a Type dropdown (3 options); selections are saved for future uploads
4. **Report** — view apportioned customer costs over the last 15 days (configurable), export as CSV
5. **History** — see all uploaded dates with row counts and totals

## Type Segregation Logic

| Type | Rule |
|---|---|
| Customer Attributed (Compute) | AKS VMSS with `sparkpool` node pool |
| Customer Specific (Storage, Read/write) | Storage accounts named after a specific customer/tenant |
| Platform | All shared infrastructure (databases, networking, shared storage, platform node pools) |

## Apportionment Formula

Each customer's compute cost share = `Total Daily Compute Cost × (Customer Storage Cost / Total Storage Cost that day)`, summed across all days in the period.
