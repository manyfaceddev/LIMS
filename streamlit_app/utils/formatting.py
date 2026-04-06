from datetime import datetime


def format_currency(amount):
    return f"${amount:,.0f}"


def format_date_display(date_str):
    d = datetime.strptime(date_str, "%Y-%m-%d")
    return d.strftime("%b %d, %Y")


def status_color(status):
    return {
        "Draft": "gray",
        "Scheduled": "blue",
        "Active": "green",
        "Completed": "orange",
    }.get(status, "gray")


def status_badge_html(status):
    color_map = {
        "Draft": ("#6c757d", "#fff"),
        "Scheduled": ("#0d6efd", "#fff"),
        "Active": ("#198754", "#fff"),
        "Completed": ("#fd7e14", "#fff"),
    }
    bg, fg = color_map.get(status, ("#6c757d", "#fff"))
    return (
        f'<span style="background-color:{bg};color:{fg};padding:2px 10px;'
        f'border-radius:12px;font-size:0.8em;font-weight:600;">{status}</span>'
    )


def days_until(date_str):
    """Return number of days from today to date_str."""
    today = datetime.now().date()
    target = datetime.strptime(date_str, "%Y-%m-%d").date()
    return (target - today).days
