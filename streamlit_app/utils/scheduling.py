from datetime import datetime, timedelta


def str_to_date(s):
    return datetime.strptime(s, "%Y-%m-%d").date()


def date_to_str(d):
    return d.strftime("%Y-%m-%d")


def compute_end_date(start_str, duration_days):
    start = str_to_date(start_str)
    end = start + timedelta(days=duration_days - 1)
    return date_to_str(end)


def ranges_overlap(a_start, a_end, b_start, b_end):
    return a_start <= b_end and a_end >= b_start


def flatten_bookings(projects):
    """Return flat list of all bookings with project_name and deliverable_name injected."""
    bookings = []
    for p in projects:
        for d in p.get("deliverables", []):
            for b in d.get("bookings", []):
                bookings.append({
                    **b,
                    "project_name": p["name"],
                    "deliverable_name": d["name"],
                })
    return bookings


def check_conflict(all_bookings, equipment_id, start_date, end_date, exclude_id=None):
    """Return list of conflicting bookings."""
    conflicts = []
    for b in all_bookings:
        if b["equipment_id"] != equipment_id:
            continue
        if exclude_id and b["id"] == exclude_id:
            continue
        if ranges_overlap(start_date, end_date, b["start_date"], b["end_date"]):
            conflicts.append(b)
    return conflicts


def find_next_available(all_bookings, equipment_id, requested_start, duration_days, exclude_id=None):
    """Find next available start date with no conflicts.

    Returns (start_date_str, was_rescheduled).
    """
    candidate = requested_start
    for _ in range(730):  # max 2 years
        end = compute_end_date(candidate, duration_days)
        conflicts = check_conflict(all_bookings, equipment_id, candidate, end, exclude_id)
        if not conflicts:
            return candidate, candidate != requested_start
        # Jump to day after latest conflict end
        latest_end = max(c["end_date"] for c in conflicts)
        next_day = str_to_date(latest_end) + timedelta(days=1)
        candidate = date_to_str(next_day)
    return candidate, True


def compute_project_cost(project, equipment_map):
    """Compute total cost for a project."""
    total = 0
    for d in project.get("deliverables", []):
        for b in d.get("bookings", []):
            eq = equipment_map.get(b["equipment_id"])
            if eq:
                total += eq["cost_per_day"] * b["duration_days"]
    return total


def compute_deliverable_cost(deliverable, equipment_map):
    """Compute total cost for a deliverable."""
    total = 0
    for b in deliverable.get("bookings", []):
        eq = equipment_map.get(b["equipment_id"])
        if eq:
            total += eq["cost_per_day"] * b["duration_days"]
    return total
